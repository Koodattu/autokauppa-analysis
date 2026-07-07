import type postgres from "postgres";
import { sha256, stableStringify } from "./nettiauto";
import type {
  NettiautoQueryParams,
  NettiautoResponseBodyShape,
  ParsedNettiautoDetailPage,
  ParsedListingCard,
  ParsedSearchResultPage,
} from "./nettiauto";

export interface SourceSearchQuerySeed {
  source: "nettiauto";
  vehicleCategory: "passenger_car";
  crawlKind: "current" | "sold";
  entryPath: string;
  sourceSearchHash: string;
  queryParams: Record<string, unknown>;
  targetCadenceInterval: string;
  priority: number;
  notes: string;
}

export const DEFAULT_NETTIAUTO_SOURCE_QUERIES: SourceSearchQuerySeed[] = [
  {
    source: "nettiauto",
    vehicleCategory: "passenger_car",
    crawlKind: "current",
    entryPath: "/vaihtoautot",
    sourceSearchHash: "P2236304442",
    queryParams: { haku: "P2236304442", sortCol: "dateCreated", ord: "desc" },
    targetCadenceInterval: "7 days",
    priority: 10,
    notes: "Default current passenger-car Nettiauto search query, newest first, weekly cadence.",
  },
  {
    source: "nettiauto",
    vehicleCategory: "passenger_car",
    crawlKind: "sold",
    entryPath: "/hakutulokset",
    sourceSearchHash: "P82984997",
    queryParams: { haku: "P82984997", sortCol: "dateCreated", ord: "desc" },
    targetCadenceInterval: "30 days",
    priority: 50,
    notes: "Default sold passenger-car Nettiauto search query, newest first, monthly cadence.",
  },
];

export interface SourceSearchQueryScheduleState {
  force?: boolean;
  hasActiveCrawlRun: boolean;
  lastAttemptAt: Date | string | null;
  targetCadenceSeconds: number | null;
}

export interface PersistSearchResultPageInput {
  crawlRunId: string;
  searchQueryId: string;
  crawlKind: "current" | "sold";
  vehicleCategory: "passenger_car";
  sourceUrl: string;
  pageNumber: number;
  responseStatus: number | null;
  responseContentType: string | null;
  responseBodyShape: NettiautoResponseBodyShape;
  responseBodySha256: string | null;
  responseBytes: number | null;
  durationMs: number | null;
  requestHeaders: Record<string, string>;
  errorType?: string | null;
  errorMessage?: string | null;
  fetchedAt?: Date;
  parsedPage: ParsedSearchResultPage;
}

export interface PersistSearchResultPageResult {
  sourceFetchId: string;
  listingCount: number;
  issueCount: number;
}

export interface PersistNettiautoDetailPageInput {
  crawlRunId: string;
  searchQueryId: string;
  sourceListingId: string;
  sourceUrl: string;
  responseStatus: number | null;
  responseContentType: string | null;
  responseBodyShape: NettiautoResponseBodyShape;
  responseBodySha256: string | null;
  responseBytes: number | null;
  durationMs: number | null;
  requestHeaders: Record<string, string>;
  errorType?: string | null;
  errorMessage?: string | null;
  fetchedAt?: Date;
  parsedDetail?: ParsedNettiautoDetailPage | null;
}

export interface PersistNettiautoDetailPageResult {
  sourceFetchId: string;
  rawListingRecordId: string | null;
  listingId: string | null;
  sourceUpdatedDate: string | null;
}

type SqlClient = postgres.Sql<Record<string, unknown>>;
type TransactionSqlClient = postgres.TransactionSql<Record<string, unknown>>;

function jsonValue(value: unknown): postgres.JSONValue {
  return value as postgres.JSONValue;
}

function firstParseIssue(page: ParsedSearchResultPage) {
  return page.issues[0] ?? null;
}

export async function seedDefaultSourceSearchQueries(sql: SqlClient) {
  for (const seed of DEFAULT_NETTIAUTO_SOURCE_QUERIES) {
    await sql`
      insert into source_search_queries (
        source,
        vehicle_category,
        crawl_kind,
        entry_path,
        source_search_hash,
        query_params,
        enabled,
        priority,
        target_cadence_interval,
        created_at,
        updated_at,
        notes
      )
      values (
        ${seed.source},
        ${seed.vehicleCategory},
        ${seed.crawlKind},
        ${seed.entryPath},
        ${seed.sourceSearchHash},
        ${sql.json(jsonValue(seed.queryParams))},
        true,
        ${seed.priority},
        ${seed.targetCadenceInterval}::interval,
        now(),
        now(),
        ${seed.notes}
      )
      on conflict (source, vehicle_category, crawl_kind, source_search_hash)
      do update set
        entry_path = excluded.entry_path,
        query_params = excluded.query_params,
        priority = excluded.priority,
        target_cadence_interval = coalesce(
          source_search_queries.target_cadence_interval,
          excluded.target_cadence_interval
        ),
        updated_at = now(),
        notes = excluded.notes
    `;
  }
}

export async function createCrawlRunForSourceQuery(sql: SqlClient, searchQueryId: string) {
  const [row] = await sql<{ id: string }[]>`
    insert into crawl_runs (
      source,
      search_query_id,
      crawl_kind,
      vehicle_category,
      status,
      started_at,
      created_at,
      updated_at
    )
    select
      source,
      id,
      crawl_kind,
      vehicle_category,
      'running',
      now(),
      now(),
      now()
    from source_search_queries
    where id = ${searchQueryId}
    returning id
  `;

  if (!row) {
    throw new Error(`Source search query not found: ${searchQueryId}`);
  }

  return row.id;
}

export async function markStaleCrawlRunsPartial(
  sql: SqlClient,
  options: { staleAfterInterval?: string } = {},
) {
  const staleAfterInterval = options.staleAfterInterval ?? "2 hours";
  return sql<{ id: string }[]>`
    update crawl_runs
    set
      status = 'partial',
      finished_at = now(),
      is_complete = false,
      failure_reason = 'stale_running_crawl_recovered',
      updated_at = now()
    where status in ('planned', 'running')
      and updated_at < now() - ${staleAfterInterval}::interval
    returning id
  `;
}

export async function getEnabledSourceSearchQueries(sql: SqlClient) {
  return sql<
    {
      id: string;
      source: "nettiauto";
      vehicleCategory: "passenger_car";
      crawlKind: "current" | "sold";
      entryPath: string;
      sourceSearchHash: string;
      queryParams: NettiautoQueryParams;
      priority: number;
    }[]
  >`
    select
      id,
      source,
      vehicle_category as "vehicleCategory",
      crawl_kind as "crawlKind",
      entry_path as "entryPath",
      source_search_hash as "sourceSearchHash",
      query_params as "queryParams",
      priority
    from source_search_queries
    where enabled = true
    order by priority asc, created_at asc
  `;
}

export async function getSchedulableSourceSearchQueries(
  sql: SqlClient,
  options: { force?: boolean; now?: Date } = {},
) {
  const rows = await sql<
    Array<{
      id: string;
      source: "nettiauto";
      vehicleCategory: "passenger_car";
      crawlKind: "current" | "sold";
      entryPath: string;
      sourceSearchHash: string;
      queryParams: NettiautoQueryParams;
      priority: number;
      targetCadenceSeconds: number | null;
      lastAttemptAt: Date | null;
      hasActiveCrawlRun: boolean;
    }>
  >`
    select
      query.id,
      query.source,
      query.vehicle_category as "vehicleCategory",
      query.crawl_kind as "crawlKind",
      query.entry_path as "entryPath",
      query.source_search_hash as "sourceSearchHash",
      query.query_params as "queryParams",
      query.priority,
      extract(epoch from query.target_cadence_interval)::int as "targetCadenceSeconds",
      case
        when query.last_success_at is null then query.last_failure_at
        when query.last_failure_at is null then query.last_success_at
        else greatest(query.last_success_at, query.last_failure_at)
      end as "lastAttemptAt",
      exists (
        select 1
        from crawl_runs run
        where run.search_query_id = query.id
          and run.status in ('planned', 'running')
      ) as "hasActiveCrawlRun"
    from source_search_queries query
    where query.enabled = true
    order by query.priority asc, query.created_at asc
  `;

  return rows
    .filter((row) =>
      shouldScheduleSourceSearchQuery(
        {
          force: options.force,
          hasActiveCrawlRun: row.hasActiveCrawlRun,
          lastAttemptAt: row.lastAttemptAt,
          targetCadenceSeconds: row.targetCadenceSeconds,
        },
        options.now,
      ),
    )
    .map(({ targetCadenceSeconds, lastAttemptAt, hasActiveCrawlRun, ...query }) => query);
}

export function shouldScheduleSourceSearchQuery(
  query: SourceSearchQueryScheduleState,
  now = new Date(),
) {
  if (query.hasActiveCrawlRun) {
    return false;
  }

  if (query.force) {
    return true;
  }

  if (query.targetCadenceSeconds === null) {
    return true;
  }

  if (!query.lastAttemptAt) {
    return true;
  }

  const lastAttemptAt =
    query.lastAttemptAt instanceof Date ? query.lastAttemptAt : new Date(query.lastAttemptAt);
  const lastAttemptMs = lastAttemptAt.getTime();
  if (!Number.isFinite(lastAttemptMs)) {
    return true;
  }

  return lastAttemptMs + query.targetCadenceSeconds * 1000 <= now.getTime();
}

export async function markCrawlRunFinished(
  sql: SqlClient,
  input: {
    crawlRunId: string;
    status: "completed" | "partial" | "failed";
    expectedPageCount: number | null;
    sourceTotalAds: number | null;
    failureReason?: string | null;
  },
) {
  await sql`
    update crawl_runs
    set
      status = ${input.status},
      finished_at = now(),
      expected_page_count = coalesce(${input.expectedPageCount}, expected_page_count),
      source_total_ads = coalesce(${input.sourceTotalAds}, source_total_ads),
      is_complete = ${input.status === "completed"},
      failure_reason = ${input.failureReason ?? null},
      updated_at = now()
    where id = ${input.crawlRunId}
  `;

  if (input.status === "completed") {
    await sql`
      update source_search_queries query
      set
        last_complete_crawl_run_id = run.id,
        last_success_at = now(),
        updated_at = now()
      from crawl_runs run
      where run.id = ${input.crawlRunId}
        and query.id = run.search_query_id
    `;
  }

  if (input.status === "failed" || input.status === "partial") {
    await sql`
      update source_search_queries query
      set
        last_failure_at = now(),
        updated_at = now()
      from crawl_runs run
      where run.id = ${input.crawlRunId}
        and query.id = run.search_query_id
    `;
  }
}

export async function persistSearchResultPage(
  sql: SqlClient,
  input: PersistSearchResultPageInput,
): Promise<PersistSearchResultPageResult> {
  return sql.begin(async (tx) => {
    const fetchedAt = input.fetchedAt ?? new Date();
    const fetchRows = (await tx`
      insert into source_fetches (
        crawl_run_id,
        search_query_id,
        source,
        fetch_kind,
        page_number,
        source_url,
        request_headers,
        response_status,
        response_content_type,
        response_body_shape,
        response_body_sha256,
        response_bytes,
        fetched_at,
        duration_ms,
        error_type,
        error_message
      )
      values (
        ${input.crawlRunId},
        ${input.searchQueryId},
        'nettiauto',
        'search_result_page',
        ${input.pageNumber},
        ${input.sourceUrl},
        ${tx.json(jsonValue(input.requestHeaders))},
        ${input.responseStatus},
        ${input.responseContentType},
        ${input.responseBodyShape},
        ${input.responseBodySha256},
        ${input.responseBytes},
        ${fetchedAt},
        ${input.durationMs},
        ${input.errorType ?? firstParseIssue(input.parsedPage)?.code ?? null},
        ${input.errorMessage ?? firstParseIssue(input.parsedPage)?.message ?? null}
      )
      on conflict (crawl_run_id, fetch_kind, page_number)
      do update set
        source_url = excluded.source_url,
        request_headers = excluded.request_headers,
        response_status = excluded.response_status,
        response_content_type = excluded.response_content_type,
        response_body_shape = excluded.response_body_shape,
        response_body_sha256 = excluded.response_body_sha256,
        response_bytes = excluded.response_bytes,
        fetched_at = excluded.fetched_at,
        duration_ms = excluded.duration_ms,
        error_type = excluded.error_type,
        error_message = excluded.error_message
      returning id
    `) as unknown as Array<{ id: string }>;
    const [fetchRow] = fetchRows;

    if (!fetchRow) {
      throw new Error("Failed to insert source fetch.");
    }

    for (const listing of input.parsedPage.listings) {
      await persistListingCard(tx, {
        ...input,
        sourceFetchId: fetchRow.id,
        fetchedAt,
        listing,
      });
    }

    await tx`
      update crawl_runs
      set
        fetched_page_count = (
          select count(*)
          from source_fetches
          where crawl_run_id = ${input.crawlRunId}
            and fetch_kind = 'search_result_page'
        ),
        parsed_listing_count = (
          select count(*)
          from raw_listing_records
          where crawl_run_id = ${input.crawlRunId}
            and parser_status = 'parsed'
        ),
        expected_page_count = coalesce(${input.parsedPage.totalPages}, expected_page_count),
        source_total_ads = coalesce(${input.parsedPage.totalAds}, source_total_ads),
        updated_at = now()
      where id = ${input.crawlRunId}
    `;

    return {
      sourceFetchId: fetchRow.id,
      listingCount: input.parsedPage.listings.length,
      issueCount: input.parsedPage.issues.length,
    };
  });
}

export async function persistNettiautoDetailPage(
  sql: SqlClient,
  input: PersistNettiautoDetailPageInput,
): Promise<PersistNettiautoDetailPageResult> {
  return sql.begin(async (tx) => {
    const fetchedAt = input.fetchedAt ?? new Date();
    const fetchRows = (await tx`
      insert into source_fetches (
        crawl_run_id,
        search_query_id,
        source,
        fetch_kind,
        page_number,
        source_url,
        request_headers,
        response_status,
        response_content_type,
        response_body_shape,
        response_body_sha256,
        response_bytes,
        fetched_at,
        duration_ms,
        error_type,
        error_message
      )
      values (
        ${input.crawlRunId},
        ${input.searchQueryId},
        'nettiauto',
        'detail_page',
        null,
        ${input.sourceUrl},
        ${tx.json(jsonValue(input.requestHeaders))},
        ${input.responseStatus},
        ${input.responseContentType},
        ${input.responseBodyShape},
        ${input.responseBodySha256},
        ${input.responseBytes},
        ${fetchedAt},
        ${input.durationMs},
        ${input.errorType ?? null},
        ${input.errorMessage ?? null}
      )
      returning id
    `) as unknown as Array<{ id: string }>;
    const [fetchRow] = fetchRows;

    if (!fetchRow) {
      throw new Error("Failed to insert detail source fetch.");
    }

    if (!input.parsedDetail) {
      return {
        sourceFetchId: fetchRow.id,
        rawListingRecordId: null,
        listingId: null,
        sourceUpdatedDate: null,
      };
    }

    const sourcePayload = input.parsedDetail.sourcePayload;
    const rawRecordRows = (await tx`
      insert into raw_listing_records (
        source,
        source_listing_id,
        crawl_run_id,
        source_fetch_id,
        record_kind,
        source_url,
        source_payload,
        source_html_fragment,
        source_payload_sha256,
        source_updated_date,
        parser_version,
        parser_status,
        captured_at,
        parse_error
      )
      values (
        'nettiauto',
        ${input.sourceListingId},
        ${input.crawlRunId},
        ${fetchRow.id},
        'detail_page',
        ${input.sourceUrl},
        ${tx.json(jsonValue(sourcePayload))},
        ${input.parsedDetail.sourceHtmlFragment},
        ${sha256(stableStringify(sourcePayload))},
        ${input.parsedDetail.sourceUpdatedDate}::date,
        ${input.parsedDetail.parserVersion},
        'parsed',
        ${fetchedAt},
        null
      )
      returning id
    `) as unknown as Array<{ id: string }>;
    const [rawRecord] = rawRecordRows;

    if (!rawRecord) {
      throw new Error("Failed to insert detail raw listing record.");
    }

    const listingId = await updateListingFromDetailPage(tx, {
      rawListingRecordId: rawRecord.id,
      sourceListingId: input.sourceListingId,
      parsedDetail: input.parsedDetail,
    });

    if (listingId) {
      await persistDetailImages(tx, {
        listingId,
        rawListingRecordId: rawRecord.id,
        fetchedAt,
        images: input.parsedDetail.images,
      });
    }

    return {
      sourceFetchId: fetchRow.id,
      rawListingRecordId: rawRecord.id,
      listingId,
      sourceUpdatedDate: input.parsedDetail.sourceUpdatedDate,
    };
  });
}

async function persistListingCard(
  tx: TransactionSqlClient,
  input: PersistSearchResultPageInput & {
    sourceFetchId: string;
    fetchedAt: Date;
    listing: ParsedListingCard;
  },
) {
  const normalized = input.listing.normalized;
  const rawRecordRows = (await tx`
    insert into raw_listing_records (
      source,
      source_listing_id,
      crawl_run_id,
      source_fetch_id,
      record_kind,
      source_url,
      source_payload,
      source_html_fragment,
      source_payload_sha256,
      parser_version,
      parser_status,
      captured_at,
      parse_error
    )
    values (
      'nettiauto',
      ${input.listing.sourceListingId},
      ${input.crawlRunId},
      ${input.sourceFetchId},
      'search_result_card',
      ${normalized.sourceUrl},
      ${tx.json(jsonValue(input.listing.sourcePayload))},
      ${input.listing.sourceHtmlFragment},
      ${input.listing.sourcePayloadSha256},
      ${input.listing.parserVersion},
      'parsed',
      ${input.fetchedAt},
      null
    )
    on conflict (source_fetch_id, source_listing_id, record_kind)
    do update set
      source_url = excluded.source_url,
      source_payload = excluded.source_payload,
      source_html_fragment = excluded.source_html_fragment,
      source_payload_sha256 = excluded.source_payload_sha256,
      parser_version = excluded.parser_version,
      parser_status = excluded.parser_status,
      captured_at = excluded.captured_at,
      parse_error = excluded.parse_error
    returning id
  `) as unknown as Array<{ id: string }>;
  const [rawRecord] = rawRecordRows;

  if (!rawRecord) {
    throw new Error("Failed to insert raw listing record.");
  }

  const listingRows = (await tx`
    insert into listings (
      source,
      source_listing_id,
      vehicle_category,
      canonical_source_url,
      current_availability,
      availability_last_confirmed_at,
      first_seen_at,
      last_seen_at,
      last_raw_listing_record_id,
      created_at,
      updated_at
    )
    values (
      'nettiauto',
      ${input.listing.sourceListingId},
      ${input.vehicleCategory},
      ${normalized.sourceUrl},
      ${normalized.availability},
      ${input.fetchedAt},
      ${input.fetchedAt},
      ${input.fetchedAt},
      ${rawRecord.id},
      now(),
      now()
    )
    on conflict (source, source_listing_id)
    do update set
      vehicle_category = excluded.vehicle_category,
      canonical_source_url = coalesce(excluded.canonical_source_url, listings.canonical_source_url),
      current_availability = excluded.current_availability,
      availability_last_confirmed_at = excluded.availability_last_confirmed_at,
      last_seen_at = greatest(listings.last_seen_at, excluded.last_seen_at),
      last_raw_listing_record_id = excluded.last_raw_listing_record_id,
      updated_at = now()
    returning id
  `) as unknown as Array<{ id: string }>;
  const [listing] = listingRows;

  if (!listing) {
    throw new Error("Failed to upsert listing.");
  }

  await tx`
    insert into listing_sightings (
      listing_id,
      crawl_run_id,
      search_query_id,
      source_fetch_id,
      raw_listing_record_id,
      crawl_kind,
      seen_at,
      page_number,
      position,
      source_list_id,
      source_status_label
    )
    values (
      ${listing.id},
      ${input.crawlRunId},
      ${input.searchQueryId},
      ${input.sourceFetchId},
      ${rawRecord.id},
      ${input.crawlKind},
      ${input.fetchedAt},
      ${normalized.pageNumber},
      ${normalized.position},
      ${normalized.sourceListId},
      ${normalized.sourceStatusLabel}
    )
    on conflict (crawl_run_id, listing_id, source_fetch_id)
    do update set
      raw_listing_record_id = excluded.raw_listing_record_id,
      seen_at = excluded.seen_at,
      page_number = excluded.page_number,
      position = excluded.position,
      source_list_id = excluded.source_list_id,
      source_status_label = excluded.source_status_label
  `;

  await tx`
    insert into listing_snapshots (
      listing_id,
      raw_listing_record_id,
      parser_version,
      observed_at,
      availability,
      source_status_label,
      asking_price_eur,
      observed_sold_price_eur,
      price_source_label,
      mileage_km,
      mileage_source_label,
      year_model,
      make_source_label,
      model_source_label,
      fuel_type_source_label,
      transmission_source_label,
      body_type_source_label,
      color_source_label,
      seller_source_label,
      seller_type_source_label,
      normalized_data,
      change_hash,
      created_at
    )
    values (
      ${listing.id},
      ${rawRecord.id},
      ${input.listing.parserVersion},
      ${input.fetchedAt},
      ${normalized.availability},
      ${normalized.sourceStatusLabel},
      ${normalized.askingPriceEur},
      ${normalized.observedSoldPriceEur},
      ${normalized.priceSourceLabel},
      ${normalized.mileageKm},
      ${normalized.mileageSourceLabel},
      ${normalized.yearModel},
      ${normalized.makeSourceLabel},
      ${normalized.modelSourceLabel},
      ${normalized.fuelTypeSourceLabel},
      ${normalized.transmissionSourceLabel},
      ${normalized.bodyTypeSourceLabel},
      ${normalized.colorSourceLabel},
      ${normalized.sellerSourceLabel},
      ${normalized.sellerTypeSourceLabel},
      ${tx.json(jsonValue(normalized))},
      ${input.listing.changeHash},
      now()
    )
    on conflict (listing_id, change_hash) do nothing
  `;

  for (const image of input.listing.images) {
    await tx`
      insert into listing_images (
        listing_id,
        source,
        image_url,
        image_role,
        position,
        width,
        height,
        first_seen_at,
        last_seen_at,
        last_raw_listing_record_id
      )
      values (
        ${listing.id},
        'nettiauto',
        ${image.imageUrl},
        ${image.imageRole},
        ${image.position},
        ${image.width},
        ${image.height},
        ${input.fetchedAt},
        ${input.fetchedAt},
        ${rawRecord.id}
      )
      on conflict (listing_id, image_url)
      do update set
        image_role = excluded.image_role,
        position = excluded.position,
        width = excluded.width,
        height = excluded.height,
        last_seen_at = excluded.last_seen_at,
        last_raw_listing_record_id = excluded.last_raw_listing_record_id
    `;
  }
}

async function updateListingFromDetailPage(
  tx: TransactionSqlClient,
  input: {
    rawListingRecordId: string;
    sourceListingId: string;
    parsedDetail: ParsedNettiautoDetailPage;
  },
) {
  const sourceUpdatedDate = input.parsedDetail.sourceUpdatedDate;
  const detailData = input.parsedDetail.normalizedData;
  const detailPayload = jsonValue(detailData);

  const listingRows = sourceUpdatedDate
    ? ((await tx`
        update listings
        set
          source_updated_date = greatest(
            coalesce(source_updated_date, ${sourceUpdatedDate}::date),
            ${sourceUpdatedDate}::date
          ),
          updated_at = now()
        where source = 'nettiauto'
          and source_listing_id = ${input.sourceListingId}
        returning id
      `) as unknown as Array<{ id: string }>)
    : ((await tx`
        select id
        from listings
        where source = 'nettiauto'
          and source_listing_id = ${input.sourceListingId}
        limit 1
      `) as unknown as Array<{ id: string }>);
  const [listing] = listingRows;

  if (!listing) {
    return null;
  }

  await tx`
    update listing_snapshots
    set
      source_updated_date = coalesce(${sourceUpdatedDate}::date, source_updated_date),
      mileage_km = coalesce(${detailData.mileageKm}, mileage_km),
      year_model = coalesce(${detailData.yearModel}, year_model),
      fuel_type_source_label = coalesce(${detailData.fuelTypeSourceLabel}, fuel_type_source_label),
      transmission_source_label = coalesce(${detailData.transmissionSourceLabel}, transmission_source_label),
      body_type_source_label = coalesce(${detailData.bodyTypeSourceLabel}, body_type_source_label),
      color_source_label = coalesce(${detailData.colorSourceLabel}, color_source_label),
      normalized_data = normalized_data || jsonb_strip_nulls(${tx.json(detailPayload)}::jsonb)
    where id = (
      select id
      from listing_snapshots
      where listing_id = ${listing.id}
      order by observed_at desc, created_at desc
      limit 1
    )
  `;

  return listing.id;
}

async function persistDetailImages(
  tx: TransactionSqlClient,
  input: {
    listingId: string;
    rawListingRecordId: string;
    fetchedAt: Date;
    images: ParsedNettiautoDetailPage["images"];
  },
) {
  for (const image of input.images) {
    await tx`
      insert into listing_images (
        listing_id,
        source,
        image_url,
        image_role,
        position,
        width,
        height,
        first_seen_at,
        last_seen_at,
        last_raw_listing_record_id
      )
      values (
        ${input.listingId},
        'nettiauto',
        ${image.imageUrl},
        ${image.imageRole},
        ${image.position},
        ${image.width},
        ${image.height},
        ${input.fetchedAt},
        ${input.fetchedAt},
        ${input.rawListingRecordId}
      )
      on conflict (listing_id, image_url)
      do update set
        image_role = excluded.image_role,
        position = excluded.position,
        width = excluded.width,
        height = excluded.height,
        last_seen_at = excluded.last_seen_at,
        last_raw_listing_record_id = excluded.last_raw_listing_record_id
    `;
  }
}
