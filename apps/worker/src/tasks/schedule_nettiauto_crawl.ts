import type { Task } from "graphile-worker";
import { z } from "zod";
import { parseWorkerConfig } from "@nettiauto/config";
import { closeSqlClient, createSqlClient } from "@nettiauto/db";
import {
  getSchedulableSourceSearchQueries,
  seedDefaultSourceSearchQueries,
} from "@nettiauto/domain";
import { createLogger } from "@nettiauto/logging";

const payloadSchema = z.object({
  force: z.boolean().optional().default(false),
});

const task: Task = async (payload, helpers) => {
  const config = parseWorkerConfig();
  const logger = createLogger({ service: "worker", env: config.APP_ENV });
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
    const queries = await getSchedulableSourceSearchQueries(sql, {
      force: payloadResult.data.force,
    });
    for (const query of queries) {
      await helpers.addJob(
        "crawl_nettiauto_search_query",
        { sourceQueryId: query.id },
        {
          queueName: "nettiauto",
          maxAttempts: 3,
          jobKey: `nettiauto:${query.id}`,
          jobKeyMode: "preserve_run_at",
          priority: query.priority,
        },
      );
    }

    logger.info(
      {
        jobId: helpers.job.id,
        task: "schedule_nettiauto_crawl",
        force: payloadResult.data.force,
        scheduledQueryCount: queries.length,
      },
      "Nettiauto crawl jobs scheduled",
    );
  } finally {
    await closeSqlClient(sql);
  }
};

export default task;
