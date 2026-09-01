import { parseWorkerConfig, type WorkerConfig } from "@nettiauto/config";
import { closeSqlClient, createSqlClient } from "@nettiauto/db";
import { createLogger } from "@nettiauto/logging";
import type { Task } from "graphile-worker";
import { z } from "zod";
import { createGraphileCrawlWorkQueue } from "./crawl-work-queue";
import {
  createNettiautoCrawlExecution,
  type CrawlJobContext,
} from "./nettiauto-crawl-execution";
import {
  createFlareSolverrNettiautoSource,
  createHttpNettiautoSource,
  createImpitNettiautoSource,
  type NettiautoSource,
} from "./nettiauto-source";
import { createListingHeroImageArchiver } from "./hero-image-archiver";
import { executeManagedDetailBackfillJob } from "./nettiauto-detail-backfill-task";

type NettiautoTaskName =
  | "schedule_nettiauto_crawl"
  | "crawl_nettiauto_search_page"
  | "crawl_nettiauto_detail_page";

let cachedSource: { key: string; source: NettiautoSource } | undefined;

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
  crawlRunId: z.string().uuid().nullable(),
  detailBackfillRunId: z.string().uuid().nullable().optional().default(null),
  detailBackfillTargetListingId: z.string().uuid().nullable().optional().default(null),
  searchQueryId: z.string().uuid(),
  sourceListingId: z.string().min(1),
  sourceUrl: z.string().url(),
  force: z.boolean().optional().default(false),
}).refine(
  (value) => Number(value.crawlRunId !== null) + Number(value.detailBackfillRunId !== null) === 1,
  { message: "Exactly one crawl or detail backfill run is required." },
);

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
        source: getNettiautoSource(config, logger),
        workQueue: createGraphileCrawlWorkQueue(helpers.addJob),
        heroImageArchiver: createListingHeroImageArchiver({
          sql,
          enabled: config.HERO_IMAGE_ARCHIVE_ENABLED,
          storagePath: config.HERO_IMAGE_STORAGE_PATH,
          maxSourceBytes: config.HERO_IMAGE_MAX_SOURCE_BYTES,
        }),
      });

      if (command.taskName === "schedule_nettiauto_crawl") {
        await execution.schedule(command.payload, context);
        return;
      }

      if (command.taskName === "crawl_nettiauto_search_page") {
        await execution.collectSearchResultPage(command.payload, context);
        return;
      }

      if (command.payload.detailBackfillRunId) {
        await executeManagedDetailBackfillJob({
          sql,
          config,
          logger,
          addJob: helpers.addJob,
          command: {
            detailBackfillRunId: command.payload.detailBackfillRunId,
            detailBackfillTargetListingId: command.payload.detailBackfillTargetListingId,
          },
          execute: () => execution.enrichDetailPage(command.payload, context),
        });
        return;
      }

      await execution.enrichDetailPage(command.payload, context);
    } finally {
      await closeSqlClient(sql);
    }
  };
}

function getNettiautoSource(config: WorkerConfig, logger: ReturnType<typeof createLogger>) {
  const key = JSON.stringify({
    transport: config.NETTIAUTO_SOURCE_TRANSPORT,
    delayMs: config.CRAWLER_DELAY_MS,
    jitterMs: config.CRAWLER_DELAY_JITTER_MS,
    flaresolverrUrl: config.FLARESOLVERR_URL,
    flaresolverrSessionId: config.FLARESOLVERR_SESSION_ID,
    flaresolverrSessionTtlMinutes: config.FLARESOLVERR_SESSION_TTL_MINUTES,
  });
  if (cachedSource?.key === key) {
    return cachedSource.source;
  }

  const pacing = {
    delayMs: config.CRAWLER_DELAY_MS,
    jitterMs: config.CRAWLER_DELAY_JITTER_MS,
  };
  const source = config.NETTIAUTO_SOURCE_TRANSPORT === "impit"
    ? createImpitNettiautoSource(pacing)
    : config.NETTIAUTO_SOURCE_TRANSPORT === "flaresolverr"
      ? createFlareSolverrNettiautoSource({
        endpoint: config.FLARESOLVERR_URL,
        sessionId: config.FLARESOLVERR_SESSION_ID,
        sessionTtlMinutes: config.FLARESOLVERR_SESSION_TTL_MINUTES,
        pacing,
      })
      : createHttpNettiautoSource(globalThis.fetch, pacing);

  cachedSource = { key, source };
  logger.info(
    { transport: config.NETTIAUTO_SOURCE_TRANSPORT },
    "Nettiauto source transport initialized",
  );
  return source;
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
