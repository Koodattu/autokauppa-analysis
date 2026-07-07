import type postgres from "postgres";
import type { ListingFiltersQuery, ListingSearchQuery } from "@nettiauto/schemas";

export interface CoverageMetadata {
  lastRelevantCrawlAt: string | null;
  sampleSize: number;
  includesCurrent: boolean;
  includesSold: boolean;
  dataSource: "search_result_data";
  completeness: "complete" | "partial" | "unknown";
}

export interface FilterMetadata {
  makes: string[];
  models: string[];
  yearRange: { min: number | null; max: number | null };
  sellerTypes: string[];
  availability: Array<"current" | "sold" | "all">;
  coverage: CoverageMetadata;
}

export interface MarketOverTimePoint {
  bucket: string;
  listingCount: number;
  activeCount: number;
  soldCount: number;
  newListingCount: number;
  medianAskingPriceEur: number | null;
  medianObservedSoldPriceEur: number | null;
  sampleSize: number;
}

export interface PriceByYearPoint {
  yearModel: number;
  listingCount: number;
  medianMileageKm: number | null;
  askingPriceP25Eur: number | null;
  medianAskingPriceEur: number | null;
  askingPriceP75Eur: number | null;
  observedSoldPriceP25Eur: number | null;
  medianObservedSoldPriceEur: number | null;
  observedSoldPriceP75Eur: number | null;
}

export interface PriceByMileageBucketPoint {
  bucketStartKm: number;
  bucketEndKm: number;
  listingCount: number;
  medianYearModel: number | null;
  askingPriceP25Eur: number | null;
  medianAskingPriceEur: number | null;
  askingPriceP75Eur: number | null;
  observedSoldPriceP25Eur: number | null;
  medianObservedSoldPriceEur: number | null;
  observedSoldPriceP75Eur: number | null;
}

export interface PriceMileageScatterPoint {
  listingId: string;
  make: string | null;
  model: string | null;
  yearModel: number | null;
  mileageKm: number;
  availability: string;
  askingPriceEur: number | null;
  observedSoldPriceEur: number | null;
}

export interface AnalyticsTrendResponse {
  appliedFilters: ListingFiltersQuery;
  coverage: CoverageMetadata;
  summary: {
    listingCount: number;
    activeCount: number;
    soldCount: number;
    medianAskingPriceEur: number | null;
    medianObservedSoldPriceEur: number | null;
    medianMileageKm: number | null;
  };
  timeSeries: Array<{
    bucket: string;
    listingCount: number;
    medianAskingPriceEur: number | null;
    medianObservedSoldPriceEur: number | null;
  }>;
  breakdowns: {
    byMake: Array<{ make: string; count: number }>;
  };
  charts: {
    marketOverTime: MarketOverTimePoint[];
    priceByYear: PriceByYearPoint[];
    priceByMileageBucket: PriceByMileageBucketPoint[];
    priceMileageScatter: PriceMileageScatterPoint[];
  };
}

export interface ListingSearchResponse {
  items: ListingTableItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  sort: string;
  coverage: CoverageMetadata;
}

export interface ListingTableItem {
  listingId: string;
  sourceListingId: string;
  make: string | null;
  model: string | null;
  yearModel: number | null;
  availability: string;
  askingPriceEur: number | null;
  observedSoldPriceEur: number | null;
  mileageKm: number | null;
  seller: string | null;
  sellerType: string | null;
  lastSeenAt: string;
  sourceUrl: string | null;
}

export interface PublicVehicleDetails {
  sourceUpdatedDate: string | null;
  sourceLocationLabel: string | null;
  registrationNumber: string | null;
  engineSourceLabel: string | null;
  fuelTypeSourceLabel: string | null;
  transmissionSourceLabel: string | null;
  drivetrainSourceLabel: string | null;
  firstRegistrationDate: string | null;
  inspectionDateLabel: string | null;
  bodyTypeSourceLabel: string | null;
  vehicleTypeSourceLabel: string | null;
  colorSourceLabel: string | null;
  powerKw: number | null;
  powerHp: number | null;
  topSpeedKmh: number | null;
  acceleration0To100S: number | null;
  seatCount: number | null;
  doorCount: number | null;
  steeringSideSourceLabel: string | null;
  curbWeightKg: number | null;
  grossWeightKg: number | null;
  towingWeightBrakedKg: number | null;
  towingWeightUnbrakedKg: number | null;
  co2GKm: number | null;
  fuelConsumptionSourceLabel: string | null;
  sellerNotes: string | null;
}

export interface PublicListingDetailResponse {
  listing: ListingTableItem & {
    firstSeenAt: string;
    sourceAttribution: {
      source: "Nettiauto";
      sourceUrl: string | null;
      sourceListingId: string;
      observedDataLabel: string;
    };
  };
  priceHistory: Array<{
    observedAt: string;
    askingPriceEur: number | null;
    observedSoldPriceEur: number | null;
  }>;
  mileageHistory: Array<{ observedAt: string; mileageKm: number | null }>;
  availabilityHistory: Array<{ observedAt: string; availability: string }>;
  imageMetadata: Array<{ imageUrl: string; role: string | null; position: number | null }>;
  vehicleDetails: PublicVehicleDetails | null;
  coverage: CoverageMetadata;
}

export interface AdminCrawlerStatusResponse {
  crawlerState: {
    enabled: boolean;
    paused: boolean;
    delayMs: number;
    maxPagesPerRun: number;
  };
  lastSuccessfulCrawls: Array<{
    crawlKind: "current" | "sold";
    finishedAt: string | null;
    parsedListingCount: number;
  }>;
  recentRuns: Array<{
    id: string;
    crawlKind: "current" | "sold";
    status: string;
    startedAt: string | null;
    finishedAt: string | null;
    fetchedPageCount: number;
    parsedListingCount: number;
    failureReason: string | null;
  }>;
  freshnessBySegment: Array<{
    crawlKind: "current" | "sold";
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    enabled: boolean;
  }>;
  queueBacklog: {
    pendingJobs: number;
    lockedJobs: number;
    failedJobs: number;
  };
  failureCounts: Array<{ failureReason: string; count: number }>;
  latestSourceFetchFailures: Array<{
    fetchedAt: string;
    fetchKind: string;
    pageNumber: number | null;
    sourceUrl: string;
    responseStatus: number | null;
    responseBodyShape: string;
    errorType: string;
    errorMessage: string | null;
  }>;
  latestParserErrorSummaries: Array<{
    capturedAt: string;
    parserVersion: string;
    parseError: string;
  }>;
  latestFailedJobs: Array<{
    id: string;
    taskIdentifier: string;
    attempts: number;
    maxAttempts: number;
    runAt: string | null;
    lastError: string | null;
    createdAt: string;
    updatedAt: string | null;
  }>;
}

type Sql = postgres.Sql<Record<string, unknown>>;
type SqlParameter = string | number | boolean | Date | null;
const ANALYTICS_MAX_MILEAGE_KM = 2_000_000;
const ANALYTICS_MILEAGE_BUCKET_KM = 25_000;
const ANALYTICS_SCATTER_POINT_LIMIT = 500;
const ANALYTICS_DEFAULT_TREND_LOOKBACK_DAYS = 365;

export async function getFilterMetadata(sql: Sql): Promise<FilterMetadata> {
  const [facets, coverage] = await Promise.all([queryFacets(sql), getCoverage(sql, {})]);
  return {
    ...facets,
    availability: ["all", "current", "sold"],
    coverage,
  };
}

export async function getAnalyticsTrend(
  sql: Sql,
  filters: ListingFiltersQuery,
): Promise<AnalyticsTrendResponse> {
  const [
    summary,
    byMake,
    coverage,
    marketOverTime,
    priceByYear,
    priceByMileageBucket,
    priceMileageScatter,
  ] = await Promise.all([
    getSummary(sql, filters),
    getMakeBreakdown(sql, filters),
    getCoverage(sql, filters),
    getMarketOverTime(sql, filters),
    getPriceByYear(sql, filters),
    getPriceByMileageBucket(sql, filters),
    getPriceMileageScatter(sql, filters),
  ]);

  return {
    appliedFilters: filters,
    coverage,
    summary,
    timeSeries: marketOverTime.map((row) => ({
      bucket: row.bucket,
      listingCount: row.listingCount,
      medianAskingPriceEur: row.medianAskingPriceEur,
      medianObservedSoldPriceEur: row.medianObservedSoldPriceEur,
    })),
    breakdowns: {
      byMake,
    },
    charts: {
      marketOverTime,
      priceByYear,
      priceByMileageBucket,
      priceMileageScatter,
    },
  };
}

export async function searchListings(sql: Sql, query: ListingSearchQuery): Promise<ListingSearchResponse> {
  const { whereSql, params } = buildFilterWhere(query);
  const orderBy = sortToOrderBy(query.sort);
  const offset = (query.page - 1) * query.pageSize;
  const countParams = [...params];
  const [{ totalItems } = { totalItems: 0 }] = await sql.unsafe<{ totalItems: number }[]>(
    `
      with latest_snapshots as (${latestSnapshotSql()})
      select count(*)::int as "totalItems"
      from latest_snapshots s
      join listings l on l.id = s.listing_id
      ${whereSql}
    `,
    countParams,
  );
  const rows = await sql.unsafe<ListingTableItem[]>(
    `
      with latest_snapshots as (${latestSnapshotSql()})
      select
        l.id as "listingId",
        l.source_listing_id as "sourceListingId",
        s.make_source_label as "make",
        s.model_source_label as "model",
        s.year_model as "yearModel",
        s.availability,
        s.asking_price_eur as "askingPriceEur",
        s.observed_sold_price_eur as "observedSoldPriceEur",
        s.mileage_km as "mileageKm",
        s.seller_source_label as "seller",
        s.seller_type_source_label as "sellerType",
        l.last_seen_at::text as "lastSeenAt",
        l.canonical_source_url as "sourceUrl"
      from latest_snapshots s
      join listings l on l.id = s.listing_id
      ${whereSql}
      order by ${orderBy}
      limit $${params.length + 1}
      offset $${params.length + 2}
    `,
    [...params, query.pageSize, offset],
  );

  return {
    items: rows,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / query.pageSize)),
    },
    sort: query.sort,
    coverage: await getCoverage(sql, query),
  };
}

export async function getPublicListingDetail(
  sql: Sql,
  listingId: string,
): Promise<PublicListingDetailResponse | null> {
  const [detailRow] = await sql.unsafe<
    Array<
      ListingTableItem & {
        sourceUpdatedDate: string | null;
        transmissionSourceLabel: string | null;
        bodyTypeSourceLabel: string | null;
        colorSourceLabel: string | null;
        normalizedData: unknown;
      }
    >
  >(
    `
      with latest_snapshots as (${latestSnapshotSql()})
      select
        l.id as "listingId",
        l.source_listing_id as "sourceListingId",
        s.make_source_label as "make",
        s.model_source_label as "model",
        s.year_model as "yearModel",
        s.availability,
        s.asking_price_eur as "askingPriceEur",
        s.observed_sold_price_eur as "observedSoldPriceEur",
        s.mileage_km as "mileageKm",
        s.seller_source_label as "seller",
        s.seller_type_source_label as "sellerType",
        s.source_updated_date::text as "sourceUpdatedDate",
        s.transmission_source_label as "transmissionSourceLabel",
        s.body_type_source_label as "bodyTypeSourceLabel",
        s.color_source_label as "colorSourceLabel",
        s.normalized_data as "normalizedData",
        l.last_seen_at::text as "lastSeenAt",
        l.canonical_source_url as "sourceUrl"
      from latest_snapshots s
      join listings l on l.id = s.listing_id
      where l.id = $1
      limit 1
    `,
    [listingId],
  );

  if (!detailRow) {
    return null;
  }

  const {
    sourceUpdatedDate,
    transmissionSourceLabel,
    bodyTypeSourceLabel,
    colorSourceLabel,
    normalizedData,
    ...listing
  } = detailRow;
  const vehicleDetails = buildPublicVehicleDetails({
    sourceUpdatedDate,
    transmissionSourceLabel,
    bodyTypeSourceLabel,
    colorSourceLabel,
    normalizedData,
  });

  const [baseRow] = await sql<{ firstSeenAt: string }[]>`
    select first_seen_at::text as "firstSeenAt"
    from listings
    where id = ${listingId}
  `;
  const [history, images, coverage] = await Promise.all([
    sql<
      {
        observedAt: string;
        availability: string;
        askingPriceEur: number | null;
        observedSoldPriceEur: number | null;
        mileageKm: number | null;
      }[]
    >`
      select
        observed_at::text as "observedAt",
        availability,
        asking_price_eur as "askingPriceEur",
        observed_sold_price_eur as "observedSoldPriceEur",
        mileage_km as "mileageKm"
      from listing_snapshots
      where listing_id = ${listingId}
      order by observed_at asc
    `,
    sql<{ imageUrl: string; role: string | null; position: number | null }[]>`
      select image_url as "imageUrl", image_role as "role", position
      from listing_images
      where listing_id = ${listingId}
      order by position nulls last, first_seen_at asc
    `,
    getCoverage(sql, {}),
  ]);

  return {
    listing: {
      ...listing,
      firstSeenAt: baseRow?.firstSeenAt ?? listing.lastSeenAt,
      sourceAttribution: {
        source: "Nettiauto",
        sourceUrl: listing.sourceUrl,
        sourceListingId: listing.sourceListingId,
        observedDataLabel: "Search Result Data",
      },
    },
    priceHistory: history.map((row) => ({
      observedAt: row.observedAt,
      askingPriceEur: row.askingPriceEur,
      observedSoldPriceEur: row.observedSoldPriceEur,
    })),
    mileageHistory: history.map((row) => ({
      observedAt: row.observedAt,
      mileageKm: row.mileageKm,
    })),
    availabilityHistory: history.map((row) => ({
      observedAt: row.observedAt,
      availability: row.availability,
    })),
    imageMetadata: images,
    vehicleDetails,
    coverage,
  };
}

function buildPublicVehicleDetails(input: {
  sourceUpdatedDate: string | null;
  transmissionSourceLabel: string | null;
  bodyTypeSourceLabel: string | null;
  colorSourceLabel: string | null;
  normalizedData: unknown;
}): PublicVehicleDetails | null {
  const data = isRecord(input.normalizedData) ? input.normalizedData : {};
  const details: PublicVehicleDetails = {
    sourceUpdatedDate: stringValue(data.sourceUpdatedDate) ?? input.sourceUpdatedDate,
    sourceLocationLabel: stringValue(data.sourceLocationLabel),
    registrationNumber: stringValue(data.registrationNumber),
    engineSourceLabel: stringValue(data.engineSourceLabel),
    fuelTypeSourceLabel: stringValue(data.fuelTypeSourceLabel),
    transmissionSourceLabel: stringValue(data.transmissionSourceLabel) ?? input.transmissionSourceLabel,
    drivetrainSourceLabel: stringValue(data.drivetrainSourceLabel),
    firstRegistrationDate: stringValue(data.firstRegistrationDate),
    inspectionDateLabel: stringValue(data.inspectionDateLabel),
    bodyTypeSourceLabel: stringValue(data.bodyTypeSourceLabel) ?? input.bodyTypeSourceLabel,
    vehicleTypeSourceLabel: stringValue(data.vehicleTypeSourceLabel),
    colorSourceLabel: stringValue(data.colorSourceLabel) ?? input.colorSourceLabel,
    powerKw: numberValue(data.powerKw),
    powerHp: numberValue(data.powerHp),
    topSpeedKmh: numberValue(data.topSpeedKmh),
    acceleration0To100S: numberValue(data.acceleration0To100S),
    seatCount: numberValue(data.seatCount),
    doorCount: numberValue(data.doorCount),
    steeringSideSourceLabel: stringValue(data.steeringSideSourceLabel),
    curbWeightKg: numberValue(data.curbWeightKg),
    grossWeightKg: numberValue(data.grossWeightKg),
    towingWeightBrakedKg: numberValue(data.towingWeightBrakedKg),
    towingWeightUnbrakedKg: numberValue(data.towingWeightUnbrakedKg),
    co2GKm: numberValue(data.co2GKm),
    fuelConsumptionSourceLabel: stringValue(data.fuelConsumptionSourceLabel),
    sellerNotes: stringValue(data.sellerNotes),
  };

  return Object.values(details).some((value) => value !== null) ? details : null;
}

export async function getAdminCrawlerStatus(
  sql: Sql,
  state: { enabled: boolean; paused: boolean; delayMs: number; maxPagesPerRun: number },
): Promise<AdminCrawlerStatusResponse> {
  const [
    lastSuccessfulCrawls,
    recentRuns,
    freshnessBySegment,
    failureCounts,
    sourceFetchFailures,
    parserErrors,
    queueBacklog,
    failedJobs,
  ] = await Promise.all([
      sql<AdminCrawlerStatusResponse["lastSuccessfulCrawls"]>`
        select distinct on (crawl_kind)
          crawl_kind as "crawlKind",
          finished_at::text as "finishedAt",
          parsed_listing_count as "parsedListingCount"
        from crawl_runs
        where status = 'completed'
        order by crawl_kind, finished_at desc nulls last
      `,
      sql<AdminCrawlerStatusResponse["recentRuns"]>`
        select
          id,
          crawl_kind as "crawlKind",
          status,
          started_at::text as "startedAt",
          finished_at::text as "finishedAt",
          fetched_page_count as "fetchedPageCount",
          parsed_listing_count as "parsedListingCount",
          failure_reason as "failureReason"
        from crawl_runs
        order by created_at desc
        limit 10
      `,
      sql<AdminCrawlerStatusResponse["freshnessBySegment"]>`
        select
          crawl_kind as "crawlKind",
          last_success_at::text as "lastSuccessAt",
          last_failure_at::text as "lastFailureAt",
          enabled
        from source_search_queries
        order by priority asc, crawl_kind asc
      `,
      sql<{ failureReason: string; count: number }[]>`
        select coalesce(failure_reason, 'unknown') as "failureReason", count(*)::int as count
        from crawl_runs
        where status in ('failed', 'partial')
        group by 1
        order by count desc
        limit 10
      `,
      sql<AdminCrawlerStatusResponse["latestSourceFetchFailures"]>`
        select
          fetched_at::text as "fetchedAt",
          fetch_kind as "fetchKind",
          page_number as "pageNumber",
          source_url as "sourceUrl",
          response_status as "responseStatus",
          response_body_shape as "responseBodyShape",
          error_type as "errorType",
          left(error_message, 500) as "errorMessage"
        from source_fetches
        where error_type is not null
        order by fetched_at desc
        limit 10
      `,
      sql<AdminCrawlerStatusResponse["latestParserErrorSummaries"]>`
        select
          captured_at::text as "capturedAt",
          parser_version as "parserVersion",
          left(coalesce(parse_error, 'unknown parser error'), 240) as "parseError"
        from raw_listing_records
        where parser_status = 'failed'
        order by captured_at desc
        limit 10
      `,
      getQueueBacklog(sql),
      getLatestFailedJobs(sql),
    ]);

  return {
    crawlerState: state,
    lastSuccessfulCrawls,
    recentRuns,
    freshnessBySegment,
    queueBacklog,
    failureCounts,
    latestSourceFetchFailures: sourceFetchFailures,
    latestParserErrorSummaries: parserErrors,
    latestFailedJobs: failedJobs,
  };
}

async function queryFacets(sql: Sql) {
  const [row] = await sql.unsafe<
    {
      makes: string[] | null;
      models: string[] | null;
      minYear: number | null;
      maxYear: number | null;
      sellerTypes: string[] | null;
    }[]
  >(
    `
      with latest_snapshots as (${latestSnapshotSql()})
      select
        array_remove(array_agg(distinct make_source_label order by make_source_label), null) as makes,
        array_remove(array_agg(distinct model_source_label order by model_source_label), null) as models,
        min(year_model)::int as "minYear",
        max(year_model)::int as "maxYear",
        array_remove(array_agg(distinct seller_type_source_label order by seller_type_source_label), null) as "sellerTypes"
      from latest_snapshots
    `,
    [],
  );

  return {
    makes: row?.makes ?? [],
    models: row?.models ?? [],
    yearRange: { min: row?.minYear ?? null, max: row?.maxYear ?? null },
    sellerTypes: row?.sellerTypes ?? [],
  };
}

async function getSummary(sql: Sql, filters: ListingFiltersQuery): Promise<AnalyticsTrendResponse["summary"]> {
  const { whereSql, params } = buildFilterWhere(filters);
  const analyticsMileageSql = validAnalyticsMileageSql("s");
  const [row] = await sql.unsafe<
    {
      listingCount: number;
      activeCount: number;
      soldCount: number;
      medianAskingPriceEur: number | null;
      medianObservedSoldPriceEur: number | null;
      medianMileageKm: number | null;
    }[]
  >(
    `
      with latest_snapshots as (${latestSnapshotSql()})
      select
        count(*)::int as "listingCount",
        count(*) filter (where s.availability = 'active')::int as "activeCount",
        count(*) filter (where s.availability = 'sold')::int as "soldCount",
        (percentile_cont(0.5) within group (order by s.asking_price_eur)
          filter (where s.asking_price_eur is not null))::int as "medianAskingPriceEur",
        (percentile_cont(0.5) within group (order by s.observed_sold_price_eur)
          filter (where s.observed_sold_price_eur is not null))::int as "medianObservedSoldPriceEur",
        (percentile_cont(0.5) within group (order by ${analyticsMileageSql})
          filter (where ${analyticsMileageSql} is not null))::int as "medianMileageKm"
      from latest_snapshots s
      join listings l on l.id = s.listing_id
      ${whereSql}
    `,
    params,
  );

  return {
    listingCount: row?.listingCount ?? 0,
    activeCount: row?.activeCount ?? 0,
    soldCount: row?.soldCount ?? 0,
    medianAskingPriceEur: row?.medianAskingPriceEur ?? null,
    medianObservedSoldPriceEur: row?.medianObservedSoldPriceEur ?? null,
    medianMileageKm: row?.medianMileageKm ?? null,
  };
}

async function getMakeBreakdown(sql: Sql, filters: ListingFiltersQuery) {
  const { whereSql, params } = buildFilterWhere(filters);
  return sql.unsafe<{ make: string; count: number }[]>(
    `
      with latest_snapshots as (${latestSnapshotSql()})
      select coalesce(s.make_source_label, 'Unknown') as make, count(*)::int as count
      from latest_snapshots s
      join listings l on l.id = s.listing_id
      ${whereSql}
      group by 1
      order by count desc, make asc
      limit 12
    `,
    params,
  );
}

async function getMarketOverTime(sql: Sql, filters: ListingFiltersQuery): Promise<MarketOverTimePoint[]> {
  const interval = filters.interval;
  const bucketStep = intervalToSqlInterval(interval);
  const sightingTimeFilter = buildSightingTimeWhere(filters);
  const { whereSql, params: snapshotParams } = buildFilterWhere(
    {
      ...filters,
      from: undefined,
      to: undefined,
    },
    { startIndex: sightingTimeFilter.params.length },
  );
  const params = [...sightingTimeFilter.params, ...snapshotParams];
  const rows = await sql.unsafe<
    {
      bucket: string;
      listingCount: number;
      activeCount: number;
      soldCount: number;
      newListingCount: number;
      medianAskingPriceEur: number | string | null;
      medianObservedSoldPriceEur: number | string | null;
      sampleSize: number;
    }[]
  >(
    `
      with sighting_buckets as (
        select distinct on (date_trunc('${interval}', ls.seen_at), ls.listing_id)
          date_trunc('${interval}', ls.seen_at) as bucket_start,
          ls.listing_id,
          ls.seen_at
        from listing_sightings ls
        ${sightingTimeFilter.whereSql}
        order by date_trunc('${interval}', ls.seen_at), ls.listing_id, ls.seen_at desc
      ),
      bucketed_snapshots as (
        select
          b.bucket_start,
          b.seen_at,
          b.listing_id,
          l.first_seen_at,
          s.availability,
          s.asking_price_eur,
          s.observed_sold_price_eur
        from sighting_buckets b
        join listings l on l.id = b.listing_id
        join lateral (
          select *
          from listing_snapshots snapshot
          where snapshot.listing_id = b.listing_id
            and snapshot.observed_at <= b.seen_at + interval '1 minute'
          order by snapshot.observed_at desc, snapshot.created_at desc
          limit 1
        ) s on true
        ${whereSql}
      )
      select
        bucket_start::date::text as "bucket",
        count(*)::int as "listingCount",
        count(*) filter (where availability = 'active')::int as "activeCount",
        count(*) filter (where availability = 'sold')::int as "soldCount",
        count(*) filter (
          where first_seen_at >= bucket_start
            and first_seen_at < bucket_start + interval '${bucketStep}'
        )::int as "newListingCount",
        (percentile_cont(0.5) within group (order by asking_price_eur)
          filter (where asking_price_eur is not null))::int as "medianAskingPriceEur",
        (percentile_cont(0.5) within group (order by observed_sold_price_eur)
          filter (where observed_sold_price_eur is not null))::int as "medianObservedSoldPriceEur",
        count(*)::int as "sampleSize"
      from bucketed_snapshots
      group by bucket_start
      order by bucket_start
    `,
    params,
  );

  return rows.map((row) => ({
    bucket: row.bucket,
    listingCount: row.listingCount,
    activeCount: row.activeCount,
    soldCount: row.soldCount,
    newListingCount: row.newListingCount,
    medianAskingPriceEur: nullableNumber(row.medianAskingPriceEur),
    medianObservedSoldPriceEur: nullableNumber(row.medianObservedSoldPriceEur),
    sampleSize: row.sampleSize,
  }));
}

async function getPriceByYear(sql: Sql, filters: ListingFiltersQuery): Promise<PriceByYearPoint[]> {
  const { whereSql, params } = buildFilterWhere(filters);
  const analyticsMileageSql = validAnalyticsMileageSql("s");
  const rows = await sql.unsafe<
    {
      yearModel: number;
      listingCount: number;
      medianMileageKm: number | string | null;
      askingPriceP25Eur: number | string | null;
      medianAskingPriceEur: number | string | null;
      askingPriceP75Eur: number | string | null;
      observedSoldPriceP25Eur: number | string | null;
      medianObservedSoldPriceEur: number | string | null;
      observedSoldPriceP75Eur: number | string | null;
    }[]
  >(
    `
      with latest_snapshots as (${latestSnapshotSql()})
      select
        s.year_model as "yearModel",
        count(*)::int as "listingCount",
        (percentile_cont(0.5) within group (order by ${analyticsMileageSql})
          filter (where ${analyticsMileageSql} is not null))::int as "medianMileageKm",
        (percentile_cont(0.25) within group (order by s.asking_price_eur)
          filter (where s.asking_price_eur is not null))::int as "askingPriceP25Eur",
        (percentile_cont(0.5) within group (order by s.asking_price_eur)
          filter (where s.asking_price_eur is not null))::int as "medianAskingPriceEur",
        (percentile_cont(0.75) within group (order by s.asking_price_eur)
          filter (where s.asking_price_eur is not null))::int as "askingPriceP75Eur",
        (percentile_cont(0.25) within group (order by s.observed_sold_price_eur)
          filter (where s.observed_sold_price_eur is not null))::int as "observedSoldPriceP25Eur",
        (percentile_cont(0.5) within group (order by s.observed_sold_price_eur)
          filter (where s.observed_sold_price_eur is not null))::int as "medianObservedSoldPriceEur",
        (percentile_cont(0.75) within group (order by s.observed_sold_price_eur)
          filter (where s.observed_sold_price_eur is not null))::int as "observedSoldPriceP75Eur"
      from latest_snapshots s
      join listings l on l.id = s.listing_id
      ${appendWhereCondition(whereSql, "s.year_model is not null")}
      group by s.year_model
      order by s.year_model asc
    `,
    params,
  );

  return rows.map((row) => ({
    yearModel: row.yearModel,
    listingCount: row.listingCount,
    medianMileageKm: nullableNumber(row.medianMileageKm),
    askingPriceP25Eur: nullableNumber(row.askingPriceP25Eur),
    medianAskingPriceEur: nullableNumber(row.medianAskingPriceEur),
    askingPriceP75Eur: nullableNumber(row.askingPriceP75Eur),
    observedSoldPriceP25Eur: nullableNumber(row.observedSoldPriceP25Eur),
    medianObservedSoldPriceEur: nullableNumber(row.medianObservedSoldPriceEur),
    observedSoldPriceP75Eur: nullableNumber(row.observedSoldPriceP75Eur),
  }));
}

async function getPriceByMileageBucket(
  sql: Sql,
  filters: ListingFiltersQuery,
): Promise<PriceByMileageBucketPoint[]> {
  const { whereSql, params } = buildFilterWhere(filters);
  const mileageBucketSql = `(floor(s.mileage_km::numeric / ${ANALYTICS_MILEAGE_BUCKET_KM})::int * ${ANALYTICS_MILEAGE_BUCKET_KM})`;
  const rows = await sql.unsafe<
    {
      bucketStartKm: number;
      listingCount: number;
      medianYearModel: number | string | null;
      askingPriceP25Eur: number | string | null;
      medianAskingPriceEur: number | string | null;
      askingPriceP75Eur: number | string | null;
      observedSoldPriceP25Eur: number | string | null;
      medianObservedSoldPriceEur: number | string | null;
      observedSoldPriceP75Eur: number | string | null;
    }[]
  >(
    `
      with latest_snapshots as (${latestSnapshotSql()})
      select
        ${mileageBucketSql} as "bucketStartKm",
        count(*)::int as "listingCount",
        (percentile_cont(0.5) within group (order by s.year_model)
          filter (where s.year_model is not null))::int as "medianYearModel",
        (percentile_cont(0.25) within group (order by s.asking_price_eur)
          filter (where s.asking_price_eur is not null))::int as "askingPriceP25Eur",
        (percentile_cont(0.5) within group (order by s.asking_price_eur)
          filter (where s.asking_price_eur is not null))::int as "medianAskingPriceEur",
        (percentile_cont(0.75) within group (order by s.asking_price_eur)
          filter (where s.asking_price_eur is not null))::int as "askingPriceP75Eur",
        (percentile_cont(0.25) within group (order by s.observed_sold_price_eur)
          filter (where s.observed_sold_price_eur is not null))::int as "observedSoldPriceP25Eur",
        (percentile_cont(0.5) within group (order by s.observed_sold_price_eur)
          filter (where s.observed_sold_price_eur is not null))::int as "medianObservedSoldPriceEur",
        (percentile_cont(0.75) within group (order by s.observed_sold_price_eur)
          filter (where s.observed_sold_price_eur is not null))::int as "observedSoldPriceP75Eur"
      from latest_snapshots s
      join listings l on l.id = s.listing_id
      ${appendWhereCondition(
        whereSql,
        `s.mileage_km between 0 and ${ANALYTICS_MAX_MILEAGE_KM}`,
      )}
      group by 1
      order by 1
      limit 80
    `,
    params,
  );

  return rows.map((row) => ({
    bucketStartKm: row.bucketStartKm,
    bucketEndKm: row.bucketStartKm + ANALYTICS_MILEAGE_BUCKET_KM - 1,
    listingCount: row.listingCount,
    medianYearModel: nullableNumber(row.medianYearModel),
    askingPriceP25Eur: nullableNumber(row.askingPriceP25Eur),
    medianAskingPriceEur: nullableNumber(row.medianAskingPriceEur),
    askingPriceP75Eur: nullableNumber(row.askingPriceP75Eur),
    observedSoldPriceP25Eur: nullableNumber(row.observedSoldPriceP25Eur),
    medianObservedSoldPriceEur: nullableNumber(row.medianObservedSoldPriceEur),
    observedSoldPriceP75Eur: nullableNumber(row.observedSoldPriceP75Eur),
  }));
}

async function getPriceMileageScatter(
  sql: Sql,
  filters: ListingFiltersQuery,
): Promise<PriceMileageScatterPoint[]> {
  const { whereSql, params } = buildFilterWhere(filters);
  return sql.unsafe<PriceMileageScatterPoint[]>(
    `
      with latest_snapshots as (${latestSnapshotSql()})
      select
        l.id as "listingId",
        s.make_source_label as "make",
        s.model_source_label as "model",
        s.year_model as "yearModel",
        s.mileage_km as "mileageKm",
        s.availability,
        s.asking_price_eur as "askingPriceEur",
        s.observed_sold_price_eur as "observedSoldPriceEur"
      from latest_snapshots s
      join listings l on l.id = s.listing_id
      ${appendWhereCondition(
        whereSql,
        `s.mileage_km between 0 and ${ANALYTICS_MAX_MILEAGE_KM}
          and coalesce(s.asking_price_eur, s.observed_sold_price_eur) is not null`,
      )}
      order by l.last_seen_at desc, l.id asc
      limit ${ANALYTICS_SCATTER_POINT_LIMIT}
    `,
    params,
  );
}

async function getCoverage(sql: Sql, filters: Partial<ListingFiltersQuery>): Promise<CoverageMetadata> {
  const { whereSql, params } = buildFilterWhere(filters);
  const [row] = await sql.unsafe<
    {
      sampleSize: number;
      lastRelevantCrawlAt: string | null;
      includesCurrent: boolean | null;
      includesSold: boolean | null;
    }[]
  >(
    `
      with latest_snapshots as (${latestSnapshotSql()})
      select
        count(*)::int as "sampleSize",
        max(l.last_seen_at)::text as "lastRelevantCrawlAt",
        bool_or(s.availability = 'active') as "includesCurrent",
        bool_or(s.availability = 'sold') as "includesSold"
      from latest_snapshots s
      join listings l on l.id = s.listing_id
      ${whereSql}
    `,
    params,
  );
  const [statusRow] = await sql<{ partialCount: number; completedCount: number }[]>`
    select
      count(*) filter (where status = 'partial')::int as "partialCount",
      count(*) filter (where status = 'completed')::int as "completedCount"
    from crawl_runs
  `;

  return {
    lastRelevantCrawlAt: row?.lastRelevantCrawlAt ?? null,
    sampleSize: row?.sampleSize ?? 0,
    includesCurrent: row?.includesCurrent ?? false,
    includesSold: row?.includesSold ?? false,
    dataSource: "search_result_data",
    completeness:
      (statusRow?.partialCount ?? 0) > 0
        ? "partial"
        : (statusRow?.completedCount ?? 0) > 0
          ? "complete"
          : "unknown",
  };
}

async function getQueueBacklog(sql: Sql) {
  const [existsRow] = await sql<{ relationName: string | null }[]>`
    select to_regclass('graphile_worker.jobs')::text as "relationName"
  `;
  if (!existsRow?.relationName) {
    return { pendingJobs: 0, lockedJobs: 0, failedJobs: 0 };
  }

  const [row] = await sql<{ pendingJobs: number; lockedJobs: number; failedJobs: number }[]>`
    select
      count(*) filter (where locked_at is null and attempts < max_attempts)::int as "pendingJobs",
      count(*) filter (where locked_at is not null and attempts < max_attempts)::int as "lockedJobs",
      count(*) filter (where attempts >= max_attempts)::int as "failedJobs"
    from graphile_worker.jobs
  `;

  return {
    pendingJobs: row?.pendingJobs ?? 0,
    lockedJobs: row?.lockedJobs ?? 0,
    failedJobs: row?.failedJobs ?? 0,
  };
}

async function getLatestFailedJobs(sql: Sql): Promise<AdminCrawlerStatusResponse["latestFailedJobs"]> {
  const [existsRow] = await sql<{ relationName: string | null }[]>`
    select to_regclass('graphile_worker.jobs')::text as "relationName"
  `;
  if (!existsRow?.relationName) {
    return [];
  }

  const columns = await sql<{ columnName: string }[]>`
    select column_name as "columnName"
    from information_schema.columns
    where table_schema = 'graphile_worker'
      and table_name = 'jobs'
      and column_name in (
        'id',
        'task_identifier',
        'attempts',
        'max_attempts',
        'run_at',
        'last_error',
        'created_at',
        'updated_at'
      )
  `;
  const columnNames = new Set(columns.map((column) => column.columnName));
  for (const requiredColumn of [
    "id",
    "task_identifier",
    "attempts",
    "max_attempts",
    "run_at",
    "last_error",
    "created_at",
    "updated_at",
  ]) {
    if (!columnNames.has(requiredColumn)) {
      return [];
    }
  }

  return sql<AdminCrawlerStatusResponse["latestFailedJobs"]>`
    select
      id::text,
      task_identifier as "taskIdentifier",
      attempts,
      max_attempts as "maxAttempts",
      run_at::text as "runAt",
      left(last_error, 500) as "lastError",
      created_at::text as "createdAt",
      updated_at::text as "updatedAt"
    from graphile_worker.jobs
    where attempts >= max_attempts
    order by updated_at desc
    limit 10
  `;
}

function latestSnapshotSql() {
  return `
    select distinct on (listing_id)
      *
    from listing_snapshots
    order by listing_id, observed_at desc, created_at desc
  `;
}

function buildFilterWhere(
  filters: Partial<ListingFiltersQuery>,
  options: { snapshotAlias?: string; timeColumn?: string; startIndex?: number } = {},
) {
  const snapshotAlias = options.snapshotAlias ?? "s";
  const timeColumn = options.timeColumn ?? `${snapshotAlias}.observed_at`;
  const startIndex = options.startIndex ?? 0;
  const column = (name: string) => `${snapshotAlias}.${name}`;
  const conditions: string[] = [];
  const params: SqlParameter[] = [];
  const add = (condition: string, value: SqlParameter) => {
    params.push(value);
    conditions.push(condition.replace("?", `$${startIndex + params.length}`));
  };

  if (filters.make) {
    add(`${column("make_source_label")} ilike ?`, `%${filters.make}%`);
  }
  if (filters.model) {
    add(`${column("model_source_label")} ilike ?`, `%${filters.model}%`);
  }
  if (filters.modelYearFrom !== undefined) {
    add(`${column("year_model")} >= ?`, filters.modelYearFrom);
  }
  if (filters.modelYearTo !== undefined) {
    add(`${column("year_model")} <= ?`, filters.modelYearTo);
  }
  if (filters.priceMin !== undefined) {
    add(
      `coalesce(${column("asking_price_eur")}, ${column("observed_sold_price_eur")}) >= ?`,
      filters.priceMin,
    );
  }
  if (filters.priceMax !== undefined) {
    add(
      `coalesce(${column("asking_price_eur")}, ${column("observed_sold_price_eur")}) <= ?`,
      filters.priceMax,
    );
  }
  if (filters.mileageMin !== undefined) {
    add(`${column("mileage_km")} >= ?`, filters.mileageMin);
  }
  if (filters.mileageMax !== undefined) {
    add(`${column("mileage_km")} <= ?`, filters.mileageMax);
  }
  if (filters.sellerType) {
    add(`${column("seller_type_source_label")} = ?`, filters.sellerType);
  }
  if (filters.availability === "current") {
    conditions.push(`${column("availability")} = 'active'`);
  }
  if (filters.availability === "sold") {
    conditions.push(`${column("availability")} = 'sold'`);
  }
  if (filters.from) {
    add(`${timeColumn} >= ?::date`, filters.from);
  }
  if (filters.to) {
    add(`${timeColumn} < (?::date + interval '1 day')`, filters.to);
  }

  return {
    whereSql: conditions.length > 0 ? `where ${conditions.join(" and ")}` : "",
    params,
  };
}

function buildSightingTimeWhere(filters: Pick<ListingFiltersQuery, "from" | "to">) {
  const conditions: string[] = [];
  const params: SqlParameter[] = [];
  const add = (condition: string, value: SqlParameter) => {
    params.push(value);
    conditions.push(condition.replace("?", `$${params.length}`));
  };

  if (filters.from) {
    add("ls.seen_at >= ?::date", filters.from);
  }
  if (filters.to) {
    add("ls.seen_at < (?::date + interval '1 day')", filters.to);
  }
  if (!filters.from && !filters.to) {
    conditions.push(`ls.seen_at >= now() - interval '${ANALYTICS_DEFAULT_TREND_LOOKBACK_DAYS} days'`);
  }

  return {
    whereSql: conditions.length > 0 ? `where ${conditions.join(" and ")}` : "",
    params,
  };
}

function appendWhereCondition(whereSql: string, condition: string) {
  return whereSql ? `${whereSql} and ${condition}` : `where ${condition}`;
}

function intervalToSqlInterval(interval: ListingFiltersQuery["interval"]) {
  switch (interval) {
    case "day":
      return "1 day";
    case "month":
      return "1 month";
    case "week":
    default:
      return "1 week";
  }
}

function sortToOrderBy(sort: string) {
  switch (sort) {
    case "priceAsc":
      return "coalesce(s.asking_price_eur, s.observed_sold_price_eur) asc nulls last";
    case "priceDesc":
      return "coalesce(s.asking_price_eur, s.observed_sold_price_eur) desc nulls last";
    case "mileageAsc":
      return "s.mileage_km asc nulls last";
    case "mileageDesc":
      return "s.mileage_km desc nulls last";
    case "yearDesc":
      return "s.year_model desc nulls last";
    case "lastSeenDesc":
    default:
      return "l.last_seen_at desc";
  }
}

function validAnalyticsMileageSql(alias: string) {
  return `case when ${alias}.mileage_km between 0 and ${ANALYTICS_MAX_MILEAGE_KM} then ${alias}.mileage_km end`;
}

function nullableNumber(value: string | number | null) {
  return value === null ? null : Number(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
