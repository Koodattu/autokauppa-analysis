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
    failedJobs: number;
  };
  failureCounts: Array<{ failureReason: string; count: number }>;
  latestParserErrorSummaries: Array<{
    capturedAt: string;
    parserVersion: string;
    parseError: string;
  }>;
}

type Sql = postgres.Sql<Record<string, unknown>>;
type SqlParameter = string | number | boolean | Date | null;

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
  const { whereSql, params } = buildFilterWhere(filters);
  const interval = filters.interval;
  const rows = await sql.unsafe<
    {
      bucket: string;
      listingCount: string;
      medianAskingPriceEur: string | null;
      medianObservedSoldPriceEur: string | null;
    }[]
  >(
    `
      with latest_snapshots as (${latestSnapshotSql()})
      select
        date_trunc('${interval}', s.observed_at)::date::text as "bucket",
        count(*)::int as "listingCount",
        (percentile_cont(0.5) within group (order by s.asking_price_eur)
          filter (where s.asking_price_eur is not null))::int as "medianAskingPriceEur",
        (percentile_cont(0.5) within group (order by s.observed_sold_price_eur)
          filter (where s.observed_sold_price_eur is not null))::int as "medianObservedSoldPriceEur"
      from latest_snapshots s
      join listings l on l.id = s.listing_id
      ${whereSql}
      group by 1
      order by 1
    `,
    params,
  );
  const [summary, byMake, coverage] = await Promise.all([
    getSummary(sql, filters),
    getMakeBreakdown(sql, filters),
    getCoverage(sql, filters),
  ]);

  return {
    appliedFilters: filters,
    coverage,
    summary,
    timeSeries: rows.map((row) => ({
      bucket: row.bucket,
      listingCount: Number(row.listingCount),
      medianAskingPriceEur: nullableNumber(row.medianAskingPriceEur),
      medianObservedSoldPriceEur: nullableNumber(row.medianObservedSoldPriceEur),
    })),
    breakdowns: {
      byMake,
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
  const [listing] = await sql.unsafe<ListingTableItem[]>(
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
      where l.id = $1
      limit 1
    `,
    [listingId],
  );

  if (!listing) {
    return null;
  }

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
    coverage,
  };
}

export async function getAdminCrawlerStatus(
  sql: Sql,
  state: { enabled: boolean; paused: boolean; delayMs: number; maxPagesPerRun: number },
): Promise<AdminCrawlerStatusResponse> {
  const [lastSuccessfulCrawls, recentRuns, freshnessBySegment, failureCounts, parserErrors, queueBacklog] =
    await Promise.all([
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
    ]);

  return {
    crawlerState: state,
    lastSuccessfulCrawls,
    recentRuns,
    freshnessBySegment,
    queueBacklog,
    failureCounts,
    latestParserErrorSummaries: parserErrors,
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
        (percentile_cont(0.5) within group (order by s.mileage_km)
          filter (where s.mileage_km is not null))::int as "medianMileageKm"
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
    return { pendingJobs: 0, failedJobs: 0 };
  }

  const [row] = await sql<{ pendingJobs: number; failedJobs: number }[]>`
    select
      count(*) filter (where locked_at is null and attempts < max_attempts)::int as "pendingJobs",
      count(*) filter (where attempts >= max_attempts)::int as "failedJobs"
    from graphile_worker.jobs
  `;

  return {
    pendingJobs: row?.pendingJobs ?? 0,
    failedJobs: row?.failedJobs ?? 0,
  };
}

function latestSnapshotSql() {
  return `
    select distinct on (listing_id)
      *
    from listing_snapshots
    order by listing_id, observed_at desc, created_at desc
  `;
}

function buildFilterWhere(filters: Partial<ListingFiltersQuery>) {
  const conditions: string[] = [];
  const params: SqlParameter[] = [];
  const add = (condition: string, value: SqlParameter) => {
    params.push(value);
    conditions.push(condition.replace("?", `$${params.length}`));
  };

  if (filters.make) {
    add("s.make_source_label ilike ?", `%${filters.make}%`);
  }
  if (filters.model) {
    add("s.model_source_label ilike ?", `%${filters.model}%`);
  }
  if (filters.modelYearFrom !== undefined) {
    add("s.year_model >= ?", filters.modelYearFrom);
  }
  if (filters.modelYearTo !== undefined) {
    add("s.year_model <= ?", filters.modelYearTo);
  }
  if (filters.priceMin !== undefined) {
    add("coalesce(s.asking_price_eur, s.observed_sold_price_eur) >= ?", filters.priceMin);
  }
  if (filters.priceMax !== undefined) {
    add("coalesce(s.asking_price_eur, s.observed_sold_price_eur) <= ?", filters.priceMax);
  }
  if (filters.mileageMin !== undefined) {
    add("s.mileage_km >= ?", filters.mileageMin);
  }
  if (filters.mileageMax !== undefined) {
    add("s.mileage_km <= ?", filters.mileageMax);
  }
  if (filters.sellerType) {
    add("s.seller_type_source_label = ?", filters.sellerType);
  }
  if (filters.availability === "current") {
    conditions.push("s.availability = 'active'");
  }
  if (filters.availability === "sold") {
    conditions.push("s.availability = 'sold'");
  }
  if (filters.from) {
    add("s.observed_at >= ?::date", filters.from);
  }
  if (filters.to) {
    add("s.observed_at < (?::date + interval '1 day')", filters.to);
  }

  return {
    whereSql: conditions.length > 0 ? `where ${conditions.join(" and ")}` : "",
    params,
  };
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

function nullableNumber(value: string | number | null) {
  return value === null ? null : Number(value);
}
