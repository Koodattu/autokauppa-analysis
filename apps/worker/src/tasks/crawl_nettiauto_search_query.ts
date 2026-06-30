import { z } from "zod";
import type { Task } from "graphile-worker";
import { parseWorkerConfig } from "@nettiauto/config";
import { closeSqlClient, createSqlClient } from "@nettiauto/db";
import {
  buildNettiautoSearchUrl,
  classifyNettiautoResponseBody,
  createCrawlRunForSourceQuery,
  emptyNettiautoSearchResultPage,
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
        queryParams: Record<string, unknown>;
      }[]
    >`
      select
        id,
        crawl_kind as "crawlKind",
        vehicle_category as "vehicleCategory",
        entry_path as "entryPath",
        source_search_hash as "sourceSearchHash",
        query_params as "queryParams"
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
        sourceQuery.queryParams,
      );
      const requestHeaders = nettiautoAjaxRequestHeaders(
        sourceQuery.entryPath,
        sourceQuery.sourceSearchHash,
        sourceQuery.queryParams,
      );
      const startedAt = Date.now();
      const response = await fetch(pageUrl, {
        headers: requestHeaders,
        redirect: "manual",
        signal: helpers.abortSignal,
      });
      const responseBody = await response.text();
      const durationMs = Date.now() - startedAt;
      const responseContentType = response.headers.get("content-type");
      const responseBodyShape = classifyNettiautoResponseBody(responseBody, responseContentType);
      const responseBytes = new TextEncoder().encode(responseBody).byteLength;
      const responseBodySha256 = sha256(responseBody);

      if (!response.ok || response.redirected) {
        status = "partial";
        failureReason = classifyFetchFailure(response.status, response.redirected, responseBodyShape);
        await persistSearchResultPage(sql, {
          crawlRunId,
          searchQueryId: sourceQuery.id,
          crawlKind: sourceQuery.crawlKind,
          vehicleCategory: sourceQuery.vehicleCategory,
          sourceUrl: pageUrl,
          pageNumber,
          responseStatus: response.status,
          responseContentType,
          responseBodyShape,
          responseBodySha256,
          responseBytes,
          durationMs,
          requestHeaders,
          errorType: failureReason,
          errorMessage: response.redirected
            ? "Nettiauto request redirected before AJAX JSON was returned."
            : `Nettiauto returned HTTP ${response.status} instead of AJAX JSON.`,
          parsedPage: emptyNettiautoSearchResultPage({
            crawlKind: sourceQuery.crawlKind,
            pageNumber,
          }),
        });
        logger.warn(
          {
            jobId: helpers.job.id,
            task: "crawl_nettiauto_search_query",
            crawlRunId,
            sourceQueryId: sourceQuery.id,
            page: pageNumber,
            statusCode: response.status,
            responseBodyShape,
            responseContentType,
            responseBytes,
            responseBodySha256,
            durationMs,
            failureReason,
          },
          "Nettiauto search result fetch stopped crawl",
        );
        break;
      }

      if (responseBodyShape !== "ajax_json") {
        status = "partial";
        failureReason =
          responseBodyShape === "html_document"
            ? "unexpected_html_response"
            : "unexpected_response_body_shape";
        await persistSearchResultPage(sql, {
          crawlRunId,
          searchQueryId: sourceQuery.id,
          crawlKind: sourceQuery.crawlKind,
          vehicleCategory: sourceQuery.vehicleCategory,
          sourceUrl: pageUrl,
          pageNumber,
          responseStatus: response.status,
          responseContentType,
          responseBodyShape,
          responseBodySha256,
          responseBytes,
          durationMs,
          requestHeaders,
          errorType: failureReason,
          errorMessage: `Nettiauto returned ${responseBodyShape} instead of AJAX JSON.`,
          parsedPage: emptyNettiautoSearchResultPage({
            crawlKind: sourceQuery.crawlKind,
            pageNumber,
          }),
        });
        logger.warn(
          {
            jobId: helpers.job.id,
            task: "crawl_nettiauto_search_query",
            crawlRunId,
            sourceQueryId: sourceQuery.id,
            page: pageNumber,
            statusCode: response.status,
            responseBodyShape,
            responseContentType,
            responseBytes,
            responseBodySha256,
            durationMs,
            failureReason,
          },
          "Nettiauto search result response shape stopped crawl",
        );
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
        responseContentType,
        responseBodyShape,
        responseBodySha256,
        responseBytes,
        durationMs,
        requestHeaders,
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

function classifyFetchFailure(statusCode: number, redirected: boolean, bodyShape: string) {
  if (redirected || [301, 302, 303, 307, 308].includes(statusCode)) {
    return "redirected";
  }

  if (statusCode === 429) {
    return "rate_limited";
  }

  if (statusCode === 403) {
    return "blocked";
  }

  if (statusCode >= 400) {
    return `http_${statusCode}`;
  }

  if (bodyShape !== "ajax_json") {
    return "unexpected_response_body_shape";
  }

  return "fetch_failed";
}

export default task;
