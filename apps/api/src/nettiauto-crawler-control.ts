import type { SqlClient } from "@nettiauto/db";
import {
  getAdminCrawlerStatus,
  setSourceSearchQueriesPaused,
  type AdminCrawlerStatusResponse,
} from "@nettiauto/domain";
import type { AppLogger } from "@nettiauto/logging";
import type { CrawlKindSelection, ManualCrawlScheduler } from "./manual-crawl-scheduler";

export interface CrawlerState {
  enabled: boolean;
  paused: boolean;
  delayMs: number;
  maxPagesPerRun: number;
  detailEnabled: boolean;
  detailMaxPerRun: number;
}

export type CrawlerControlCommand =
  | { kind: "schedule"; crawlKind: CrawlKindSelection }
  | { kind: "pause"; crawlKind: CrawlKindSelection; pauseMinutes: number }
  | { kind: "resume"; crawlKind: CrawlKindSelection };

export type CrawlerControlReceipt =
  | {
      kind: "scheduled";
      task: "schedule_nettiauto_crawl";
      crawlKind: CrawlKindSelection;
      jobId: string | null;
      runAt: string | null;
    }
  | {
      kind: "pause_updated";
      action: "pause" | "resume";
      crawlKind: CrawlKindSelection;
      affectedQueryCount: number;
      pausedUntil: string | null;
    };

export interface NettiautoCrawlerControl {
  observe(): Promise<AdminCrawlerStatusResponse>;
  apply(command: CrawlerControlCommand): Promise<CrawlerControlReceipt>;
}

export class CrawlerDisabledError extends Error {
  constructor() {
    super("Crawler is disabled.");
    this.name = "CrawlerDisabledError";
  }
}

export class CrawlerPausedError extends Error {
  constructor() {
    super("Crawler is paused.");
    this.name = "CrawlerPausedError";
  }
}

export class CrawlerSchedulerUnavailableError extends Error {
  constructor() {
    super("Crawler scheduler is not ready.");
    this.name = "CrawlerSchedulerUnavailableError";
  }
}

export function createNettiautoCrawlerControl(input: {
  sql: SqlClient;
  scheduler: ManualCrawlScheduler;
  crawlerState: Readonly<CrawlerState>;
  logger: AppLogger;
  now?: () => number;
}): NettiautoCrawlerControl {
  const now = input.now ?? Date.now;

  return {
    observe() {
      return getAdminCrawlerStatus(input.sql, input.crawlerState);
    },

    async apply(command) {
      if (command.kind === "schedule") {
        if (!input.crawlerState.enabled) {
          throw new CrawlerDisabledError();
        }
        if (input.crawlerState.paused) {
          throw new CrawlerPausedError();
        }

        const result = await input.scheduler.schedule(command.crawlKind);
        if (result.kind === "not_ready") {
          throw new CrawlerSchedulerUnavailableError();
        }

        input.logger.info(
          { jobId: result.jobId, crawlKind: command.crawlKind },
          "Manual Nettiauto crawl scheduled",
        );
        return {
          kind: "scheduled",
          task: "schedule_nettiauto_crawl",
          crawlKind: command.crawlKind,
          jobId: result.jobId,
          runAt: result.runAt,
        };
      }

      const pausedUntil = command.kind === "pause"
        ? new Date(now() + command.pauseMinutes * 60 * 1_000)
        : null;
      const affectedQueryCount = await setSourceSearchQueriesPaused(input.sql, {
        crawlKind: command.crawlKind,
        pausedUntil,
        reason: command.kind === "pause" ? "admin_pause" : null,
      });
      const action = command.kind === "pause" ? "pause" : "resume";
      input.logger.info(
        { action, crawlKind: command.crawlKind, affectedQueryCount },
        "Nettiauto crawler control updated",
      );
      return {
        kind: "pause_updated",
        action,
        crawlKind: command.crawlKind,
        affectedQueryCount,
        pausedUntil: pausedUntil?.toISOString() ?? null,
      };
    },
  };
}
