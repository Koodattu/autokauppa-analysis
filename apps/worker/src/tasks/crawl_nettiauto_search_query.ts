import { z } from "zod";
import type { Task } from "graphile-worker";
import { parseWorkerConfig } from "@nettiauto/config";
import { closeSqlClient, createSqlClient } from "@nettiauto/db";
import {
  createCrawlRunForSourceQuery,
  completeCrawlRun,
} from "@nettiauto/domain";
import { createLogger } from "@nettiauto/logging";
import { createGraphileCrawlWorkQueue } from "../crawl-work-queue";

const payloadSchema = z.object({
  sourceQueryId: z.string().uuid(),
});

const task: Task = async (payload, helpers) => {
  const config = parseWorkerConfig();
  const logger = createLogger({ service: "worker", env: config.APP_ENV });
  const workQueue = createGraphileCrawlWorkQueue(helpers.addJob);
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
    if (!crawlRunId) {
      logger.info(
        {
          jobId: helpers.job.id,
          task: "crawl_nettiauto_search_query",
          sourceQueryId: sourceQuery.id,
        },
        "Nettiauto search query skipped because a crawl is already active",
      );
      return;
    }
    await workQueue.enqueueSearchResultPage({
      crawlRunId,
      sourceQueryId: sourceQuery.id,
      pageNumber: 1,
      priority: sourceQuery.priority,
    });

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
      await completeCrawlRun(sql, {
        crawlRunId,
        cause: {
          kind: "source_failure",
          reason: error instanceof Error ? error.message : "failed_to_schedule_first_page",
        },
      });
    }
    throw error;
  } finally {
    await closeSqlClient(sql);
  }
};

export default task;
