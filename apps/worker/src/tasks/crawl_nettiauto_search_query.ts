import { z } from "zod";
import type { Task } from "graphile-worker";
import { parseWorkerConfig } from "@nettiauto/config";
import { closeSqlClient, createSqlClient } from "@nettiauto/db";
import {
  createCrawlRunForSourceQuery,
  markCrawlRunFinished,
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

  const taskPayload = payloadResult.data;
  if (!config.CRAWLER_ENABLED || config.CRAWLER_PAUSED) {
    logger.info(
      {
        jobId: helpers.job.id,
        task: "crawl_nettiauto_search_query",
        sourceQueryId: taskPayload.sourceQueryId,
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
    const [sourceQuery] = await sql<{ id: string; priority: number }[]>`
      select id, priority
      from source_search_queries
      where id = ${taskPayload.sourceQueryId}
        and source = 'nettiauto'
        and enabled = true
      limit 1
    `;

    if (!sourceQuery) {
      throw new Error(`Enabled Nettiauto source query not found: ${taskPayload.sourceQueryId}`);
    }

    crawlRunId = await createCrawlRunForSourceQuery(sql, sourceQuery.id);
    await helpers.addJob(
      "crawl_nettiauto_search_page",
      { crawlRunId, sourceQueryId: sourceQuery.id, pageNumber: 1 },
      {
        queueName: "nettiauto",
        maxAttempts: 3,
        jobKey: `nettiauto:search-page:${crawlRunId}:1`,
        jobKeyMode: "preserve_run_at",
        priority: sourceQuery.priority,
      },
    );

    logger.info(
      {
        jobId: helpers.job.id,
        task: "crawl_nettiauto_search_query",
        crawlRunId,
        sourceQueryId: sourceQuery.id,
      },
      "Nettiauto search query job handed off to page crawler",
    );
  } catch (error) {
    if (crawlRunId) {
      await markCrawlRunFinished(sql, {
        crawlRunId,
        status: "failed",
        expectedPageCount: null,
        sourceTotalAds: null,
        failureReason: error instanceof Error ? error.message : "failed_to_schedule_first_page",
      });
    }
    throw error;
  } finally {
    await closeSqlClient(sql);
  }
};

export default task;
