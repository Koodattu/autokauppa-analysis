import type postgres from "postgres";
import {
  MAX_LISTING_PAGE,
  type ListingFiltersQuery,
  type ListingSearchQuery,
} from "@nettiauto/schemas";

export interface CoverageMetadata {
  lastRelevantCrawlAt: string | null;
  sampleSize: number;
  includesCurrent: boolean;
  includesSold: boolean;
  dataSource: "search_result_data" | "search_and_detail_data";
  completeness: "complete" | "partial" | "unknown";
}

export interface FilterMetadata {
  makes: string[];
  models: string[];
  yearRange: { min: number | null; max: number | null };
  sellerTypes: string[];
  transmissions: string[];
  availability: Array<"current" | "sold" | "all">;
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
  askingPriceSampleSize: number;
  observedSoldPriceSampleSize: number;
}

export interface PriceByYearPoint {
  yearModel: number;
  listingCount: number;
  askingPriceSampleSize: number;
  observedSoldPriceSampleSize: number;
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
  askingPriceSampleSize: number;
  observedSoldPriceSampleSize: number;
  medianYearModel: number | null;
  askingPriceP25Eur: number | null;
  medianAskingPriceEur: number | null;
  askingPriceP75Eur: number | null;
  observedSoldPriceP25Eur: number | null;
  medianObservedSoldPriceEur: number | null;
  observedSoldPriceP75Eur: number | null;
}

export interface PriceByTransmissionPoint {
  transmission: string;
  listingCount: number;
  askingPriceSampleSize: number;
  observedSoldPriceSampleSize: number;
  medianMileageKm: number | null;
  askingPriceP25Eur: number | null;
  medianAskingPriceEur: number | null;
  askingPriceP75Eur: number | null;
  observedSoldPriceP25Eur: number | null;
  medianObservedSoldPriceEur: number | null;
  observedSoldPriceP75Eur: number | null;
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
    askingPriceSampleSize: number;
    observedSoldPriceSampleSize: number;
    mileageSampleSize: number;
  };
  charts: {
    marketOverTime: MarketOverTimePoint[];
    priceByYear: PriceByYearPoint[];
    priceByMileageBucket: PriceByMileageBucketPoint[];
    priceByTransmission: PriceByTransmissionPoint[];
  };
}

export interface AnalyticsSnapshotResponse extends Omit<AnalyticsTrendResponse, "charts"> {
  charts: Omit<AnalyticsTrendResponse["charts"], "marketOverTime">;
}

export interface AnalyticsTimeSeriesResponse {
  appliedFilters: ListingFiltersQuery;
  marketOverTime: MarketOverTimePoint[];
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

export interface MarketOverviewResponse {
  filters: FilterMetadata;
  analytics: AnalyticsTrendResponse;
  listings: ListingSearchResponse;
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
  sourceUpdatedDate: string | null;
  lastSeenAt: string;
}

export interface PublicVehicleDetails {
  sourceUpdatedDate: string | null;
  sourceLocationLabel: string | null;
  registrationNumber: string | null;
  officeFeeEur: number | null;
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
  energyEfficiencyClassSourceLabel: string | null;
  fuelConsumptionSourceLabel: string | null;
  fuelConsumptionCityL100Km: number | null;
  fuelConsumptionHighwayL100Km: number | null;
  fuelConsumptionCombinedL100Km: number | null;
  sellerNotes: string | null;
  equipmentGroups: Array<{ label: string; items: string[] }>;
  additionalSourceFields: Array<{ label: string; value: string }>;
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
  history: Array<{
    observedAt: string;
    sourceUpdatedDate: string | null;
    availability: string;
    askingPriceEur: number | null;
    observedSoldPriceEur: number | null;
    mileageKm: number | null;
  }>;
  imageMetadata: Array<{
    imageUrl: string;
    role: string | null;
    position: number | null;
    width: number | null;
    height: number | null;
  }>;
  vehicleDetails: PublicVehicleDetails | null;
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
}

export interface AdminCrawlerDiagnosticsResponse {
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
const ANALYTICS_DEFAULT_TREND_LOOKBACK_DAYS = 365;

export async function getFilterMetadata(
  sql: Sql,
  filters: Partial<ListingFiltersQuery> = {},
): Promise<FilterMetadata> {
  const facets = await queryFacets(sql, filters);
  return {
    ...facets,
    availability: ["all", "current", "sold"],
  };
}

export async function getAnalyticsTrend(
  sql: Sql,
  filters: ListingFiltersQuery,
): Promise<AnalyticsTrendResponse> {
  const [snapshot, timeSeries] = await Promise.all([
    getAnalyticsSnapshot(sql, filters),
    getAnalyticsTimeSeries(sql, filters),
  ]);

  return {
    ...snapshot,
    charts: {
      marketOverTime: timeSeries.marketOverTime,
      ...snapshot.charts,
    },
  };
}

export async function getAnalyticsSnapshot(
  sql: Sql,
  filters: ListingFiltersQuery,
): Promise<AnalyticsSnapshotResponse> {
  const summaryAndCoverage = await getSummaryAndCoverage(sql, filters);
  const priceByYear = await getPriceByYear(sql, filters);
  const priceByMileageBucket = await getPriceByMileageBucket(sql, filters);
  const priceByTransmission = await getPriceByTransmission(sql, filters);
  const { summary, coverage } = summaryAndCoverage;
  const analyticsCoverage: CoverageMetadata = {
    ...coverage,
    dataSource:
      priceByTransmission.length > 0 ? "search_and_detail_data" : coverage.dataSource,
  };

  return {
    appliedFilters: filters,
    coverage: analyticsCoverage,
    summary,
    charts: {
      priceByYear,
      priceByMileageBucket,
      priceByTransmission,
    },
  };
}

export async function getAnalyticsTimeSeries(
  sql: Sql,
  filters: ListingFiltersQuery,
): Promise<AnalyticsTimeSeriesResponse> {
  return {
    appliedFilters: filters,
    marketOverTime: await getMarketOverTime(sql, filters),
  };
}

export async function getMarketOverview(
  sql: Sql,
  query: ListingSearchQuery,
): Promise<MarketOverviewResponse> {
  const [facets, summaryAndCoverage] = await Promise.all([
    queryFacets(sql, query),
    getSummaryAndCoverage(sql, query),
  ]);
  const listings = await searchListings(sql, query, {
    coverage: summaryAndCoverage.coverage,
  });
  const filters = {
    ...facets,
    availability: ["all", "current", "sold"] as FilterMetadata["availability"],
  };

  return {
    filters,
    analytics: emptyAnalyticsTrend(query, summaryAndCoverage),
    listings,
  };
}

export async function searchListings(
  sql: Sql,
  query: ListingSearchQuery,
  options: { coverage?: CoverageMetadata } = {},
): Promise<ListingSearchResponse> {
  const { whereSql, params } = buildFilterWhere(query);
  const orderBy = sortToOrderBy(query.sort);
  const offset = (query.page - 1) * query.pageSize;
  const rows = await sql.unsafe<ListingTableItem[]>(
    `
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
        l.last_seen_at::text as "lastSeenAt"
      from listings l
      join listing_snapshots s on s.id = l.latest_snapshot_id
      ${whereSql}
      order by ${orderBy}
      limit $${params.length + 1}
      offset $${params.length + 2}
    `,
    [...params, query.pageSize, offset],
  );
  const matchSummary = await countListingMatches(sql, query, whereSql, params);
  const totalItems = matchSummary.totalItems;

  return {
    items: rows,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.min(MAX_LISTING_PAGE, Math.max(1, Math.ceil(totalItems / query.pageSize))),
    },
    sort: query.sort,
    coverage:
      options.coverage ??
      (await getSearchCoverage(sql, query, {
        sampleSize: totalItems,
        includesCurrent: matchSummary.includesCurrent ?? false,
        includesSold: matchSummary.includesSold ?? false,
      })),
  };
}

async function countListingMatches(
  sql: Sql,
  query: ListingSearchQuery,
  whereSql: string,
  params: SqlParameter[],
) {
  if (!hasSnapshotFilters(query)) {
    const availabilityWhere =
      query.availability === "current"
        ? "and current_availability = 'active'"
        : query.availability === "sold"
          ? "and current_availability = 'sold'"
          : "and current_availability in ('active', 'sold')";
    const [row] = await sql.unsafe<
      { totalItems: number; includesCurrent: boolean | null; includesSold: boolean | null }[]
    >(`
      select
        count(*)::int as "totalItems",
        bool_or(current_availability = 'active') as "includesCurrent",
        bool_or(current_availability = 'sold') as "includesSold"
      from listings
      where latest_snapshot_id is not null
        ${availabilityWhere}
    `);

    return row ?? { totalItems: 0, includesCurrent: false, includesSold: false };
  }

  const [row] = await sql.unsafe<
    { totalItems: number; includesCurrent: boolean | null; includesSold: boolean | null }[]
  >(
    `
      with latest_snapshots as (${latestSnapshotSql()})
      select
        count(*)::int as "totalItems",
        bool_or(s.availability = 'active') as "includesCurrent",
        bool_or(s.availability = 'sold') as "includesSold"
      from latest_snapshots s
      ${whereSql}
    `,
    params,
  );

  return row ?? { totalItems: 0, includesCurrent: false, includesSold: false };
}

export async function getPublicListingDetail(
  sql: Sql,
  listingId: string,
): Promise<PublicListingDetailResponse | null> {
  const [detailRow] = await sql.unsafe<
    Array<
      ListingTableItem & {
        firstSeenAt: string;
        sourceUrl: string | null;
        fuelTypeSourceLabel: string | null;
        transmissionSourceLabel: string | null;
        bodyTypeSourceLabel: string | null;
        colorSourceLabel: string | null;
        normalizedData: unknown;
      }
    >
  >(
    `
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
        s.fuel_type_source_label as "fuelTypeSourceLabel",
        s.transmission_source_label as "transmissionSourceLabel",
        s.body_type_source_label as "bodyTypeSourceLabel",
        s.color_source_label as "colorSourceLabel",
        s.normalized_data as "normalizedData",
        l.first_seen_at::text as "firstSeenAt",
        l.last_seen_at::text as "lastSeenAt",
        l.canonical_source_url as "sourceUrl"
      from listings l
      join listing_snapshots s on s.id = l.latest_snapshot_id
      where l.id = $1
    `,
    [listingId],
  );

  if (!detailRow) {
    return null;
  }

  const {
    firstSeenAt,
    sourceUrl,
    fuelTypeSourceLabel,
    transmissionSourceLabel,
    bodyTypeSourceLabel,
    colorSourceLabel,
    normalizedData,
    ...listing
  } = detailRow;
  const vehicleDetails = buildPublicVehicleDetails({
    sourceUpdatedDate: listing.sourceUpdatedDate,
    fuelTypeSourceLabel,
    transmissionSourceLabel,
    bodyTypeSourceLabel,
    colorSourceLabel,
    normalizedData,
  });
  const observedDataLabel =
    isRecord(normalizedData) && stringValue(normalizedData.detailParserVersion)
      ? "Search Result and Detail Page Data"
      : "Search Result Data";

  const [history, images] = await Promise.all([
    sql<
      {
        observedAt: string;
        sourceUpdatedDate: string | null;
        availability: string;
        askingPriceEur: number | null;
        observedSoldPriceEur: number | null;
        mileageKm: number | null;
      }[]
    >`
      select *
      from (
        select
          observed_at::text as "observedAt",
          source_updated_date::text as "sourceUpdatedDate",
          availability,
          asking_price_eur as "askingPriceEur",
          observed_sold_price_eur as "observedSoldPriceEur",
          mileage_km as "mileageKm"
        from listing_snapshots
        where listing_id = ${listingId}
        order by observed_at desc, created_at desc
        limit 500
      ) recent_history
      order by "observedAt" asc
    `,
    sql<
      {
        imageUrl: string;
        role: string | null;
        position: number | null;
        width: number | null;
        height: number | null;
      }[]
    >`
      select image_url as "imageUrl", image_role as "role", position, width, height
      from listing_images
      where listing_id = ${listingId}
      order by position nulls last, first_seen_at asc
    `,
  ]);

  return {
    listing: {
      ...listing,
      firstSeenAt,
      sourceAttribution: {
        source: "Nettiauto",
        sourceUrl,
        sourceListingId: listing.sourceListingId,
        observedDataLabel,
      },
    },
    history,
    imageMetadata: images,
    vehicleDetails,
  };
}

function buildPublicVehicleDetails(input: {
  sourceUpdatedDate: string | null;
  fuelTypeSourceLabel: string | null;
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
    officeFeeEur: numberValue(data.officeFeeEur),
    engineSourceLabel: stringValue(data.engineSourceLabel),
    fuelTypeSourceLabel: stringValue(data.fuelTypeSourceLabel) ?? input.fuelTypeSourceLabel,
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
    energyEfficiencyClassSourceLabel: stringValue(data.energyEfficiencyClassSourceLabel),
    fuelConsumptionSourceLabel: stringValue(data.fuelConsumptionSourceLabel),
    fuelConsumptionCityL100Km: numberValue(data.fuelConsumptionCityL100Km),
    fuelConsumptionHighwayL100Km: numberValue(data.fuelConsumptionHighwayL100Km),
    fuelConsumptionCombinedL100Km: numberValue(data.fuelConsumptionCombinedL100Km),
    sellerNotes: stringValue(data.sellerNotes),
    equipmentGroups: equipmentGroupValues(data.equipmentGroups),
    additionalSourceFields: detailFieldValues(data.additionalSourceFields),
  };

  return Object.values(details).some((value) =>
    Array.isArray(value) ? value.length > 0 : value !== null,
  )
    ? details
    : null;
}

export async function getAdminCrawlerStatus(
  sql: Sql,
  state: { enabled: boolean; paused: boolean; delayMs: number; maxPagesPerRun: number },
): Promise<AdminCrawlerStatusResponse> {
  const [lastSuccessfulCrawls, recentRuns, freshnessBySegment, queueBacklog] = await Promise.all([
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
    getQueueBacklog(sql),
  ]);

  return {
    crawlerState: state,
    lastSuccessfulCrawls,
    recentRuns,
    freshnessBySegment,
    queueBacklog,
  };
}

export async function getAdminCrawlerDiagnostics(
  sql: Sql,
): Promise<AdminCrawlerDiagnosticsResponse> {
  const [failureCounts, sourceFetchFailures, parserErrors, failedJobs] = await Promise.all([
    sql<AdminCrawlerDiagnosticsResponse["failureCounts"]>`
      select coalesce(failure_reason, 'unknown') as "failureReason", count(*)::int as count
      from crawl_runs
      where status in ('failed', 'partial')
        and created_at >= now() - interval '30 days'
      group by 1
      order by count desc
      limit 10
    `,
    sql<AdminCrawlerDiagnosticsResponse["latestSourceFetchFailures"]>`
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
    sql<AdminCrawlerDiagnosticsResponse["latestParserErrorSummaries"]>`
      select
        captured_at::text as "capturedAt",
        parser_version as "parserVersion",
        left(coalesce(parse_error, 'unknown parser error'), 240) as "parseError"
      from raw_listing_records
      where parser_status = 'failed'
      order by captured_at desc
      limit 10
    `,
    getLatestFailedJobs(sql),
  ]);

  return {
    failureCounts,
    latestSourceFetchFailures: sourceFetchFailures,
    latestParserErrorSummaries: parserErrors,
    latestFailedJobs: failedJobs,
  };
}

async function queryFacets(sql: Sql, filters: Partial<ListingFiltersQuery>) {
  const [row] = await sql.unsafe<
    {
      makes: string[] | null;
      models: string[] | null;
      minYear: number | null;
      maxYear: number | null;
      sellerTypes: string[] | null;
      transmissions: string[] | null;
    }[]
  >(
    `
      with latest_snapshots as (${latestSnapshotSql()})
      select
        array_remove(array_agg(distinct make_source_label order by make_source_label), null) as makes,
        array_remove(
          array_agg(distinct model_source_label order by model_source_label)
            filter (where $1::text is not null and make_source_label = $1),
          null
        ) as models,
        min(year_model) filter (
          where ($1::text is null or make_source_label = $1)
            and ($2::text is null or model_source_label = $2)
        )::int as "minYear",
        max(year_model) filter (
          where ($1::text is null or make_source_label = $1)
            and ($2::text is null or model_source_label = $2)
        )::int as "maxYear",
        array_remove(array_agg(distinct seller_type_source_label order by seller_type_source_label), null) as "sellerTypes",
        array_remove(
          array_agg(distinct transmission_source_label order by transmission_source_label)
            filter (
              where ($1::text is null or make_source_label = $1)
                and ($2::text is null or model_source_label = $2)
            ),
          null
        ) as transmissions
      from latest_snapshots
    `,
    [filters.make ?? null, filters.model ?? null],
  );

  return {
    makes: row?.makes ?? [],
    models: row?.models ?? [],
    yearRange: { min: row?.minYear ?? null, max: row?.maxYear ?? null },
    sellerTypes: row?.sellerTypes ?? [],
    transmissions: row?.transmissions ?? [],
  };
}

async function getSummaryAndCoverage(
  sql: Sql,
  filters: ListingFiltersQuery,
): Promise<Pick<AnalyticsTrendResponse, "summary" | "coverage">> {
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
      askingPriceSampleSize: number;
      observedSoldPriceSampleSize: number;
      mileageSampleSize: number;
      sampleSize: number;
      includesCurrent: boolean | null;
      includesSold: boolean | null;
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
          filter (where ${analyticsMileageSql} is not null))::int as "medianMileageKm",
        count(s.asking_price_eur)::int as "askingPriceSampleSize",
        count(s.observed_sold_price_eur)::int as "observedSoldPriceSampleSize",
        count(${analyticsMileageSql})::int as "mileageSampleSize",
        count(*)::int as "sampleSize",
        bool_or(s.availability = 'active') as "includesCurrent",
        bool_or(s.availability = 'sold') as "includesSold"
      from latest_snapshots s
      ${whereSql}
    `,
    params,
  );
  const coverageState = await getCoverageState(sql, filters.availability);

  return {
    summary: {
      listingCount: row?.listingCount ?? 0,
      activeCount: row?.activeCount ?? 0,
      soldCount: row?.soldCount ?? 0,
      medianAskingPriceEur: row?.medianAskingPriceEur ?? null,
      medianObservedSoldPriceEur: row?.medianObservedSoldPriceEur ?? null,
      medianMileageKm: row?.medianMileageKm ?? null,
      askingPriceSampleSize: row?.askingPriceSampleSize ?? 0,
      observedSoldPriceSampleSize: row?.observedSoldPriceSampleSize ?? 0,
      mileageSampleSize: row?.mileageSampleSize ?? 0,
    },
    coverage: {
      lastRelevantCrawlAt: coverageState.lastRelevantCrawlAt,
      sampleSize: row?.sampleSize ?? 0,
      includesCurrent: row?.includesCurrent ?? false,
      includesSold: row?.includesSold ?? false,
      dataSource: filters.transmission ? "search_and_detail_data" : "search_result_data",
      completeness: coverageState.completeness,
    },
  };
}

async function getMarketOverTime(sql: Sql, filters: ListingFiltersQuery): Promise<MarketOverTimePoint[]> {
  const interval = filters.interval;
  const bucketStep = intervalToSqlInterval(interval);
  const runTimeFilter = buildCompletedRunTimeWhere(filters);
  const requiredRunKindCount = filters.availability === "all" ? 2 : 1;
  const { whereSql, params: snapshotParams } = buildFilterWhere(
    {
      ...filters,
      from: undefined,
      to: undefined,
    },
    { startIndex: runTimeFilter.params.length },
  );
  const params = [...runTimeFilter.params, ...snapshotParams];
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
      askingPriceSampleSize: number;
      observedSoldPriceSampleSize: number;
    }[]
  >(
    `
      with selected_runs as (
        select distinct on (date_trunc('${interval}', cr.finished_at), cr.search_query_id)
          cr.id,
          cr.search_query_id,
          cr.crawl_kind,
          date_trunc('${interval}', cr.finished_at) as bucket_start
        from crawl_runs cr
        ${runTimeFilter.whereSql}
        order by date_trunc('${interval}', cr.finished_at), cr.search_query_id, cr.finished_at desc
      ),
      complete_buckets as (
        select bucket_start
        from selected_runs
        group by bucket_start
        having count(distinct crawl_kind) = ${requiredRunKindCount}
      ),
      sighting_buckets as (
        select
          run.bucket_start,
          sighting.listing_id,
          max(sighting.seen_at) as seen_at
        from selected_runs run
        join complete_buckets complete_bucket on complete_bucket.bucket_start = run.bucket_start
        join listing_sightings sighting on sighting.crawl_run_id = run.id
        group by run.bucket_start, sighting.listing_id
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
        count(*)::int as "sampleSize",
        count(asking_price_eur)::int as "askingPriceSampleSize",
        count(observed_sold_price_eur)::int as "observedSoldPriceSampleSize"
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
    askingPriceSampleSize: row.askingPriceSampleSize,
    observedSoldPriceSampleSize: row.observedSoldPriceSampleSize,
  }));
}

async function getPriceByYear(sql: Sql, filters: ListingFiltersQuery): Promise<PriceByYearPoint[]> {
  const { whereSql, params } = buildFilterWhere(filters);
  const analyticsMileageSql = validAnalyticsMileageSql("s");
  const rows = await sql.unsafe<
    {
      yearModel: number;
      listingCount: number;
      askingPriceSampleSize: number;
      observedSoldPriceSampleSize: number;
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
        count(s.asking_price_eur)::int as "askingPriceSampleSize",
        count(s.observed_sold_price_eur)::int as "observedSoldPriceSampleSize",
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
      ${appendWhereCondition(whereSql, "s.year_model is not null")}
      group by s.year_model
      order by s.year_model asc
    `,
    params,
  );

  return rows.map((row) => ({
    yearModel: row.yearModel,
    listingCount: row.listingCount,
    askingPriceSampleSize: row.askingPriceSampleSize,
    observedSoldPriceSampleSize: row.observedSoldPriceSampleSize,
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
      askingPriceSampleSize: number;
      observedSoldPriceSampleSize: number;
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
        count(s.asking_price_eur)::int as "askingPriceSampleSize",
        count(s.observed_sold_price_eur)::int as "observedSoldPriceSampleSize",
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
    askingPriceSampleSize: row.askingPriceSampleSize,
    observedSoldPriceSampleSize: row.observedSoldPriceSampleSize,
    medianYearModel: nullableNumber(row.medianYearModel),
    askingPriceP25Eur: nullableNumber(row.askingPriceP25Eur),
    medianAskingPriceEur: nullableNumber(row.medianAskingPriceEur),
    askingPriceP75Eur: nullableNumber(row.askingPriceP75Eur),
    observedSoldPriceP25Eur: nullableNumber(row.observedSoldPriceP25Eur),
    medianObservedSoldPriceEur: nullableNumber(row.medianObservedSoldPriceEur),
    observedSoldPriceP75Eur: nullableNumber(row.observedSoldPriceP75Eur),
  }));
}

async function getPriceByTransmission(
  sql: Sql,
  filters: ListingFiltersQuery,
): Promise<PriceByTransmissionPoint[]> {
  const { whereSql, params } = buildFilterWhere(filters);
  const analyticsMileageSql = validAnalyticsMileageSql("s");
  const rows = await sql.unsafe<
    Array<
      Omit<PriceByTransmissionPoint, "medianMileageKm" | "askingPriceP25Eur" | "medianAskingPriceEur" | "askingPriceP75Eur" | "observedSoldPriceP25Eur" | "medianObservedSoldPriceEur" | "observedSoldPriceP75Eur"> & {
        medianMileageKm: number | string | null;
        askingPriceP25Eur: number | string | null;
        medianAskingPriceEur: number | string | null;
        askingPriceP75Eur: number | string | null;
        observedSoldPriceP25Eur: number | string | null;
        medianObservedSoldPriceEur: number | string | null;
        observedSoldPriceP75Eur: number | string | null;
      }
    >
  >(
    `
      with latest_snapshots as (${latestSnapshotSql()})
      select
        s.transmission_source_label as transmission,
        count(*)::int as "listingCount",
        count(s.asking_price_eur)::int as "askingPriceSampleSize",
        count(s.observed_sold_price_eur)::int as "observedSoldPriceSampleSize",
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
      ${appendWhereCondition(whereSql, "s.transmission_source_label is not null")}
      group by s.transmission_source_label
      order by "listingCount" desc, transmission asc
      limit 12
    `,
    params,
  );

  return rows.map((row) => ({
    ...row,
    medianMileageKm: nullableNumber(row.medianMileageKm),
    askingPriceP25Eur: nullableNumber(row.askingPriceP25Eur),
    medianAskingPriceEur: nullableNumber(row.medianAskingPriceEur),
    askingPriceP75Eur: nullableNumber(row.askingPriceP75Eur),
    observedSoldPriceP25Eur: nullableNumber(row.observedSoldPriceP25Eur),
    medianObservedSoldPriceEur: nullableNumber(row.medianObservedSoldPriceEur),
    observedSoldPriceP75Eur: nullableNumber(row.observedSoldPriceP75Eur),
  }));
}

async function getSearchCoverage(
  sql: Sql,
  filters: Partial<ListingFiltersQuery>,
  matches: Pick<CoverageMetadata, "sampleSize" | "includesCurrent" | "includesSold">,
): Promise<CoverageMetadata> {
  const coverageState = await getCoverageState(sql, filters.availability);

  return {
    lastRelevantCrawlAt: coverageState.lastRelevantCrawlAt,
    ...matches,
    dataSource: filters.transmission ? "search_and_detail_data" : "search_result_data",
    completeness: coverageState.completeness,
  };
}

async function getCoverageState(
  sql: Sql,
  availability: ListingFiltersQuery["availability"] | undefined,
): Promise<Pick<CoverageMetadata, "completeness" | "lastRelevantCrawlAt">> {
  const rows = await sql<{ crawlKind: "current" | "sold"; status: string; finishedAt: string }[]>`
    select distinct on (crawl_kind)
      crawl_kind as "crawlKind",
      status,
      coalesce(finished_at, updated_at, created_at)::text as "finishedAt"
    from crawl_runs
    where status in ('completed', 'partial')
    order by crawl_kind, coalesce(finished_at, updated_at, created_at) desc
  `;
  const relevantKinds =
    availability === "current"
      ? new Set(["current"])
      : availability === "sold"
        ? new Set(["sold"])
        : new Set(["current", "sold"]);
  const relevantRows = rows.filter((row) => relevantKinds.has(row.crawlKind));

  if (relevantRows.length === 0) {
    return { completeness: "unknown", lastRelevantCrawlAt: null };
  }

  if (relevantRows.length < relevantKinds.size) {
    return {
      completeness: "partial",
      lastRelevantCrawlAt: relevantRows.map((row) => row.finishedAt).sort()[0] ?? null,
    };
  }

  return {
    completeness: relevantRows.some((row) => row.status === "partial") ? "partial" : "complete",
    lastRelevantCrawlAt: relevantRows.map((row) => row.finishedAt).sort()[0] ?? null,
  };
}

function emptyAnalyticsTrend(
  query: ListingSearchQuery,
  summaryAndCoverage: Pick<AnalyticsTrendResponse, "summary" | "coverage">,
): AnalyticsTrendResponse {
  return {
    appliedFilters: query,
    coverage: summaryAndCoverage.coverage,
    summary: summaryAndCoverage.summary,
    charts: {
      marketOverTime: [],
      priceByYear: [],
      priceByMileageBucket: [],
      priceByTransmission: [],
    },
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

async function getLatestFailedJobs(
  sql: Sql,
): Promise<AdminCrawlerDiagnosticsResponse["latestFailedJobs"]> {
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

  return sql<AdminCrawlerDiagnosticsResponse["latestFailedJobs"]>`
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
    select snapshot.*
    from listings current_listing
    join listing_snapshots snapshot on snapshot.id = current_listing.latest_snapshot_id
  `;
}

function buildFilterWhere(
  filters: Partial<ListingFiltersQuery>,
  options: { snapshotAlias?: string; startIndex?: number } = {},
) {
  const snapshotAlias = options.snapshotAlias ?? "s";
  const startIndex = options.startIndex ?? 0;
  const column = (name: string) => `${snapshotAlias}.${name}`;
  const conditions: string[] = [];
  const params: SqlParameter[] = [];
  const add = (condition: string, value: SqlParameter) => {
    params.push(value);
    conditions.push(condition.replace("?", `$${startIndex + params.length}`));
  };

  if (filters.make) {
    add(`${column("make_source_label")} = ?`, filters.make);
  }
  if (filters.model) {
    add(`${column("model_source_label")} = ?`, filters.model);
  }
  if (filters.modelYear !== undefined) {
    add(`${column("year_model")} = ?`, filters.modelYear);
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
  if (filters.transmission) {
    add(`${column("transmission_source_label")} = ?`, filters.transmission);
  }
  if (filters.availability === "current") {
    conditions.push(`${column("availability")} = 'active'`);
  }
  if (filters.availability === "sold") {
    conditions.push(`${column("availability")} = 'sold'`);
  }
  if (filters.availability === "all") {
    conditions.push(`${column("availability")} in ('active', 'sold')`);
  }
  return {
    whereSql: conditions.length > 0 ? `where ${conditions.join(" and ")}` : "",
    params,
  };
}

function buildCompletedRunTimeWhere(
  filters: Pick<ListingFiltersQuery, "availability" | "from" | "to">,
) {
  const conditions: string[] = [];
  const params: SqlParameter[] = [];
  const add = (condition: string, value: SqlParameter) => {
    params.push(value);
    conditions.push(condition.replace("?", `$${params.length}`));
  };

  conditions.push("cr.status = 'completed'");
  conditions.push("cr.is_complete = true");
  conditions.push("cr.finished_at is not null");
  if (filters.availability === "current") {
    conditions.push("cr.crawl_kind = 'current'");
  }
  if (filters.availability === "sold") {
    conditions.push("cr.crawl_kind = 'sold'");
  }

  if (filters.from) {
    add("cr.finished_at >= ?::date", filters.from);
  } else if (filters.to) {
    add(
      `cr.finished_at >= (?::date - interval '${ANALYTICS_DEFAULT_TREND_LOOKBACK_DAYS} days')`,
      filters.to,
    );
  }
  if (filters.to) {
    add("cr.finished_at < (?::date + interval '1 day')", filters.to);
  }
  if (!filters.from && !filters.to) {
    conditions.push(
      `cr.finished_at >= now() - interval '${ANALYTICS_DEFAULT_TREND_LOOKBACK_DAYS} days'`,
    );
  }

  return {
    whereSql: conditions.length > 0 ? `where ${conditions.join(" and ")}` : "",
    params,
  };
}

function appendWhereCondition(whereSql: string, condition: string) {
  return whereSql ? `${whereSql} and ${condition}` : `where ${condition}`;
}

function hasSnapshotFilters(filters: ListingSearchQuery) {
  return (
    filters.make !== undefined ||
    filters.model !== undefined ||
    filters.modelYear !== undefined ||
    filters.modelYearFrom !== undefined ||
    filters.modelYearTo !== undefined ||
    filters.priceMin !== undefined ||
    filters.priceMax !== undefined ||
    filters.mileageMin !== undefined ||
    filters.mileageMax !== undefined ||
    filters.sellerType !== undefined ||
    filters.transmission !== undefined
  );
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
      return "coalesce(s.asking_price_eur, s.observed_sold_price_eur) asc nulls last, l.id asc";
    case "priceDesc":
      return "coalesce(s.asking_price_eur, s.observed_sold_price_eur) desc nulls last, l.id asc";
    case "mileageAsc":
      return "s.mileage_km asc nulls last, l.id asc";
    case "mileageDesc":
      return "s.mileage_km desc nulls last, l.id asc";
    case "yearDesc":
      return "s.year_model desc nulls last, l.id asc";
    case "sourceUpdatedDesc":
      return "s.source_updated_date desc nulls last, l.last_seen_at desc nulls last, l.id asc";
    case "lastSeenDesc":
    default:
      return "l.last_seen_at desc nulls last, l.id asc";
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

function equipmentGroupValues(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const label = stringValue(item.label);
    const items = Array.isArray(item.items)
      ? item.items.flatMap((entry) => {
          const parsed = stringValue(entry);
          return parsed ? [parsed] : [];
        })
      : [];
    return label && items.length > 0 ? [{ label, items }] : [];
  });
}

function detailFieldValues(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const label = stringValue(item.label);
    const fieldValue = stringValue(item.value);
    return label && fieldValue ? [{ label, value: fieldValue }] : [];
  });
}
