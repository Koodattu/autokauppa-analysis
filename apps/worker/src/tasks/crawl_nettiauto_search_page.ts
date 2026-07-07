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
  parseNettiautoAjaxSearchResult,
  persistSearchResultPage,
  sha256,
} from "@nettiauto/domain";
import { createLogger } from "@nettiauto/logging";

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
        sourceSearchHash: string;
        queryParams: Record<string, unknown>;
      }[]
    >`
      select
        id,
        crawl_kind as "crawlKind",
        vehicle_category as "vehicleCategory",
        entry_path as "entryPath",
        priority,
        source_search_hash as "sourceSearchHash",
        query_params as "queryParams"
      from source_search_queries
      where id = ${taskPayload.sourceQueryId}
        and source = 'nettiauto'
        and enabled = true
      limit 1
    `;

    if (!sourceQuery) {
      await markCrawlRunFinished(sql, {
        crawlRunId: taskPayload.crawlRunId,
        status: "failed",
        expectedPageCount: null,
        sourceTotalAds: null,
        failureReason: `Enabled Nettiauto source query not found: ${taskPayload.sourceQueryId}`,
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
      const failureReason = classifyFetchFailure(response.status, response.redirected, responseBodyShape);
      await persistSearchResultPage(sql, {
        crawlRunId: taskPayload.crawlRunId,
        searchQueryId: sourceQuery.id,
        crawlKind: sourceQuery.crawlKind,
        vehicleCategory: sourceQuery.vehicleCategory,
        sourceUrl: pageUrl,
        pageNumber: taskPayload.pageNumber,
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
      await markCrawlRunFinished(sql, {
        crawlRunId: taskPayload.crawlRunId,
        status: "partial",
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
        "Nettiauto search result fetch stopped crawl",
      );
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
        status: "partial",
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
      responseStatus: response.status,
      responseContentType,
      responseBodyShape,
      responseBodySha256,
      responseBytes,
      durationMs,
      requestHeaders,
      parsedPage,
    });

    for (const [index, listing] of parsedPage.listings.entries()) {
      if (!listing.normalized.sourceUrl) {
        continue;
      }

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
          maxAttempts: 2,
          jobKey: `nettiauto:detail:${taskPayload.crawlRunId}:${listing.sourceListingId}`,
          jobKeyMode: "preserve_run_at",
          priority: sourceQuery.priority + 10,
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
        status: "partial",
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
        maxAttempts: 3,
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
