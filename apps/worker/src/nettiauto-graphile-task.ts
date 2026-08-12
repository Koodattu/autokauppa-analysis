import { parseWorkerConfig } from "@nettiauto/config";
import { closeSqlClient, createSqlClient } from "@nettiauto/db";
import { createLogger } from "@nettiauto/logging";
import type { Task } from "graphile-worker";
import { z } from "zod";
import { createGraphileCrawlWorkQueue } from "./crawl-work-queue";
import {
  createNettiautoCrawlExecution,
  type CrawlJobContext,
} from "./nettiauto-crawl-execution";
import { createHttpNettiautoSource } from "./nettiauto-source";

type NettiautoTaskName =
  | "schedule_nettiauto_crawl"
  | "crawl_nettiauto_search_page"
  | "crawl_nettiauto_detail_page";

const schedulePayloadSchema = z.object({
  force: z.boolean().optional().default(false),
  crawlKind: z.enum(["current", "sold"]).optional(),
});

const searchResultPagePayloadSchema = z.object({
  crawlRunId: z.string().uuid(),
  sourceQueryId: z.string().uuid(),
  pageNumber: z.number().int().positive(),
});

const detailPagePayloadSchema = z.object({
  crawlRunId: z.string().uuid(),
  searchQueryId: z.string().uuid(),
  sourceListingId: z.string().min(1),
  sourceUrl: z.string().url(),
  force: z.boolean().optional().default(false),
});

export function createNettiautoGraphileTask(taskName: NettiautoTaskName): Task {
  return async (payload, helpers) => {
    const config = parseWorkerConfig();
    const logger = createLogger({ service: "worker", env: config.APP_ENV });
    const context = createJobContext(helpers);
    const command = parseTaskPayload(taskName, payload);
    const sql = createSqlClient(config.DATABASE_URL, 1);
    try {
      const execution = createNettiautoCrawlExecution({
        sql,
        config,
        logger,
        source: createHttpNettiautoSource(),
        workQueue: createGraphileCrawlWorkQueue(helpers.addJob),
      });

      if (command.taskName === "schedule_nettiauto_crawl") {
        await execution.schedule(command.payload, context);
        return;
      }

      if (command.taskName === "crawl_nettiauto_search_page") {
        await execution.collectSearchResultPage(command.payload, context);
        return;
      }

      await execution.enrichDetailPage(command.payload, context);
    } finally {
      await closeSqlClient(sql);
    }
  };
}

function parseTaskPayload(taskName: NettiautoTaskName, payload: unknown) {
  if (taskName === "schedule_nettiauto_crawl") {
    const parsed = schedulePayloadSchema.safeParse(payload ?? {});
    if (!parsed.success) {
      throw invalidPayload(taskName, parsed.error);
    }
    return { taskName, payload: parsed.data } as const;
  }
  if (taskName === "crawl_nettiauto_search_page") {
    const parsed = searchResultPagePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw invalidPayload(taskName, parsed.error);
    }
    return { taskName, payload: parsed.data } as const;
  }

  const parsed = detailPagePayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw invalidPayload(taskName, parsed.error);
  }
  return { taskName, payload: parsed.data } as const;
}

function createJobContext(helpers: Parameters<Task>[1]): CrawlJobContext {
  return {
    jobId: String(helpers.job.id),
    attemptNumber: helpers.job.attempts,
    maxAttempts: helpers.job.max_attempts,
    abortSignal: helpers.abortSignal,
  };
}

function invalidPayload(taskName: NettiautoTaskName, error: z.ZodError) {
  return new Error(`Invalid ${taskName} payload: ${error.message}`);
}
