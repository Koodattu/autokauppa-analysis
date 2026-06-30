import { z } from "zod";
import type { Task } from "graphile-worker";
import { parseWorkerConfig } from "@nettiauto/config";
import { closeSqlClient, createSqlClient } from "@nettiauto/db";
import {
  buildNettiautoSearchUrl,
  createCrawlRunForSourceQuery,
  markCrawlRunFinished,
  nettiautoAjaxRequestHeaders,
  parseNettiautoAjaxSearchResult,
  persistSearchResultPage,
  sha256,
} from "@nettiauto/domain";
import { createLogger } from "@nettiauto/logging";

const payloadSchema = z.object({
  sourceQueryId: z.string().uuid(),
});

const task: Task = async (payload, helpers) => {
  const config = parseWorkerConfig();
  const logger = createLogger({ service: "worker", env: config.APP_ENV });
  const payloadResult = payloadSchema.safeParse(payload);
  if (!payloadResult.success) {
    throw new Error(`Invalid crawl_nettiauto_search_query payload: ${payloadResult.error.message}`);
  }

  if (!config.CRAWLER_ENABLED || config.CRAWLER_PAUSED) {
    logger.info(
      {
        jobId: helpers.job.id,
        task: "crawl_nettiauto_search_query",
        sourceQueryId: payloadResult.data.sourceQueryId,
        crawlerEnabled: config.CRAWLER_ENABLED,
        crawlerPaused: config.CRAWLER_PAUSED,
      },
      "Nettiauto crawl skipped",
    );
    return;
  }

  const sql = createSqlClient(config.DATABASE_URL, 1);
  let crawlRunId: string | null = null;
  try {
    const [sourceQuery] = await sql<
      {
        id: string;
        crawlKind: "current" | "sold";
        vehicleCategory: "passenger_car";
        entryPath: string;
        sourceSearchHash: string;
      }[]
    >`
      select
        id,
        crawl_kind as "crawlKind",
        vehicle_category as "vehicleCategory",
        entry_path as "entryPath",
        source_search_hash as "sourceSearchHash"
      from source_search_queries
      where id = ${payloadResult.data.sourceQueryId}
        and source = 'nettiauto'
        and enabled = true
      limit 1
    `;

    if (!sourceQuery) {
      throw new Error(`Enabled Nettiauto source query not found: ${payloadResult.data.sourceQueryId}`);
    }

    crawlRunId = await createCrawlRunForSourceQuery(sql, sourceQuery.id);
    let expectedPageCount: number | null = null;
    let sourceTotalAds: number | null = null;
    let status: "completed" | "partial" | "failed" = "completed";
    let failureReason: string | null = null;
    const maxPages = Math.max(1, config.CRAWLER_MAX_PAGES_PER_RUN);

    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      const pageUrl = buildNettiautoSearchUrl(
        sourceQuery.entryPath,
        sourceQuery.sourceSearchHash,
        pageNumber,
      );
      const startedAt = Date.now();
      const response = await fetch(pageUrl, {
        headers: nettiautoAjaxRequestHeaders(sourceQuery.entryPath, sourceQuery.sourceSearchHash),
        signal: helpers.abortSignal,
      });
      const responseBody = await response.text();
      const durationMs = Date.now() - startedAt;

      if ([403, 429].includes(response.status) || response.redirected) {
        status = "partial";
        failureReason = response.status === 429 ? "rate_limited" : "blocked_or_redirected";
        break;
      }

      const parsedPage = parseNettiautoAjaxSearchResult(responseBody, {
        crawlKind: sourceQuery.crawlKind,
        pageNumber,
      });
      expectedPageCount = parsedPage.totalPages;
      sourceTotalAds = parsedPage.totalAds;
      await persistSearchResultPage(sql, {
        crawlRunId,
        searchQueryId: sourceQuery.id,
        crawlKind: sourceQuery.crawlKind,
        vehicleCategory: sourceQuery.vehicleCategory,
        sourceUrl: pageUrl,
        pageNumber,
        responseStatus: response.status,
        responseContentType: response.headers.get("content-type"),
        responseBodySha256: sha256(responseBody),
        responseBytes: new TextEncoder().encode(responseBody).byteLength,
        durationMs,
        parsedPage,
      });

      logger.info(
        {
          jobId: helpers.job.id,
          task: "crawl_nettiauto_search_query",
          crawlRunId,
          sourceQueryId: sourceQuery.id,
          page: pageNumber,
          parserVersion: parsedPage.parserVersion,
          durationMs,
          status: "parsed",
          parsedListingCount: parsedPage.listings.length,
          issueCount: parsedPage.issues.length,
        },
        "Nettiauto search result page persisted",
      );

      if (parsedPage.issues.some((issue) => issue.code === "invalid_ajax_json")) {
        status = "partial";
        failureReason = "invalid_ajax_json";
        break;
      }

      if (expectedPageCount !== null && pageNumber >= Math.min(expectedPageCount, maxPages)) {
        break;
      }

      await sleep(config.CRAWLER_DELAY_MS, helpers.abortSignal);
    }

    if (expectedPageCount !== null && expectedPageCount > maxPages && status === "completed") {
      status = "partial";
      failureReason = "max_pages_per_run_reached";
    }

    await markCrawlRunFinished(sql, {
      crawlRunId,
      status,
      expectedPageCount,
      sourceTotalAds,
      failureReason,
    });
  } catch (error) {
    if (crawlRunId) {
      await markCrawlRunFinished(sql, {
        crawlRunId,
        status: "failed",
        expectedPageCount: null,
        sourceTotalAds: null,
        failureReason: error instanceof Error ? error.message : "unknown_error",
      });
    }
    throw error;
  } finally {
    await closeSqlClient(sql);
  }
};

function sleep(ms: number, signal: AbortSignal) {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(new Error("Worker task aborted."));
      },
      { once: true },
    );
  });
}

export default task;
