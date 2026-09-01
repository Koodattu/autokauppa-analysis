import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { WorkerConfig } from "@nettiauto/config";
import { closeSqlClient, createSqlClient } from "@nettiauto/db";
import type { AppLogger } from "@nettiauto/logging";
import type { CrawlWorkQueue, DetailPageJob, SearchPageJob } from "./crawl-work-queue";
import {
  createNettiautoCrawlExecution,
  type CrawlJobContext,
} from "./nettiauto-crawl-execution";
import {
  NettiautoSourceError,
  type NettiautoSource,
  type NettiautoSourceResponse,
} from "./nettiauto-source";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = testDatabaseUrl ? describe : describe.skip;

describeDatabase("NettiautoCrawlExecution PostgreSQL scenarios", () => {
  if (!testDatabaseUrl) {
    return;
  }

  const databaseName = new URL(testDatabaseUrl).pathname.slice(1);
  if (!databaseName.includes("test")) {
    throw new Error("Integration tests require a database name containing 'test'.");
  }

  const sql = createSqlClient(testDatabaseUrl, 1);
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as AppLogger;
  const createdContexts: Array<{ sourceQueryId: string; crawlRunId: string }> = [];
  const createdDetailBackfillRunIds: string[] = [];

  beforeAll(async () => {
    const [migrationTable] = await sql<{ relationName: string | null }[]>`
      select to_regclass('drizzle.__drizzle_migrations')::text as "relationName"
    `;
    if (!migrationTable?.relationName) {
      throw new Error("Test database migrations have not been applied.");
    }
  });

  afterEach(async () => {
    for (const runId of createdDetailBackfillRunIds.splice(0)) {
      await sql`delete from source_fetches where detail_backfill_run_id = ${runId}`;
      await sql`delete from detail_backfill_runs where id = ${runId}`;
    }
    for (const context of createdContexts.splice(0)) {
      await sql`
        update source_search_queries
        set last_complete_crawl_run_id = null
        where id = ${context.sourceQueryId}
      `;
      await sql`delete from source_fetches where crawl_run_id = ${context.crawlRunId}`;
      await sql`delete from crawl_runs where id = ${context.crawlRunId}`;
      await sql`delete from source_search_queries where id = ${context.sourceQueryId}`;
    }
  });

  afterAll(async () => {
    await closeSqlClient(sql);
  });

  it("persists Search Result Page evidence before completing a source-exhausted Crawl Run", async () => {
    const context = await createRunningCrawl();
    const queue = createRecordingQueue();
    const source = createSource(async () => successfulEmptyPage());
    const execution = createNettiautoCrawlExecution({
      sql,
      config: workerConfig(),
      logger,
      source,
      workQueue: queue,
    });

    const outcome = await execution.collectSearchResultPage(
      { ...context, pageNumber: 1 },
      jobContext(),
    );

    const [run] = await sql<
      {
        status: string;
        isComplete: boolean;
        expectedPageCount: number | null;
        fetchedPageCount: number;
      }[]
    >`
      select status, is_complete as "isComplete",
             expected_page_count as "expectedPageCount",
             fetched_page_count as "fetchedPageCount"
      from crawl_runs
      where id = ${context.crawlRunId}
    `;
    const [evidence] = await sql<{ count: number }[]>`
      select count(*)::int as count
      from source_fetches
      where crawl_run_id = ${context.crawlRunId}
    `;

    expect(outcome).toEqual({ kind: "completed" });
    expect(run).toEqual({
      status: "completed",
      isComplete: true,
      expectedPageCount: 1,
      fetchedPageCount: 1,
    });
    expect(evidence?.count).toBe(1);
    expect(queue.searchResultPages).toEqual([]);
  });

  it("records retry evidence and fails the Crawl Run on the final Graphile attempt", async () => {
    const context = await createRunningCrawl();
    const source = createSource(async () => {
      throw new NettiautoSourceError("timeout", 25);
    });
    const execution = createNettiautoCrawlExecution({
      sql,
      config: workerConfig(),
      logger,
      source,
      workQueue: createRecordingQueue(),
    });

    await expect(
      execution.collectSearchResultPage(
        { ...context, pageNumber: 1 },
        jobContext({ attemptNumber: 3, maxAttempts: 3 }),
      ),
    ).rejects.toMatchObject({ name: "RetryableNettiautoFetchError", failureReason: "timeout" });

    const [run] = await sql<{ status: string; failureReason: string | null }[]>`
      select status, failure_reason as "failureReason"
      from crawl_runs
      where id = ${context.crawlRunId}
    `;
    const [fetchEvidence] = await sql<{ errorType: string | null }[]>`
      select error_type as "errorType"
      from source_fetches
      where crawl_run_id = ${context.crawlRunId}
    `;
    expect(run).toEqual({ status: "failed", failureReason: "timeout" });
    expect(fetchEvidence).toEqual({ errorType: "timeout" });
  });

  it("pauses the Source Search Query and stops on a blocked response", async () => {
    const context = await createRunningCrawl();
    const requestTime = new Date(Date.now() + 24 * 60 * 60 * 1_000);
    const source = createSource(async () => ({
      ...successfulEmptyPage(),
      ok: false,
      status: 403,
      contentType: "text/html",
      body: "<html><body>blocked</body></html>",
      bodyShape: "html_document",
      diagnostics: {
        classification: "cloudflare_challenge",
        title: "Just a moment...",
        server: "cloudflare",
        cfRay: "search-ray-TLL",
      },
    }));
    const execution = createNettiautoCrawlExecution({
      sql,
      config: workerConfig(),
      logger,
      source,
      workQueue: createRecordingQueue(),
      now: () => requestTime.getTime(),
    });

    const outcome = await execution.collectSearchResultPage(
      { ...context, pageNumber: 1 },
      jobContext(),
    );

    const [query] = await sql<{ pauseReason: string | null; pausedUntil: string | null }[]>`
      select pause_reason as "pauseReason", paused_until::text as "pausedUntil"
      from source_search_queries
      where id = ${context.sourceQueryId}
    `;
    expect(outcome).toEqual({ kind: "stopped" });
    expect(query?.pauseReason).toBe("blocked");
    expect(Date.parse(query?.pausedUntil ?? "")).toBe(
      requestTime.getTime() + 6 * 60 * 60 * 1_000,
    );
  });

  it("opens the backfill circuit without changing normal crawl cadence state", async () => {
    const context = await createRunningCrawl();
    const requestTime = new Date(Date.now() + 24 * 60 * 60 * 1_000);
    const [backfillRun] = await sql<{ id: string }[]>`
      insert into detail_backfill_runs (
        source, target_parser_version, selection, status
      ) values (
        'nettiauto', 'nettiauto-detail-v4', 'missing_or_v1', 'running'
      )
      returning id
    `;
    if (!backfillRun) {
      throw new Error("Failed to create integration detail backfill run.");
    }
    createdDetailBackfillRunIds.push(backfillRun.id);

    const execution = createNettiautoCrawlExecution({
      sql,
      config: workerConfig(),
      logger,
      source: createSource(
        async () => successfulEmptyPage(),
        async () => blockedDetailPage(),
      ),
      workQueue: createRecordingQueue(),
      now: () => requestTime.getTime(),
    });

    const outcome = await execution.enrichDetailPage(
      {
        crawlRunId: null,
        detailBackfillRunId: backfillRun.id,
        searchQueryId: context.sourceQueryId,
        sourceListingId: "integration-blocked-detail",
        sourceUrl: "https://www.nettiauto.com/test/1",
        force: true,
      },
      jobContext(),
    );

    const [query] = await sql<{
      pauseReason: string | null;
      pausedUntil: string | null;
      lastFailureAt: string | null;
    }[]>`
      select pause_reason as "pauseReason", paused_until::text as "pausedUntil",
             last_failure_at::text as "lastFailureAt"
      from source_search_queries
      where id = ${context.sourceQueryId}
    `;
    const [fetchEvidence] = await sql<{
      errorType: string | null;
      errorMessage: string | null;
      responseDiagnostics: Record<string, string> | null;
    }[]>`
      select error_type as "errorType", error_message as "errorMessage",
             response_diagnostics as "responseDiagnostics"
      from source_fetches
      where detail_backfill_run_id = ${backfillRun.id}
    `;

    expect(outcome).toEqual({
      kind: "stopped",
      failureReason: "blocked",
      blockedUntil: new Date(requestTime.getTime() + 6 * 60 * 60 * 1_000).toISOString(),
    });
    expect(query).toEqual({ pauseReason: null, pausedUntil: null, lastFailureAt: null });
    expect(fetchEvidence).toEqual({
      errorType: "blocked",
      errorMessage:
        "Nettiauto detail page returned a Cloudflare challenge (HTTP 403, ray integration-ray-TLL).",
      responseDiagnostics: {
        classification: "cloudflare_challenge",
        title: "Just a moment...",
        server: "cloudflare",
        cfRay: "integration-ray-TLL",
      },
    });
  });

  it("classifies a detail-page redirect to the Nettiauto homepage as unavailable", async () => {
    const context = await createRunningCrawl();
    const [backfillRun] = await sql<{ id: string }[]>`
      insert into detail_backfill_runs (
        source, target_parser_version, selection, status
      ) values (
        'nettiauto', 'nettiauto-detail-v4', 'missing_or_v1', 'running'
      )
      returning id
    `;
    if (!backfillRun) {
      throw new Error("Failed to create integration detail backfill run.");
    }
    createdDetailBackfillRunIds.push(backfillRun.id);

    const execution = createNettiautoCrawlExecution({
      sql,
      config: workerConfig(),
      logger,
      source: createSource(
        async () => successfulEmptyPage(),
        async () => unavailableRedirectDetailPage(),
      ),
      workQueue: createRecordingQueue(),
    });

    const outcome = await execution.enrichDetailPage(
      {
        crawlRunId: null,
        detailBackfillRunId: backfillRun.id,
        searchQueryId: context.sourceQueryId,
        sourceListingId: "integration-unavailable-detail",
        sourceUrl: "https://www.nettiauto.com/test/removed",
        force: true,
      },
      jobContext(),
    );

    const [fetchEvidence] = await sql<{
      errorType: string | null;
      errorMessage: string | null;
      responseDiagnostics: Record<string, string> | null;
    }[]>`
      select error_type as "errorType", error_message as "errorMessage",
             response_diagnostics as "responseDiagnostics"
      from source_fetches
      where detail_backfill_run_id = ${backfillRun.id}
    `;

    expect(outcome).toEqual({
      kind: "persisted",
      outcome: "unavailable",
      failureReason: "detail_unavailable_redirect",
      responseStatus: 200,
    });
    expect(fetchEvidence).toEqual({
      errorType: "detail_unavailable_redirect",
      errorMessage:
        "Nettiauto detail page returned HTTP 200 with redirect location https://www.nettiauto.com/.",
      responseDiagnostics: {
        location: "https://www.nettiauto.com/",
        title: "Vaihtoautot ja uudet autot - Nettiauto",
        transport: "impit",
      },
    });
  });

  it("cancels queued search work on an operator stop without contacting the Source", async () => {
    const context = await createRunningCrawl();
    const fetchSearchResultPage = vi.fn(async () => successfulEmptyPage());
    const execution = createNettiautoCrawlExecution({
      sql,
      config: workerConfig({ CRAWLER_PAUSED: true }),
      logger,
      source: createSource(fetchSearchResultPage),
      workQueue: createRecordingQueue(),
    });

    const outcome = await execution.collectSearchResultPage(
      { ...context, pageNumber: 1 },
      jobContext(),
    );

    const [run] = await sql<{ status: string; failureReason: string | null }[]>`
      select status, failure_reason as "failureReason"
      from crawl_runs
      where id = ${context.crawlRunId}
    `;
    expect(outcome).toEqual({ kind: "stopped" });
    expect(run).toEqual({ status: "cancelled", failureReason: "crawler_paused" });
    expect(fetchSearchResultPage).not.toHaveBeenCalled();
  });

  async function createRunningCrawl() {
    const sourceSearchHash = `execution-${randomUUID()}`;
    const [sourceQuery] = await sql<{ id: string }[]>`
      insert into source_search_queries (
        source, vehicle_category, crawl_kind, entry_path, source_search_hash,
        query_params, enabled, priority, target_cadence_interval, notes
      ) values (
        'nettiauto', 'passenger_car', 'current', '/vaihtoautot', ${sourceSearchHash},
        ${sql.json({ haku: sourceSearchHash })}, true, 10, interval '7 days',
        'NettiautoCrawlExecution integration test'
      )
      returning id
    `;
    if (!sourceQuery) {
      throw new Error("Failed to create integration Source Search Query.");
    }
    const [crawlRun] = await sql<{ id: string }[]>`
      insert into crawl_runs (
        source, search_query_id, crawl_kind, vehicle_category, status, started_at
      ) values ('nettiauto', ${sourceQuery.id}, 'current', 'passenger_car', 'running', now())
      returning id
    `;
    if (!crawlRun) {
      throw new Error("Failed to create integration Crawl Run.");
    }
    const context = { sourceQueryId: sourceQuery.id, crawlRunId: crawlRun.id };
    createdContexts.push(context);
    return context;
  }
});

function workerConfig(overrides: Partial<WorkerConfig> = {}): WorkerConfig {
  return {
    APP_ENV: "test",
    DATABASE_URL: testDatabaseUrl ?? "postgres://unused/test",
    SENTRY_DSN: "",
    CRAWLER_ENABLED: true,
    CRAWLER_PAUSED: false,
    CRAWLER_DELAY_MS: 0,
    CRAWLER_DELAY_JITTER_MS: 0,
    CRAWLER_REQUEST_TIMEOUT_MS: 1_000,
    CRAWLER_MAX_PAGES_PER_RUN: 0,
    CRAWLER_BLOCK_PAUSE_MS: 6 * 60 * 60 * 1_000,
    CRAWLER_DETAIL_ENABLED: false,
    CRAWLER_DETAIL_MAX_PER_RUN: 0,
    ...overrides,
  };
}

function jobContext(overrides: Partial<CrawlJobContext> = {}): CrawlJobContext {
  return {
    jobId: "integration-job",
    attemptNumber: 1,
    maxAttempts: 3,
    abortSignal: new AbortController().signal,
    ...overrides,
  };
}

function createSource(
  fetchSearchResultPage: NettiautoSource["fetchSearchResultPage"],
  fetchDetailPage?: NettiautoSource["fetchDetailPage"],
): NettiautoSource {
  return {
    fetchSearchResultPage,
    fetchDetailPage: fetchDetailPage ?? (async () => {
      throw new Error("Detail Page Data was not expected in this scenario.");
    }),
  };
}

function blockedDetailPage(): NettiautoSourceResponse {
  const body = "<html><body>blocked</body></html>";
  return {
    ok: false,
    redirected: false,
    status: 403,
    contentType: "text/html",
    body,
    bodyShape: "html_document",
    bodySha256: "b".repeat(64),
    bodyBytes: new TextEncoder().encode(body).byteLength,
    durationMs: 10,
    diagnostics: {
      classification: "cloudflare_challenge",
      title: "Just a moment...",
      server: "cloudflare",
      cfRay: "integration-ray-TLL",
    },
  };
}

function unavailableRedirectDetailPage(): NettiautoSourceResponse {
  const body = "<html><head><title>Vaihtoautot ja uudet autot - Nettiauto</title></head></html>";
  return {
    ok: true,
    redirected: true,
    status: 200,
    contentType: "text/html",
    body,
    bodyShape: "html_document",
    bodySha256: "c".repeat(64),
    bodyBytes: new TextEncoder().encode(body).byteLength,
    durationMs: 10,
    diagnostics: {
      location: "https://www.nettiauto.com/",
      title: "Vaihtoautot ja uudet autot - Nettiauto",
      transport: "impit",
    },
  };
}

function successfulEmptyPage(): NettiautoSourceResponse {
  const body = JSON.stringify({
    total_ads: 0,
    current_page: 1,
    total_page: 1,
    ad_listing_data: "",
  });
  return {
    ok: true,
    redirected: false,
    status: 200,
    contentType: "application/json",
    body,
    bodyShape: "ajax_json",
    bodySha256: "a".repeat(64),
    bodyBytes: new TextEncoder().encode(body).byteLength,
    durationMs: 10,
    diagnostics: {},
  };
}

function createRecordingQueue(): CrawlWorkQueue & {
  searchResultPages: SearchPageJob[];
  detailPages: DetailPageJob[];
} {
  const searchResultPages: SearchPageJob[] = [];
  const detailPages: DetailPageJob[] = [];
  return {
    searchResultPages,
    detailPages,
    async enqueueSearchResultPage(job) {
      searchResultPages.push(job);
    },
    async enqueueDetailPage(job) {
      detailPages.push(job);
    },
  };
}
