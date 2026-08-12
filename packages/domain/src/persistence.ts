import type postgres from "postgres";
import { sha256, stableStringify } from "./nettiauto";
import type {
  NettiautoDetailNormalizedData,
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
  attemptNumber?: number;
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
  attemptNumber?: number;
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
  return sql.begin(async (tx) => {
    const [sourceQuery] = await tx<{ id: string }[]>`
      select id
      from source_search_queries
      where id = ${searchQueryId}
      for update
    `;

    if (!sourceQuery) {
      throw new Error(`Source search query not found: ${searchQueryId}`);
    }

    const [row] = await tx<{ id: string }[]>`
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
      from source_search_queries source_query
      where source_query.id = ${searchQueryId}
        and not exists (
          select 1
          from crawl_runs active_run
          where active_run.search_query_id = source_query.id
            and active_run.status in ('planned', 'running')
        )
      returning id
    `;

    return row?.id ?? null;
  });
}

export async function recoverStaleCrawlRuns(
  sql: SqlClient,
  options: { staleAfterInterval?: string } = {},
) {
  const staleAfterInterval = options.staleAfterInterval ?? "2 hours";
  const staleRuns = await sql<{ id: string }[]>`
    select run.id
    from crawl_runs run
    where run.status in ('planned', 'running')
      and run.updated_at < now() - ${staleAfterInterval}::interval
      and not exists (
        select 1
        from graphile_worker.jobs job
        where job.key like 'nettiauto:search-page:' || run.id::text || ':%'
          and job.task_identifier = 'crawl_nettiauto_search_page'
          and (job.attempts < job.max_attempts or job.locked_at is not null)
      )
  `;
  const recoveredRuns: Array<{ id: string }> = [];
  for (const run of staleRuns) {
    const result = await completeCrawlRun(sql, {
      crawlRunId: run.id,
      cause: { kind: "stale_recovery", reason: "stale_running_crawl_recovered" },
    });
    if (result.changed) {
      recoveredRuns.push(run);
    }
  }
  return recoveredRuns;
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
      and (paused_until is null or paused_until <= now())
    order by priority asc, created_at asc
  `;
}

export async function getSchedulableSourceSearchQueries(
  sql: SqlClient,
  options: { force?: boolean; crawlKind?: "current" | "sold"; now?: Date } = {},
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
      and (query.paused_until is null or query.paused_until <= now())
    order by query.priority asc, query.created_at asc
  `;

  return rows
    .filter((row) => {
      if (options.crawlKind && row.crawlKind !== options.crawlKind) {
        return false;
      }

      return shouldScheduleSourceSearchQuery(
        {
          force: options.force,
          hasActiveCrawlRun: row.hasActiveCrawlRun,
          lastAttemptAt: row.lastAttemptAt,
          targetCadenceSeconds: row.targetCadenceSeconds,
        },
        options.now,
      );
    })
    .map(({ targetCadenceSeconds, lastAttemptAt, hasActiveCrawlRun, ...query }) => query);
}

export async function pauseSourceSearchQuery(
  sql: SqlClient,
  sourceQueryId: string,
  input: { pauseMs: number; reason: string; now?: Date },
) {
  const pausedUntil = new Date((input.now ?? new Date()).getTime() + input.pauseMs);
  const [row] = await sql<{ pausedUntil: string }[]>`
    update source_search_queries
    set
      paused_until = greatest(coalesce(paused_until, now()), ${pausedUntil}),
      pause_reason = ${input.reason},
      last_failure_at = now(),
      updated_at = now()
    where id = ${sourceQueryId}
    returning paused_until::text as "pausedUntil"
  `;
  return row?.pausedUntil ?? null;
}

export async function setSourceSearchQueriesPaused(
  sql: SqlClient,
  input: {
    crawlKind: "all" | "current" | "sold";
    pausedUntil: Date | null;
    reason: string | null;
  },
) {
  const rows = await sql<{ id: string }[]>`
    update source_search_queries
    set
      paused_until = ${input.pausedUntil},
      pause_reason = ${input.reason},
      updated_at = now()
    where source = 'nettiauto'
      and (${input.crawlKind} = 'all' or crawl_kind::text = ${input.crawlKind})
    returning id
  `;
  return rows.length;
}

export async function reserveCrawlRunDetailJobs(
  sql: SqlClient,
  crawlRunId: string,
  requestedCount: number,
  limit: number,
) {
  if (requestedCount <= 0 || limit <= 0) {
    return 0;
  }

  const [row] = await sql<{ reservedCount: number }[]>`
    with allowance as (
      select
        id,
        least(${requestedCount}, greatest(${limit} - detail_jobs_scheduled, 0))::int as reserved_count
      from crawl_runs
      where id = ${crawlRunId}
        and status = 'running'
      for update
    ),
    updated as (
      update crawl_runs run
      set
        detail_jobs_scheduled = run.detail_jobs_scheduled + allowance.reserved_count,
        updated_at = now()
      from allowance
      where run.id = allowance.id
      returning allowance.reserved_count
    )
    select reserved_count as "reservedCount" from updated
  `;
  return row?.reservedCount ?? 0;
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

export type CrawlRunCompletionCause =
  | { kind: "source_exhausted" }
  | { kind: "page_limit_reached"; reason?: string }
  | { kind: "source_failure"; reason: string }
  | { kind: "operator_stop"; reason: string }
  | { kind: "stale_recovery"; reason?: string };

export async function completeCrawlRun(
  sql: SqlClient,
  input: {
    crawlRunId: string;
    cause: CrawlRunCompletionCause;
  },
) {
  return sql.begin(async (tx) => {
    const runRows = (await tx`
      select
        run.id,
        run.search_query_id as "searchQueryId",
        run.crawl_kind as "crawlKind",
        run.status,
        run.started_at as "startedAt",
        run.failure_reason as "failureReason",
        run.expected_page_count as "expectedPageCount",
        run.source_total_ads as "sourceTotalAds"
      from crawl_runs run
      join source_search_queries source_query on source_query.id = run.search_query_id
      where run.id = ${input.crawlRunId}
      for update of run, source_query
    `) as unknown as Array<{
      id: string;
      searchQueryId: string;
      crawlKind: "current" | "sold";
      status: "planned" | "running" | "completed" | "partial" | "failed" | "cancelled";
      startedAt: Date | null;
      failureReason: string | null;
      expectedPageCount: number | null;
      sourceTotalAds: number | null;
    }>;
    const [run] = runRows;

    if (!run) {
      throw new Error(`Crawl run not found: ${input.crawlRunId}`);
    }

    if (run.status !== "planned" && run.status !== "running") {
      return {
        status: run.status,
        failureReason: run.failureReason,
        listingAvailabilityReconciled: 0,
        changed: false,
      };
    }

    if (input.cause.kind === "stale_recovery") {
      const [activeJob] = await tx<{ active: boolean }[]>`
        select exists (
          select 1
          from graphile_worker.jobs job
          where job.key like 'nettiauto:search-page:' || ${run.id}::text || ':%'
            and job.task_identifier = 'crawl_nettiauto_search_page'
            and (job.attempts < job.max_attempts or job.locked_at is not null)
        ) as active
      `;
      if (activeJob?.active) {
        return {
          status: run.status,
          failureReason: run.failureReason,
          listingAvailabilityReconciled: 0,
          changed: false,
        };
      }
    }

    const evidenceRows = (await tx`
      select
        count(distinct page_number) filter (
          where fetch_kind = 'search_result_page'
            and response_status between 200 and 299
            and response_body_shape = 'ajax_json'
        )::int as "successfulPageCount",
        min(page_number) filter (
          where fetch_kind = 'search_result_page'
            and response_status between 200 and 299
            and response_body_shape = 'ajax_json'
        )::int as "minimumSuccessfulPage",
        max(page_number) filter (
          where fetch_kind = 'search_result_page'
            and response_status between 200 and 299
            and response_body_shape = 'ajax_json'
        )::int as "maximumSuccessfulPage"
      from source_fetches
      where crawl_run_id = ${run.id}
    `) as unknown as Array<{
      successfulPageCount: number;
      minimumSuccessfulPage: number | null;
      maximumSuccessfulPage: number | null;
    }>;
    const sightingRows = (await tx`
      select count(distinct listing_id)::int as count
      from listing_sightings
      where crawl_run_id = ${run.id}
    `) as unknown as Array<{ count: number }>;
    const evidence = evidenceRows[0] ?? {
      successfulPageCount: 0,
      minimumSuccessfulPage: null,
      maximumSuccessfulPage: null,
    };
    const observedListingCount = sightingRows[0]?.count ?? 0;
    const completion = classifyCrawlRunCompletion({
      cause: input.cause,
      expectedPageCount: run.expectedPageCount,
      sourceTotalAds: run.sourceTotalAds,
      observedListingCount,
      ...evidence,
    });

    await tx`
      update crawl_runs
      set
        status = ${completion.status},
        finished_at = now(),
        expected_page_count = ${run.expectedPageCount},
        source_total_ads = ${run.sourceTotalAds},
        is_complete = ${completion.status === "completed"},
        failure_reason = ${completion.failureReason},
        updated_at = now()
      where id = ${run.id}
        and status in ('planned', 'running')
    `;

    let listingAvailabilityReconciled = 0;
    if (completion.status === "completed") {
      await tx`
        update source_search_queries
        set
          last_complete_crawl_run_id = ${run.id},
          last_success_at = now(),
          updated_at = now()
        where id = ${run.searchQueryId}
      `;

      if (run.crawlKind === "current" && run.startedAt) {
        listingAvailabilityReconciled = await reconcileMissingCurrentListings(tx, {
          crawlRunId: run.id,
          searchQueryId: run.searchQueryId,
          startedAt: run.startedAt,
          observedListingCount,
          sourceTotalAds: run.sourceTotalAds ?? 0,
        });
      }
    } else if (completion.status !== "cancelled") {
      await tx`
        update source_search_queries
        set
          last_failure_at = now(),
          updated_at = now()
        where id = ${run.searchQueryId}
      `;
    }

    return {
      status: completion.status,
      failureReason: completion.failureReason,
      listingAvailabilityReconciled,
      changed: true,
    };
  });
}

export function classifyCrawlRunCompletion(input: {
  cause: CrawlRunCompletionCause;
  expectedPageCount: number | null;
  sourceTotalAds: number | null;
  successfulPageCount: number;
  minimumSuccessfulPage: number | null;
  maximumSuccessfulPage: number | null;
  observedListingCount: number;
}): {
  status: "completed" | "partial" | "failed" | "cancelled";
  failureReason: string | null;
} {
  if (input.cause.kind === "operator_stop") {
    return { status: "cancelled", failureReason: input.cause.reason };
  }

  if (input.cause.kind !== "source_exhausted") {
    const failureReason = input.cause.kind === "source_failure"
      ? input.cause.reason
      : input.cause.reason ?? input.cause.kind;
    return {
      status: input.successfulPageCount > 0 ? "partial" : "failed",
      failureReason,
    };
  }

  const failureReason = evaluateCrawlRunCompletionQuality(input);
  if (!failureReason) {
    return { status: "completed", failureReason: null };
  }
  return {
    status: input.successfulPageCount > 0 ? "partial" : "failed",
    failureReason,
  };
}

const MINIMUM_CRAWL_LISTING_COVERAGE = 0.98;

export function evaluateCrawlRunCompletionQuality(input: {
  expectedPageCount: number | null;
  sourceTotalAds: number | null;
  successfulPageCount: number;
  minimumSuccessfulPage: number | null;
  maximumSuccessfulPage: number | null;
  observedListingCount: number;
}) {
  if (input.expectedPageCount === null) {
    return "missing_expected_page_count";
  }

  const expectedFetchedPages = Math.max(1, input.expectedPageCount);
  if (
    input.successfulPageCount !== expectedFetchedPages ||
    input.minimumSuccessfulPage !== 1 ||
    input.maximumSuccessfulPage !== expectedFetchedPages
  ) {
    return "incomplete_search_page_coverage";
  }

  if (input.sourceTotalAds === null) {
    return "missing_source_total";
  }

  if (
    input.sourceTotalAds > 0 &&
    input.observedListingCount < Math.ceil(input.sourceTotalAds * MINIMUM_CRAWL_LISTING_COVERAGE)
  ) {
    return "insufficient_listing_coverage";
  }

  return null;
}

async function reconcileMissingCurrentListings(
  tx: TransactionSqlClient,
  input: {
    crawlRunId: string;
    searchQueryId: string;
    startedAt: Date;
    observedListingCount: number;
    sourceTotalAds: number;
  },
) {
  const removed = await tx<{ listingId: string }[]>`
    with removed_candidates as (
      select listing.id
      from listings listing
      where listing.current_availability = 'stale'
        and listing.availability_last_confirmed_at < ${input.startedAt}
        and exists (
          select 1
          from listing_sightings prior_sighting
          where prior_sighting.listing_id = listing.id
            and prior_sighting.search_query_id = ${input.searchQueryId}
            and prior_sighting.crawl_run_id <> ${input.crawlRunId}
        )
        and not exists (
          select 1
          from listing_sightings current_sighting
          where current_sighting.listing_id = listing.id
            and current_sighting.crawl_run_id = ${input.crawlRunId}
        )
        and exists (
          select 1
          from listing_events stale_event
          join crawl_runs stale_run on stale_run.id = stale_event.source_crawl_run_id
          where stale_event.listing_id = listing.id
            and stale_event.event_type = 'marked_stale'
            and stale_event.source_crawl_run_id <> ${input.crawlRunId}
            and stale_event.event_at > listing.availability_last_confirmed_at
            and stale_run.search_query_id = ${input.searchQueryId}
            and stale_run.status = 'completed'
            and stale_run.is_complete = true
        )
    ),
    removed as (
      update listings listing
      set
        current_availability = 'removed',
        updated_at = now()
      from removed_candidates candidate
      where listing.id = candidate.id
        and listing.current_availability = 'stale'
      returning listing.id
    )
    insert into listing_events (
      listing_id,
      event_type,
      event_at,
      source_crawl_run_id,
      metadata
    )
    select
      removed.id,
      'marked_removed',
      now(),
      ${input.crawlRunId},
      jsonb_build_object(
        'searchQueryId', ${input.searchQueryId}::text,
        'observedListingCount', ${input.observedListingCount}::int,
        'sourceTotalAds', ${input.sourceTotalAds}::int
      )
    from removed
    on conflict do nothing
    returning listing_id as "listingId"
  `;

  const stale = await tx<{ listingId: string }[]>`
    with stale_candidates as (
      select listing.id
      from listings listing
      where listing.current_availability = 'active'
        and listing.availability_last_confirmed_at < ${input.startedAt}
        and exists (
          select 1
          from listing_sightings prior_sighting
          where prior_sighting.listing_id = listing.id
            and prior_sighting.search_query_id = ${input.searchQueryId}
            and prior_sighting.crawl_run_id <> ${input.crawlRunId}
        )
        and not exists (
          select 1
          from listing_sightings current_sighting
          where current_sighting.listing_id = listing.id
            and current_sighting.crawl_run_id = ${input.crawlRunId}
        )
    ),
    marked_stale as (
      update listings listing
      set
        current_availability = 'stale',
        updated_at = now()
      from stale_candidates candidate
      where listing.id = candidate.id
        and listing.current_availability = 'active'
      returning listing.id
    )
    insert into listing_events (
      listing_id,
      event_type,
      event_at,
      source_crawl_run_id,
      metadata
    )
    select
      marked_stale.id,
      'marked_stale',
      now(),
      ${input.crawlRunId},
      jsonb_build_object(
        'searchQueryId', ${input.searchQueryId}::text,
        'observedListingCount', ${input.observedListingCount}::int,
        'sourceTotalAds', ${input.sourceTotalAds}::int
      )
    from marked_stale
    on conflict do nothing
    returning listing_id as "listingId"
  `;

  return removed.length + stale.length;
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
        attempt_number,
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
        ${input.attemptNumber ?? 1},
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
      on conflict (crawl_run_id, fetch_kind, page_number, attempt_number)
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
          select count(distinct page_number)
          from source_fetches
          where crawl_run_id = ${input.crawlRunId}
            and fetch_kind = 'search_result_page'
            and response_status between 200 and 299
            and response_body_shape = 'ajax_json'
        ),
        parsed_listing_count = (
          select count(distinct listing_id)
          from listing_sightings
          where crawl_run_id = ${input.crawlRunId}
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
        attempt_number,
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
        ${input.attemptNumber ?? 1},
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
      current_availability = case
        when listings.availability_last_confirmed_at is null
          or excluded.availability_last_confirmed_at >= listings.availability_last_confirmed_at
          then excluded.current_availability
        else listings.current_availability
      end,
      availability_last_confirmed_at = greatest(
        listings.availability_last_confirmed_at,
        excluded.availability_last_confirmed_at
      ),
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

  const snapshotRows = (await tx`
    with current_snapshot as (
      select snapshot.id, snapshot.change_hash
      from listings current_listing
      join listing_snapshots snapshot on snapshot.id = current_listing.latest_snapshot_id
      where current_listing.id = ${listing.id}
    ),
    inserted_snapshot as (
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
      select
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
      where not exists (select 1 from current_snapshot)
        or (select change_hash from current_snapshot) <> ${input.listing.changeHash}
      returning id
    )
    select id
    from (
      select id, 0 as priority
      from inserted_snapshot
      union all
      select id, 1 as priority
      from current_snapshot
    ) snapshot_candidates
    order by priority
    limit 1
  `) as unknown as Array<{ id: string }>;
  const [snapshot] = snapshotRows;

  if (!snapshot) {
    throw new Error("Failed to resolve latest listing snapshot.");
  }

  await tx`
    update listings listing
    set latest_snapshot_id = candidate.id
    from listing_snapshots candidate
    where listing.id = ${listing.id}
      and candidate.id = ${snapshot.id}
      and not exists (
        select 1
        from listing_snapshots current_snapshot
        where current_snapshot.id = listing.latest_snapshot_id
          and (
            current_snapshot.observed_at > candidate.observed_at
            or (
              current_snapshot.observed_at = candidate.observed_at
              and current_snapshot.created_at > candidate.created_at
            )
          )
      )
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
  const detailPayload = jsonValue(
    Object.fromEntries(
      DETAIL_SNAPSHOT_NORMALIZED_KEYS.map((key) => [key, detailData[key]]),
    ),
  );

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
    where id = (select latest_snapshot_id from listings where id = ${listing.id})
  `;

  return listing.id;
}

type DetailPromotionDecision =
  | {
      disposition: "snapshot_json";
      rationale: string;
    }
  | {
      disposition: "snapshot_json_and_typed_column";
      typedColumn:
        | "source_updated_date"
        | "mileage_km"
        | "year_model"
        | "fuel_type_source_label"
        | "transmission_source_label"
        | "body_type_source_label"
        | "color_source_label";
      rationale: string;
    }
  | {
      disposition: "raw_only";
      rationale: string;
    };

type DetailPromotionPolicy = {
  readonly [Key in keyof NettiautoDetailNormalizedData]: DetailPromotionDecision;
};

// Adding a normalized parser output must include an explicit persistence decision here.
const NETTIAUTO_DETAIL_PROMOTION_POLICY: DetailPromotionPolicy = {
  detailParserVersion: {
    disposition: "snapshot_json",
    rationale: "Identifies the detail parser that produced the snapshot enrichment.",
  },
  sourceUpdatedDate: {
    disposition: "snapshot_json_and_typed_column",
    typedColumn: "source_updated_date",
    rationale: "Supports source chronology while retaining the normalized parser evidence.",
  },
  sourceUpdatedDateLabel: {
    disposition: "snapshot_json",
    rationale: "Retains the Source label used to derive the normalized date.",
  },
  sourceUpdatedDateSource: {
    disposition: "snapshot_json",
    rationale: "Retains provenance for the normalized source date.",
  },
  sourceLocationLabel: {
    disposition: "snapshot_json",
    rationale: "Useful normalized Source evidence without an established typed query need.",
  },
  detailTitleSourceLabel: {
    disposition: "snapshot_json",
    rationale: "Useful normalized Source evidence without an established typed query need.",
  },
  detailSubtitleSourceLabel: {
    disposition: "snapshot_json",
    rationale: "Useful normalized Source evidence without an established typed query need.",
  },
  detailPriceSourceLabel: {
    disposition: "snapshot_json",
    rationale: "Retains price-label evidence without replacing authoritative Listing pricing.",
  },
  uniqueSellingPointSourceLabel: {
    disposition: "snapshot_json",
    rationale: "Useful normalized Source evidence without an established typed query need.",
  },
  registrationNumber: {
    disposition: "snapshot_json",
    rationale: "Established Listing detail attribute; public exposure remains schema-controlled.",
  },
  officeFeeEur: {
    disposition: "snapshot_json",
    rationale: "Normalized commercial attribute without an established typed query need.",
  },
  mileageKm: {
    disposition: "snapshot_json_and_typed_column",
    typedColumn: "mileage_km",
    rationale: "Established typed Listing View and Analysis Query dimension.",
  },
  engineSourceLabel: {
    disposition: "snapshot_json",
    rationale: "Useful normalized Source evidence without an established typed query need.",
  },
  fuelTypeSourceLabel: {
    disposition: "snapshot_json_and_typed_column",
    typedColumn: "fuel_type_source_label",
    rationale: "Established typed Listing View and Analysis Query dimension.",
  },
  yearModel: {
    disposition: "snapshot_json_and_typed_column",
    typedColumn: "year_model",
    rationale: "Established typed Listing View and Analysis Query dimension.",
  },
  firstRegistrationDate: {
    disposition: "snapshot_json",
    rationale: "Normalized vehicle attribute without an established typed query need.",
  },
  transmissionSourceLabel: {
    disposition: "snapshot_json_and_typed_column",
    typedColumn: "transmission_source_label",
    rationale: "Established typed Listing View and Analysis Query dimension.",
  },
  drivetrainSourceLabel: {
    disposition: "snapshot_json",
    rationale: "Normalized vehicle attribute without an established typed query need.",
  },
  inspectionDateLabel: {
    disposition: "snapshot_json",
    rationale: "Retains the Source label until a canonical date model is justified.",
  },
  bodyTypeSourceLabel: {
    disposition: "snapshot_json_and_typed_column",
    typedColumn: "body_type_source_label",
    rationale: "Established typed Listing View and Analysis Query dimension.",
  },
  vehicleTypeSourceLabel: {
    disposition: "snapshot_json",
    rationale: "Normalized vehicle attribute without an established typed query need.",
  },
  colorSourceLabel: {
    disposition: "snapshot_json_and_typed_column",
    typedColumn: "color_source_label",
    rationale: "Established typed Listing View and Analysis Query dimension.",
  },
  powerKw: {
    disposition: "snapshot_json",
    rationale: "Normalized vehicle specification without an established typed query need.",
  },
  powerHp: {
    disposition: "snapshot_json",
    rationale: "Normalized vehicle specification without an established typed query need.",
  },
  topSpeedKmh: {
    disposition: "snapshot_json",
    rationale: "Normalized vehicle specification without an established typed query need.",
  },
  acceleration0To100S: {
    disposition: "snapshot_json",
    rationale: "Normalized vehicle specification without an established typed query need.",
  },
  seatCount: {
    disposition: "snapshot_json",
    rationale: "Normalized vehicle specification without an established typed query need.",
  },
  doorCount: {
    disposition: "snapshot_json",
    rationale: "Normalized vehicle specification without an established typed query need.",
  },
  steeringSideSourceLabel: {
    disposition: "snapshot_json",
    rationale: "Normalized vehicle attribute without an established typed query need.",
  },
  curbWeightKg: {
    disposition: "snapshot_json",
    rationale: "Normalized vehicle specification without an established typed query need.",
  },
  grossWeightKg: {
    disposition: "snapshot_json",
    rationale: "Normalized vehicle specification without an established typed query need.",
  },
  towingWeightBrakedKg: {
    disposition: "snapshot_json",
    rationale: "Normalized vehicle specification without an established typed query need.",
  },
  towingWeightUnbrakedKg: {
    disposition: "snapshot_json",
    rationale: "Normalized vehicle specification without an established typed query need.",
  },
  co2GKm: {
    disposition: "snapshot_json",
    rationale: "Normalized environmental specification without an established typed query need.",
  },
  energyEfficiencyClassSourceLabel: {
    disposition: "snapshot_json",
    rationale: "Normalized environmental attribute without an established typed query need.",
  },
  fuelConsumptionSourceLabel: {
    disposition: "snapshot_json",
    rationale: "Retains the Source label used to derive normalized consumption values.",
  },
  fuelConsumptionCityL100Km: {
    disposition: "snapshot_json",
    rationale: "Normalized consumption value without an established typed query need.",
  },
  fuelConsumptionHighwayL100Km: {
    disposition: "snapshot_json",
    rationale: "Normalized consumption value without an established typed query need.",
  },
  fuelConsumptionCombinedL100Km: {
    disposition: "snapshot_json",
    rationale: "Normalized consumption value without an established typed query need.",
  },
  sellerNotes: {
    disposition: "snapshot_json",
    rationale: "Retains normalized Source text; public exposure remains schema-controlled.",
  },
  equipmentGroups: {
    disposition: "snapshot_json",
    rationale: "Structured enrichment without an established relational query need.",
  },
  jsonLdAvailability: {
    disposition: "snapshot_json",
    rationale: "Retains supporting JSON-LD evidence without overriding Crawl Run availability.",
  },
  jsonLdPriceEur: {
    disposition: "snapshot_json",
    rationale: "Retains supporting JSON-LD evidence without overriding authoritative pricing.",
  },
  jsonLdSellerName: {
    disposition: "snapshot_json",
    rationale: "Retains supporting JSON-LD evidence without an established typed query need.",
  },
};

const DETAIL_SNAPSHOT_NORMALIZED_KEYS = (
  Object.keys(NETTIAUTO_DETAIL_PROMOTION_POLICY) as Array<
    keyof typeof NETTIAUTO_DETAIL_PROMOTION_POLICY
  >
).filter(
  (key) => NETTIAUTO_DETAIL_PROMOTION_POLICY[key].disposition !== "raw_only",
);

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
