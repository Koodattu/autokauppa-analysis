import { z } from "zod";
import type { Task } from "graphile-worker";
import { parseWorkerConfig } from "@nettiauto/config";
import { closeSqlClient, createSqlClient } from "@nettiauto/db";
import {
  buildNettiautoSearchUrl,
  classifyNettiautoResponseBody,
  emptyNettiautoSearchResultPage,
  markCrawlRunFinished,
  nettiautoAjaxRequestHeaders,
  pauseSourceSearchQuery,
  parseNettiautoAjaxSearchResult,
  persistSearchResultPage,
  reserveCrawlRunDetailJobs,
  sha256,
} from "@nettiauto/domain";
import { createLogger } from "@nettiauto/logging";
import {
  NETTIAUTO_DETAIL_MAX_ATTEMPTS,
  NETTIAUTO_DETAIL_PRIORITY_OFFSET,
  NETTIAUTO_SEARCH_MAX_ATTEMPTS,
  RetryableNettiautoFetchError,
  classifyRequestError,
  createNettiautoRequestSignal,
  isRetryableNettiautoHttpStatus,
  shouldPauseNettiautoSource,
  terminalSearchRunStatus,
} from "../nettiauto-fetch-policy";

const payloadSchema = z.object({
  crawlRunId: z.string().uuid(),
  sourceQueryId: z.string().uuid(),
  pageNumber: z.number().int().positive(),
});

const task: Task = async (payload, helpers) => {
  const config = parseWorkerConfig();
  const logger = createLogger({ service: "worker", env: config.APP_ENV });
  const payloadResult = payloadSchema.safeParse(payload);
  if (!payloadResult.success) {
    throw new Error(`Invalid crawl_nettiauto_search_page payload: ${payloadResult.error.message}`);
  }

  const taskPayload = payloadResult.data;
  const sql = createSqlClient(config.DATABASE_URL, 1);
  try {
    if (!config.CRAWLER_ENABLED || config.CRAWLER_PAUSED) {
      await markCrawlRunFinished(sql, {
        crawlRunId: taskPayload.crawlRunId,
        status: "partial",
        expectedPageCount: null,
        sourceTotalAds: null,
        failureReason: config.CRAWLER_ENABLED ? "crawler_paused" : "crawler_disabled",
      });
      logger.info(
        {
          jobId: helpers.job.id,
          task: "crawl_nettiauto_search_page",
          crawlRunId: taskPayload.crawlRunId,
          sourceQueryId: taskPayload.sourceQueryId,
          page: taskPayload.pageNumber,
          crawlerEnabled: config.CRAWLER_ENABLED,
          crawlerPaused: config.CRAWLER_PAUSED,
        },
        "Nettiauto search page crawl stopped",
      );
      return;
    }

    const [sourceQuery] = await sql<
      {
        id: string;
        crawlKind: "current" | "sold";
        vehicleCategory: "passenger_car";
        entryPath: string;
        priority: number;
        enabled: boolean;
        crawlRunStatus: "planned" | "running" | "completed" | "partial" | "failed" | "cancelled";
        sourceSearchHash: string;
        queryParams: Record<string, unknown>;
        pausedUntil: string | null;
        pauseReason: string | null;
      }[]
    >`
      select
        source_query.id,
        source_query.crawl_kind as "crawlKind",
        source_query.vehicle_category as "vehicleCategory",
        source_query.entry_path as "entryPath",
        source_query.priority,
        source_query.enabled,
        run.status as "crawlRunStatus",
        source_query.source_search_hash as "sourceSearchHash",
        source_query.query_params as "queryParams",
        source_query.paused_until::text as "pausedUntil",
        source_query.pause_reason as "pauseReason"
      from crawl_runs run
      join source_search_queries source_query on source_query.id = run.search_query_id
      where run.id = ${taskPayload.crawlRunId}
        and run.search_query_id = ${taskPayload.sourceQueryId}
        and source_query.source = 'nettiauto'
      limit 1
    `;

    if (!sourceQuery) {
      throw new Error(`Nettiauto crawl context not found: ${taskPayload.crawlRunId}`);
    }

    if (sourceQuery.crawlRunStatus !== "running") {
      logger.info(
        {
          jobId: helpers.job.id,
          task: "crawl_nettiauto_search_page",
          crawlRunId: taskPayload.crawlRunId,
          crawlRunStatus: sourceQuery.crawlRunStatus,
          page: taskPayload.pageNumber,
        },
        "Nettiauto search page skipped for terminal crawl run",
      );
      return;
    }

    if (!sourceQuery.enabled) {
      await markCrawlRunFinished(sql, {
        crawlRunId: taskPayload.crawlRunId,
        status: "failed",
        expectedPageCount: null,
        sourceTotalAds: null,
        failureReason: `Nettiauto source query disabled: ${taskPayload.sourceQueryId}`,
      });
      return;
    }

    if (sourceQuery.pausedUntil && new Date(sourceQuery.pausedUntil).getTime() > Date.now()) {
      await markCrawlRunFinished(sql, {
        crawlRunId: taskPayload.crawlRunId,
        status: "partial",
        expectedPageCount: null,
        sourceTotalAds: null,
        failureReason: sourceQuery.pauseReason ?? "source_query_paused",
      });
      return;
    }

    const crawlAllPages = config.CRAWLER_MAX_PAGES_PER_RUN === 0;
    const maxPages = crawlAllPages
      ? Number.POSITIVE_INFINITY
      : Math.max(1, config.CRAWLER_MAX_PAGES_PER_RUN);
    const pageUrl = buildNettiautoSearchUrl(
      sourceQuery.entryPath,
      sourceQuery.sourceSearchHash,
      taskPayload.pageNumber,
      sourceQuery.queryParams,
    );
    const requestHeaders = nettiautoAjaxRequestHeaders(
      sourceQuery.entryPath,
      sourceQuery.sourceSearchHash,
      sourceQuery.queryParams,
    );
    const startedAt = Date.now();
    const { signal, timeoutSignal } = createNettiautoRequestSignal(
      helpers.abortSignal,
      config.CRAWLER_REQUEST_TIMEOUT_MS,
    );
    let response: Response;
    let responseBody: string;
    try {
      response = await fetch(pageUrl, {
        headers: requestHeaders,
        redirect: "manual",
        signal,
      });
      responseBody = await response.text();
    } catch {
      const durationMs = Date.now() - startedAt;
      const failureReason = classifyRequestError({
        timeoutAborted: timeoutSignal?.aborted ?? false,
        workerAborted: helpers.abortSignal.aborted,
      });
      await persistSearchResultPage(sql, {
        crawlRunId: taskPayload.crawlRunId,
        searchQueryId: sourceQuery.id,
        crawlKind: sourceQuery.crawlKind,
        vehicleCategory: sourceQuery.vehicleCategory,
        sourceUrl: pageUrl,
        pageNumber: taskPayload.pageNumber,
        attemptNumber: helpers.job.attempts,
        responseStatus: null,
        responseContentType: null,
        responseBodyShape: "unknown",
        responseBodySha256: null,
        responseBytes: null,
        durationMs,
        requestHeaders,
        errorType: failureReason,
        errorMessage: `Nettiauto search request ended before a response (${failureReason}).`,
        parsedPage: emptyNettiautoSearchResultPage({
          crawlKind: sourceQuery.crawlKind,
          pageNumber: taskPayload.pageNumber,
        }),
      });
      throw new RetryableNettiautoFetchError(
        failureReason,
        `Nettiauto search request failed (${failureReason}).`,
      );
    }
    const durationMs = Date.now() - startedAt;
    const responseContentType = response.headers.get("content-type");
    const responseBodyShape = classifyNettiautoResponseBody(responseBody, responseContentType);
    const responseBytes = new TextEncoder().encode(responseBody).byteLength;
    const responseBodySha256 = sha256(responseBody);

    if (!response.ok || response.redirected) {
      const failureReason = classifyFetchFailure(response.status, response.redirected, responseBodyShape);
      await persistSearchResultPage(sql, {
        crawlRunId: taskPayload.crawlRunId,
        searchQueryId: sourceQuery.id,
        crawlKind: sourceQuery.crawlKind,
        vehicleCategory: sourceQuery.vehicleCategory,
        sourceUrl: pageUrl,
        pageNumber: taskPayload.pageNumber,
        attemptNumber: helpers.job.attempts,
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
          pageNumber: taskPayload.pageNumber,
        }),
      });
      logger.warn(
        {
          jobId: helpers.job.id,
          task: "crawl_nettiauto_search_page",
          crawlRunId: taskPayload.crawlRunId,
          sourceQueryId: sourceQuery.id,
          page: taskPayload.pageNumber,
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
      if (shouldPauseNettiautoSource(failureReason)) {
        const pausedUntil = await pauseSourceSearchQuery(sql, sourceQuery.id, {
          pauseMs: config.CRAWLER_BLOCK_PAUSE_MS,
          reason: failureReason,
        });
        await markCrawlRunFinished(sql, {
          crawlRunId: taskPayload.crawlRunId,
          status: terminalSearchRunStatus(taskPayload.pageNumber),
          expectedPageCount: null,
          sourceTotalAds: null,
          failureReason,
        });
        logger.warn({ sourceQueryId: sourceQuery.id, pausedUntil, failureReason }, "Nettiauto source query paused");
        return;
      }
      if (isRetryableNettiautoHttpStatus(response.status)) {
        throw new RetryableNettiautoFetchError(
          failureReason,
          `Nettiauto search request returned transient HTTP ${response.status}.`,
        );
      }
      await markCrawlRunFinished(sql, {
        crawlRunId: taskPayload.crawlRunId,
        status: terminalSearchRunStatus(taskPayload.pageNumber),
        expectedPageCount: null,
        sourceTotalAds: null,
        failureReason,
      });
      return;
    }

    if (responseBodyShape !== "ajax_json") {
      const failureReason =
        responseBodyShape === "html_document"
          ? "unexpected_html_response"
          : "unexpected_response_body_shape";
      await persistSearchResultPage(sql, {
        crawlRunId: taskPayload.crawlRunId,
        searchQueryId: sourceQuery.id,
        crawlKind: sourceQuery.crawlKind,
        vehicleCategory: sourceQuery.vehicleCategory,
        sourceUrl: pageUrl,
        pageNumber: taskPayload.pageNumber,
        attemptNumber: helpers.job.attempts,
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
          pageNumber: taskPayload.pageNumber,
        }),
      });
      await markCrawlRunFinished(sql, {
        crawlRunId: taskPayload.crawlRunId,
        status: terminalSearchRunStatus(taskPayload.pageNumber),
        expectedPageCount: null,
        sourceTotalAds: null,
        failureReason,
      });
      logger.warn(
        {
          jobId: helpers.job.id,
          task: "crawl_nettiauto_search_page",
          crawlRunId: taskPayload.crawlRunId,
          sourceQueryId: sourceQuery.id,
          page: taskPayload.pageNumber,
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
      await pauseSourceSearchQuery(sql, sourceQuery.id, {
        pauseMs: config.CRAWLER_BLOCK_PAUSE_MS,
        reason: failureReason,
      });
      return;
    }

    const parsedPage = parseNettiautoAjaxSearchResult(responseBody, {
      crawlKind: sourceQuery.crawlKind,
      pageNumber: taskPayload.pageNumber,
    });
    await persistSearchResultPage(sql, {
      crawlRunId: taskPayload.crawlRunId,
      searchQueryId: sourceQuery.id,
      crawlKind: sourceQuery.crawlKind,
      vehicleCategory: sourceQuery.vehicleCategory,
      sourceUrl: pageUrl,
      pageNumber: taskPayload.pageNumber,
      attemptNumber: helpers.job.attempts,
      responseStatus: response.status,
      responseContentType,
      responseBodyShape,
      responseBodySha256,
      responseBytes,
      durationMs,
      requestHeaders,
      parsedPage,
    });

    const detailCandidates = config.CRAWLER_DETAIL_ENABLED
      ? parsedPage.listings.filter((listing) => listing.normalized.sourceUrl)
      : [];
    const detailJobCount = await reserveCrawlRunDetailJobs(
      sql,
      taskPayload.crawlRunId,
      detailCandidates.length,
      config.CRAWLER_DETAIL_MAX_PER_RUN,
    );
    for (const [index, listing] of detailCandidates.slice(0, detailJobCount).entries()) {

      await helpers.addJob(
        "crawl_nettiauto_detail_page",
        {
          crawlRunId: taskPayload.crawlRunId,
          searchQueryId: sourceQuery.id,
          sourceListingId: listing.sourceListingId,
          sourceUrl: listing.normalized.sourceUrl,
        },
        {
          queueName: "nettiauto",
          maxAttempts: NETTIAUTO_DETAIL_MAX_ATTEMPTS,
          jobKey: `nettiauto:detail:${taskPayload.crawlRunId}:${listing.sourceListingId}`,
          jobKeyMode: "preserve_run_at",
          priority: sourceQuery.priority + NETTIAUTO_DETAIL_PRIORITY_OFFSET,
          runAt: new Date(Date.now() + index * config.CRAWLER_DELAY_MS),
        },
      );
    }

    logger.info(
      {
        jobId: helpers.job.id,
        task: "crawl_nettiauto_search_page",
        crawlRunId: taskPayload.crawlRunId,
        sourceQueryId: sourceQuery.id,
        page: taskPayload.pageNumber,
        parserVersion: parsedPage.parserVersion,
        durationMs,
        status: "parsed",
        parsedListingCount: parsedPage.listings.length,
        issueCount: parsedPage.issues.length,
      },
      "Nettiauto search result page persisted",
    );

    if (parsedPage.issues.some((issue) => issue.code === "invalid_ajax_json")) {
      await markCrawlRunFinished(sql, {
        crawlRunId: taskPayload.crawlRunId,
        status: terminalSearchRunStatus(taskPayload.pageNumber),
        expectedPageCount: parsedPage.totalPages,
        sourceTotalAds: parsedPage.totalAds,
        failureReason: "invalid_ajax_json",
      });
      return;
    }

    if (crawlAllPages && parsedPage.totalPages === null) {
      await markCrawlRunFinished(sql, {
        crawlRunId: taskPayload.crawlRunId,
        status: "partial",
        expectedPageCount: parsedPage.totalPages,
        sourceTotalAds: parsedPage.totalAds,
        failureReason: "missing_total_page_for_uncapped_crawl",
      });
      return;
    }

    if (parsedPage.totalPages !== null && taskPayload.pageNumber >= parsedPage.totalPages) {
      await markCrawlRunFinished(sql, {
        crawlRunId: taskPayload.crawlRunId,
        status: "completed",
        expectedPageCount: parsedPage.totalPages,
        sourceTotalAds: parsedPage.totalAds,
      });
      return;
    }

    if (Number.isFinite(maxPages) && taskPayload.pageNumber >= maxPages) {
      await markCrawlRunFinished(sql, {
        crawlRunId: taskPayload.crawlRunId,
        status: "partial",
        expectedPageCount: parsedPage.totalPages,
        sourceTotalAds: parsedPage.totalAds,
        failureReason: "max_pages_per_run_reached",
      });
      return;
    }

    await helpers.addJob(
      "crawl_nettiauto_search_page",
      {
        crawlRunId: taskPayload.crawlRunId,
        sourceQueryId: sourceQuery.id,
        pageNumber: taskPayload.pageNumber + 1,
      },
      {
        queueName: "nettiauto",
        maxAttempts: NETTIAUTO_SEARCH_MAX_ATTEMPTS,
        jobKey: `nettiauto:search-page:${taskPayload.crawlRunId}:${taskPayload.pageNumber + 1}`,
        jobKeyMode: "preserve_run_at",
        priority: sourceQuery.priority,
        runAt: new Date(Date.now() + config.CRAWLER_DELAY_MS),
      },
    );
  } catch (error) {
    if (helpers.job.attempts >= helpers.job.max_attempts) {
      await markCrawlRunFinished(sql, {
        crawlRunId: taskPayload.crawlRunId,
        status: terminalSearchRunStatus(taskPayload.pageNumber),
        expectedPageCount: null,
        sourceTotalAds: null,
        failureReason:
          error instanceof RetryableNettiautoFetchError
            ? error.failureReason
            : error instanceof Error
              ? error.message
              : "unknown_error",
      });
    }
    throw error;
  } finally {
    await closeSqlClient(sql);
  }
};

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
