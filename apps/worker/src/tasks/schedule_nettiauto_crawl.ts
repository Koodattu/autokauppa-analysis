import type { Task } from "graphile-worker";
import { parseWorkerConfig } from "@nettiauto/config";
import { closeSqlClient, createSqlClient } from "@nettiauto/db";
import {
  getEnabledSourceSearchQueries,
  seedDefaultSourceSearchQueries,
} from "@nettiauto/domain";
import { createLogger } from "@nettiauto/logging";

const task: Task = async (_payload, helpers) => {
  const config = parseWorkerConfig();
  const logger = createLogger({ service: "worker", env: config.APP_ENV });

  if (!config.CRAWLER_ENABLED || config.CRAWLER_PAUSED) {
    logger.info(
      {
        jobId: helpers.job.id,
        task: "schedule_nettiauto_crawl",
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
    const queries = await getEnabledSourceSearchQueries(sql);
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
        scheduledQueryCount: queries.length,
      },
      "Nettiauto crawl jobs scheduled",
    );
  } finally {
    await closeSqlClient(sql);
  }
};

export default task;
