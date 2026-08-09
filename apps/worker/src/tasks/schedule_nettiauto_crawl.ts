import type { Task } from "graphile-worker";
import { z } from "zod";
import { parseWorkerConfig } from "@nettiauto/config";
import { closeSqlClient, createSqlClient } from "@nettiauto/db";
import {
  createCrawlRunForSourceQuery,
  completeCrawlRun,
  getSchedulableSourceSearchQueries,
  recoverStaleCrawlRuns,
  seedDefaultSourceSearchQueries,
} from "@nettiauto/domain";
import { createLogger } from "@nettiauto/logging";
import { createGraphileCrawlWorkQueue } from "../crawl-work-queue";

const payloadSchema = z.object({
  force: z.boolean().optional().default(false),
  crawlKind: z.enum(["current", "sold"]).optional(),
});

const task: Task = async (payload, helpers) => {
  const config = parseWorkerConfig();
  const logger = createLogger({ service: "worker", env: config.APP_ENV });
  const workQueue = createGraphileCrawlWorkQueue(helpers.addJob);
  const payloadResult = payloadSchema.safeParse(payload ?? {});
  if (!payloadResult.success) {
    throw new Error(`Invalid schedule_nettiauto_crawl payload: ${payloadResult.error.message}`);
  }

  if (!config.CRAWLER_ENABLED || config.CRAWLER_PAUSED) {
    logger.info(
      {
        jobId: helpers.job.id,
        task: "schedule_nettiauto_crawl",
        force: payloadResult.data.force,
        crawlKind: payloadResult.data.crawlKind ?? "all",
        crawlerEnabled: config.CRAWLER_ENABLED,
        crawlerPaused: config.CRAWLER_PAUSED,
      },
      "Nettiauto crawl scheduling skipped",
    );
    return;
  }

  const sql = createSqlClient(config.DATABASE_URL, 1);
  try {
    await seedDefaultSourceSearchQueries(sql);
    const recoveredRuns = await recoverStaleCrawlRuns(sql);
    const queries = await getSchedulableSourceSearchQueries(sql, {
      force: payloadResult.data.force,
      crawlKind: payloadResult.data.crawlKind,
    });
    let scheduledQueryCount = 0;
    for (const query of queries) {
      const crawlRunId = await createCrawlRunForSourceQuery(sql, query.id);
      if (!crawlRunId) {
        continue;
      }
      try {
        await workQueue.enqueueSearchPage({
          crawlRunId,
          sourceQueryId: query.id,
          pageNumber: 1,
          priority: query.priority,
        });
        scheduledQueryCount += 1;
      } catch (error) {
        await completeCrawlRun(sql, {
          crawlRunId,
          cause: {
            kind: "source_failure",
            reason: error instanceof Error ? error.message : "failed_to_schedule_first_page",
          },
        });
        throw error;
      }
    }

    logger.info(
      {
        jobId: helpers.job.id,
        task: "schedule_nettiauto_crawl",
        force: payloadResult.data.force,
        crawlKind: payloadResult.data.crawlKind ?? "all",
        scheduledQueryCount,
        recoveredStaleRunCount: recoveredRuns.length,
      },
      "Nettiauto crawl jobs scheduled",
    );
  } finally {
    await closeSqlClient(sql);
  }
};

export default task;
