import { z } from "zod";
import type { Task } from "graphile-worker";
import { parseWorkerConfig } from "@nettiauto/config";
import { closeSqlClient, createSqlClient } from "@nettiauto/db";
import {
  classifyNettiautoResponseBody,
  nettiautoDetailRequestHeaders,
  parseNettiautoDetailPage,
  persistNettiautoDetailPage,
  sha256,
} from "@nettiauto/domain";
import { createLogger } from "@nettiauto/logging";

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
    if (!taskPayload.force) {
      const [existing] = await sql<{ sourceUpdatedDate: string | null }[]>`
        select latest_snapshot.source_updated_date::text as "sourceUpdatedDate"
        from listings
        left join lateral (
          select source_updated_date
          from listing_snapshots
          where listing_id = listings.id
          order by observed_at desc, created_at desc
          limit 1
        ) latest_snapshot on true
        where listings.source = 'nettiauto'
          and listings.source_listing_id = ${taskPayload.sourceListingId}
        limit 1
      `;
      if (existing?.sourceUpdatedDate) {
        logger.info(
          {
            jobId: helpers.job.id,
            task: "crawl_nettiauto_detail_page",
            sourceListingId: taskPayload.sourceListingId,
            sourceUpdatedDate: existing.sourceUpdatedDate,
          },
          "Nettiauto detail crawl skipped because latest snapshot already has a source updated date",
        );
        return;
      }
    }

    const requestHeaders = nettiautoDetailRequestHeaders(taskPayload.sourceUrl);
    const startedAt = Date.now();
    const response = await fetch(taskPayload.sourceUrl, {
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
