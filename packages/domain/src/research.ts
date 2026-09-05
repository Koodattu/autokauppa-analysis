import type postgres from "postgres";
import { researchResponseSchema, datasetOverviewResponseSchema, type ListingSearchQuery } from "@nettiauto/schemas";
import { buildCompletedRunTimeWhere, buildFilterWhere } from "./product";
import { categorySql } from "./vehicle-categories";

type Sql = postgres.Sql<Record<string, unknown>>;
export async function findSourceListing(sql: Sql, sourceId: string) {
  const [row] = await sql<{ listingId: string }[]>`select id as "listingId" from listings where source = 'nettiauto' and source_listing_id = ${sourceId}`;
  return row ?? null;
}
const fuel = categorySql("s.fuel_type_source_label", "fuel");
const transmission = categorySql("s.transmission_source_label", "transmission");
const stats = `count(*)::int as count,
  (percentile_cont(0.5) within group (order by price))::int as median,
  (percentile_cont(0.25) within group (order by price))::int as p25,
  (percentile_cont(0.75) within group (order by price))::int as p75`;

export async function getPriceResearch(sql: Sql, query: ListingSearchQuery) {
  const historical = Boolean(query.from || query.to);
  const runs = buildCompletedRunTimeWhere(query);
  const scope = buildFilterWhere(query, {
    startIndex: historical ? runs.params.length : 0,
    availabilityExpression: "s.research_availability",
  });
  const params = [...(historical ? runs.params : []), ...scope.params];
  const order = query.sort === "priceAsc" ? "price asc nulls last, listing_id" :
    query.sort === "priceDesc" ? "price desc nulls last, listing_id" :
    query.sort === "mileageAsc" ? "mileage_km asc nulls last, listing_id" :
    query.sort === "mileageDesc" ? "mileage_km desc nulls last, listing_id" :
    query.sort === "yearDesc" ? "year_model desc nulls last, listing_id" : "research_seen_at desc, listing_id";
  const [result] = await sql.unsafe(`
    with history_extent as (
      select min(finished_at)::text as first, max(finished_at)::text as last
      from crawl_runs where status = 'completed' and is_complete and finished_at is not null
    ), selected_runs as (
      ${historical ? `select distinct on (cr.search_query_id) cr.* from crawl_runs cr
        ${runs.whereSql} order by cr.search_query_id, cr.finished_at desc, cr.id desc` :
        "select * from crawl_runs where false"}
    ), selected_sightings as (
      select distinct on (sighting.listing_id) sighting.*
      from selected_runs run join listing_sightings sighting on sighting.crawl_run_id = run.id
      order by sighting.listing_id, sighting.seen_at desc, sighting.id desc
    ), snapshots as (
      ${historical ? `select snapshot.*, snapshot.availability as research_availability,
        sighting.seen_at as research_seen_at
        from selected_sightings sighting
        join lateral (
          select s.* from listing_snapshots s where s.listing_id = sighting.listing_id
            and s.observed_at <= sighting.seen_at
          order by s.observed_at desc, (s.raw_listing_record_id = sighting.raw_listing_record_id) desc,
            s.created_at desc, s.id desc limit 1
        ) snapshot on true` : `select snapshot.*, l.current_availability as research_availability,
          l.last_seen_at as research_seen_at from listings l
          join listing_snapshots snapshot on snapshot.id = l.latest_snapshot_id`}
    ), cohort as materialized (
      select s.*, l.source_listing_id, l.first_seen_at,
        case when s.research_availability = 'active' then nullif(s.asking_price_eur, 0)
          when s.research_availability = 'sold' then nullif(s.observed_sold_price_eur, 0) end as price,
        ${fuel} as fuel, ${transmission} as transmission
      from snapshots s join listings l on l.id = s.listing_id ${scope.whereSql}
    ), priced as (select * from cohort where price > 0),
    band_width as (select greatest(1000, ceil(coalesce(percentile_cont(0.95) within group (order by price), 10000) / 10000) * 1000)::int as width from priced),
    bands as (select least(10, floor(price / width))::int as band, width, count(*)::int as count from priced cross join band_width group by band, width),
    evidence as (select * from cohort order by ${order} limit 25 offset $${params.length + 1}),
    point_sample as (select listing_id, year_model, mileage_km, price from priced
      where mileage_km between 0 and 2000000 order by md5(listing_id::text), listing_id limit 300)
    select
      '${historical ? "historical" : "current"}' as mode,
      jsonb_build_object(
        'lastRelevantCrawlAt', ${historical ? "(select max(finished_at)::text from selected_runs)" : "(select max(research_seen_at)::text from cohort)"},
        'sampleSize', (select count(*)::int from cohort),
        'includesCurrent', ${historical ? "exists(select 1 from selected_runs where crawl_kind = 'current')" : "exists(select 1 from cohort where research_availability = 'active')"},
        'includesSold', ${historical ? "exists(select 1 from selected_runs where crawl_kind = 'sold')" : "exists(select 1 from cohort where research_availability = 'sold')"},
        'dataSource', case when exists(select 1 from cohort where normalized_data ? 'detailParserVersion') then 'search_and_detail_data' else 'search_result_data' end,
        'completeness', ${historical ? `case when not exists(select 1 from selected_runs) then 'unknown'
          when '${query.availability}' = 'all' and (select count(distinct crawl_kind) from selected_runs) < 2 then 'partial'
          else 'complete' end` : "'unknown'"}
      ) as coverage,
      ${historical ? "(select min(finished_at)::text from selected_runs)" : "(select min(research_seen_at)::text from cohort)"} as "observedFrom",
      ${historical ? "(select max(finished_at)::text from selected_runs)" : "(select max(research_seen_at)::text from cohort)"} as "observedTo",
      (select first from history_extent) as "historyFrom", (select last from history_extent) as "historyTo",
      (select to_jsonb(summary) from (select ${stats},
        (percentile_cont(0.5) within group(order by mileage_km) filter(where mileage_km between 0 and 2000000))::int as "medianMileage",
        (percentile_cont(0.5) within group(order by year_model))::int as "medianYear" from priced) summary) as summary,
      (select jsonb_build_object('mileage', count(*) filter(where mileage_km between 0 and 2000000), 'year', count(year_model),
        'fuel', count(fuel), 'transmission', count(transmission), 'body', count(body_type_source_label)) from cohort) as fields,
      coalesce((select jsonb_agg(jsonb_build_object('from', band * width, 'to', case when band < 10 then (band + 1) * width end, 'count', count) order by band) from bands), '[]') as "priceBands",
      coalesce((select jsonb_agg(to_jsonb(cells) order by year, "mileageFrom") from (
        select year_model as year, (floor(mileage_km / 25000.0) * 25000)::int as "mileageFrom", ${stats}
        from priced where year_model is not null and mileage_km between 0 and 2000000 group by year_model, "mileageFrom"
      ) cells), '[]') as "yearMileage",
      ${[['fuels', 'fuel'], ['transmissions', 'transmission'], ['bodies', 'body_type_source_label']].map(([key, col]) => `coalesce((select jsonb_agg(to_jsonb(groups) order by count desc, label) from (
        select ${col} as label, ${stats},
          (percentile_cont(0.5) within group (order by mileage_km) filter (where mileage_km between 0 and 2000000))::int as "medianMileage",
          (percentile_cont(0.5) within group (order by year_model))::int as "medianYear"
        from priced where ${col} is not null group by ${col}
      ) groups), '[]') as "${key}"`).join(",\n")},
      coalesce((select jsonb_agg(to_jsonb(models) order by count desc, make, model) from (
        select make_source_label as make, model_source_label as model, ${stats} from priced
        where make_source_label is not null and model_source_label is not null
        group by make_source_label, model_source_label order by count desc, make, model limit 12
      ) models), '[]') as models,
      coalesce((select jsonb_agg(jsonb_build_object(
        'listingId', listing_id, 'sourceListingId', source_listing_id, 'make', make_source_label, 'model', model_source_label,
        'yearModel', year_model, 'availability', research_availability, 'askingPriceEur', case when research_availability = 'active' then price end,
        'observedSoldPriceEur', case when research_availability = 'sold' then price end, 'mileageKm', mileage_km,
        'seller', seller_source_label, 'sellerType', seller_type_source_label, 'sourceUpdatedDate', source_updated_date::text,
        'lastSeenAt', research_seen_at::text, 'fuelType', fuel, 'transmission', transmission, 'bodyType', body_type_source_label
      ) order by ${order}) from evidence), '[]') as evidence,
      coalesce((select jsonb_agg(jsonb_build_object('listingId', listing_id, 'year', year_model, 'mileage', mileage_km, 'price', price)) from point_sample), '[]') as points,
      $${params.length + 2}::int as "evidencePage",
      greatest(1, ceil((select count(*) from cohort) / 25.0))::int as "evidencePages"
  `, [...params, (query.page - 1) * 25, query.page]);
  return researchResponseSchema.parse(result);
}

export async function getDatasetOverview(sql: Sql) {
  const [result] = await sql.unsafe(`
    with latest as (select l.*, s.asking_price_eur from listings l join listing_snapshots s on s.id = l.latest_snapshot_id),
    anchor as (select max(last_seen_at) as at from latest where current_availability = 'active'),
    changes as (
      select listing_id, observed_at, asking_price_eur,
        lag(asking_price_eur) over(partition by listing_id order by observed_at, created_at, id) as previous
      from listing_snapshots where availability = 'active' and asking_price_eur > 0
    )
    select count(*) filter(where current_availability = 'active')::int as current,
      count(*) filter(where current_availability = 'sold')::int as archived,
      (percentile_cont(0.5) within group(order by asking_price_eur) filter(where current_availability = 'active' and asking_price_eur > 0))::int as median,
      (percentile_cont(0.25) within group(order by asking_price_eur) filter(where current_availability = 'active' and asking_price_eur > 0))::int as p25,
      (percentile_cont(0.75) within group(order by asking_price_eur) filter(where current_availability = 'active' and asking_price_eur > 0))::int as p75,
      count(*) filter(where current_availability = 'active' and first_seen_at >= (select at - interval '7 days' from anchor))::int as "firstObserved",
      (select count(distinct listing_id)::int from changes where asking_price_eur < previous and observed_at >= (select at - interval '7 days' from anchor)
        and observed_at <= (select at from anchor) and listing_id in (select id from latest where current_availability = 'active')) as reduced,
      (select at::text from anchor) as "updatedAt", (select (at - interval '7 days')::text from anchor) as "activityFrom",
      (select min(finished_at)::text from crawl_runs where status = 'completed' and is_complete) as "historyFrom",
      (select max(finished_at)::text from crawl_runs where status = 'completed' and is_complete) as "historyTo"
    from latest
  `);
  return datasetOverviewResponseSchema.parse(result);
}
