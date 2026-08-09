import { z } from "zod";
import type { Task } from "graphile-worker";
import { parseWorkerConfig } from "@nettiauto/config";
import { closeSqlClient, createSqlClient } from "@nettiauto/db";
import {
  NETTIAUTO_DETAIL_PARSER_VERSION,
  classifyNettiautoResponseBody,
  nettiautoDetailRequestHeaders,
  pauseSourceSearchQuery,
  parseNettiautoDetailPage,
  persistNettiautoDetailPage,
  sha256,
} from "@nettiauto/domain";
import { createLogger } from "@nettiauto/logging";
import {
  RetryableNettiautoFetchError,
  classifyRequestError,
  createNettiautoRequestSignal,
  isRetryableNettiautoHttpStatus,
  shouldPauseNettiautoSource,
} from "../nettiauto-fetch-policy";

const payloadSchema = z.object({
  crawlRunId: z.string().uuid(),
  searchQueryId: z.string().uuid(),
  sourceListingId: z.string().min(1),
  sourceUrl: z.string().url(),
  force: z.boolean().optional().default(false),
});

const task: Task = async (payload, helpers) => {
  const config = parseWorkerConfig();
  const logger = createLogger({ service: "worker", env: config.APP_ENV });
  const payloadResult = payloadSchema.safeParse(payload);
  if (!payloadResult.success) {
    throw new Error(`Invalid crawl_nettiauto_detail_page payload: ${payloadResult.error.message}`);
  }

  const taskPayload = payloadResult.data;
  if (!config.CRAWLER_ENABLED || config.CRAWLER_PAUSED) {
    logger.info(
      {
        jobId: helpers.job.id,
        task: "crawl_nettiauto_detail_page",
        sourceListingId: taskPayload.sourceListingId,
        crawlerEnabled: config.CRAWLER_ENABLED,
        crawlerPaused: config.CRAWLER_PAUSED,
      },
      "Nettiauto detail crawl skipped",
    );
    return;
  }

  const sql = createSqlClient(config.DATABASE_URL, 1);
  try {
    const [sourceQuery] = await sql<
      { enabled: boolean; pausedUntil: string | null; pauseReason: string | null }[]
    >`
      select
        enabled,
        paused_until::text as "pausedUntil",
        pause_reason as "pauseReason"
      from source_search_queries
      where id = ${taskPayload.searchQueryId}
        and source = 'nettiauto'
      limit 1
    `;
    if (
      !sourceQuery?.enabled ||
      (sourceQuery.pausedUntil && new Date(sourceQuery.pausedUntil).getTime() > Date.now())
    ) {
      logger.info(
        {
          jobId: helpers.job.id,
          sourceListingId: taskPayload.sourceListingId,
          pausedUntil: sourceQuery?.pausedUntil ?? null,
          pauseReason: sourceQuery?.pauseReason ?? null,
        },
        "Nettiauto detail crawl skipped because source query is unavailable",
      );
      return;
    }

    if (!taskPayload.force) {
      const [existing] = await sql<
        { sourceUpdatedDate: string | null; detailParserVersion: string | null }[]
      >`
        select latest_snapshot.source_updated_date::text as "sourceUpdatedDate"
             , latest_snapshot.normalized_data->>'detailParserVersion' as "detailParserVersion"
        from listings
        left join listing_snapshots latest_snapshot on latest_snapshot.id = listings.latest_snapshot_id
        where listings.source = 'nettiauto'
          and listings.source_listing_id = ${taskPayload.sourceListingId}
        limit 1
      `;
      if (existing?.detailParserVersion === NETTIAUTO_DETAIL_PARSER_VERSION) {
        logger.info(
          {
            jobId: helpers.job.id,
            task: "crawl_nettiauto_detail_page",
            sourceListingId: taskPayload.sourceListingId,
            sourceUpdatedDate: existing.sourceUpdatedDate,
            detailParserVersion: existing.detailParserVersion,
          },
          "Nettiauto detail crawl skipped because latest snapshot already has parsed detail data",
        );
        return;
      }
    }

    const requestHeaders = nettiautoDetailRequestHeaders(taskPayload.sourceUrl);
    const startedAt = Date.now();
    const { signal, timeoutSignal } = createNettiautoRequestSignal(
      helpers.abortSignal,
      config.CRAWLER_REQUEST_TIMEOUT_MS,
    );
    let response: Response;
    let responseBody: string;
    try {
      response = await fetch(taskPayload.sourceUrl, {
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
      await persistNettiautoDetailPage(sql, {
        crawlRunId: taskPayload.crawlRunId,
        searchQueryId: taskPayload.searchQueryId,
        sourceListingId: taskPayload.sourceListingId,
        sourceUrl: taskPayload.sourceUrl,
        attemptNumber: helpers.job.attempts,
        responseStatus: null,
        responseContentType: null,
        responseBodyShape: "unknown",
        responseBodySha256: null,
        responseBytes: null,
        durationMs,
        requestHeaders,
        errorType: failureReason,
        errorMessage: `Nettiauto detail request ended before a response (${failureReason}).`,
        parsedDetail: null,
      });
      throw new RetryableNettiautoFetchError(
        failureReason,
        `Nettiauto detail request failed (${failureReason}).`,
      );
    }
    const durationMs = Date.now() - startedAt;
    const responseContentType = response.headers.get("content-type");
    const responseBodyShape = classifyNettiautoResponseBody(responseBody, responseContentType);
    const responseBytes = new TextEncoder().encode(responseBody).byteLength;
    const responseBodySha256 = sha256(responseBody);
    const canParse = response.ok && ["html_document", "html_fragment"].includes(responseBodyShape);
    const parsedDetail = canParse
      ? parseNettiautoDetailPage(responseBody, {
          sourceListingId: taskPayload.sourceListingId,
        })
      : null;
    const failureReason = canParse
      ? null
      : classifyDetailFetchFailure(response.status, responseBodyShape);

    const result = await persistNettiautoDetailPage(sql, {
      crawlRunId: taskPayload.crawlRunId,
      searchQueryId: taskPayload.searchQueryId,
      sourceListingId: taskPayload.sourceListingId,
      sourceUrl: taskPayload.sourceUrl,
      attemptNumber: helpers.job.attempts,
      responseStatus: response.status,
      responseContentType,
      responseBodyShape,
      responseBodySha256,
      responseBytes,
      durationMs,
      requestHeaders,
      errorType: failureReason,
      errorMessage: failureReason
        ? `Nettiauto detail page returned ${responseBodyShape} with HTTP ${response.status}.`
        : null,
      parsedDetail,
    });

    if (failureReason && shouldPauseNettiautoSource(failureReason)) {
      const pausedUntil = await pauseSourceSearchQuery(sql, taskPayload.searchQueryId, {
        pauseMs: config.CRAWLER_BLOCK_PAUSE_MS,
        reason: failureReason,
      });
      logger.warn(
        { sourceListingId: taskPayload.sourceListingId, pausedUntil, failureReason },
        "Nettiauto source query paused after detail fetch failure",
      );
      return;
    }

    if (isRetryableNettiautoHttpStatus(response.status)) {
      throw new RetryableNettiautoFetchError(
        failureReason ?? `http_${response.status}`,
        `Nettiauto detail request returned transient HTTP ${response.status}.`,
      );
    }

    logger.info(
      {
        jobId: helpers.job.id,
        task: "crawl_nettiauto_detail_page",
        sourceListingId: taskPayload.sourceListingId,
        sourceFetchId: result.sourceFetchId,
        sourceUpdatedDate: result.sourceUpdatedDate,
        durationMs,
        responseBodyShape,
      },
      "Nettiauto detail page persisted",
    );
  } finally {
    await closeSqlClient(sql);
  }
};

function classifyDetailFetchFailure(statusCode: number, bodyShape: string) {
  if ([301, 302, 303, 307, 308].includes(statusCode)) {
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

  if (bodyShape !== "html_document" && bodyShape !== "html_fragment") {
    return "unexpected_response_body_shape";
  }

  return "fetch_failed";
}


export default task;
