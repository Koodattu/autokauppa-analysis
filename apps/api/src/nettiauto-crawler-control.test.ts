import { describe, expect, it, vi } from "vitest";
import type { SqlClient } from "@nettiauto/db";
import type { AppLogger } from "@nettiauto/logging";
import type { ManualCrawlScheduler } from "./manual-crawl-scheduler";
import {
  CrawlerDisabledError,
  CrawlerPausedError,
  CrawlerSchedulerUnavailableError,
  createNettiautoCrawlerControl,
  type CrawlerState,
} from "./nettiauto-crawler-control";

const defaultState: CrawlerState = {
  enabled: true,
  paused: false,
  delayMs: 2_500,
  maxPagesPerRun: 2,
  detailEnabled: false,
  detailMaxPerRun: 50,
};

const sql = {} as SqlClient;
const logger = { info: vi.fn() } as unknown as AppLogger;

function createControl(
  scheduler: ManualCrawlScheduler,
  crawlerState: CrawlerState = defaultState,
) {
  return createNettiautoCrawlerControl({ sql, scheduler, crawlerState, logger });
}

describe("Nettiauto Crawler Control", () => {
  it("rejects disabled and globally paused scheduling before the scheduler seam", async () => {
    const schedule = vi.fn();
    const scheduler = { schedule } as ManualCrawlScheduler;

    await expect(
      createControl(scheduler, { ...defaultState, enabled: false, paused: true }).apply({
        kind: "schedule",
        crawlKind: "all",
      }),
    ).rejects.toBeInstanceOf(CrawlerDisabledError);
    await expect(
      createControl(scheduler, { ...defaultState, paused: true }).apply({
        kind: "schedule",
        crawlKind: "sold",
      }),
    ).rejects.toBeInstanceOf(CrawlerPausedError);
    expect(schedule).not.toHaveBeenCalled();
  });

  it("reports an unavailable scheduler without leaking Graphile details", async () => {
    const scheduler: ManualCrawlScheduler = {
      schedule: vi.fn(async () => ({ kind: "not_ready" as const })),
    };

    await expect(
      createControl(scheduler).apply({ kind: "schedule", crawlKind: "current" }),
    ).rejects.toBeInstanceOf(CrawlerSchedulerUnavailableError);
  });

  it("returns a semantic scheduling receipt", async () => {
    const schedule = vi.fn(async () => ({
      kind: "scheduled" as const,
      jobId: "job-1",
      runAt: "2026-08-12T08:00:00Z",
    }));
    const control = createControl({ schedule });

    await expect(
      control.apply({ kind: "schedule", crawlKind: "sold" }),
    ).resolves.toEqual({
      kind: "scheduled",
      task: "schedule_nettiauto_crawl",
      crawlKind: "sold",
      jobId: "job-1",
      runAt: "2026-08-12T08:00:00Z",
    });
    expect(schedule).toHaveBeenCalledWith("sold");
  });

  it("applies a deterministic Source Search Query pause without scheduling work", async () => {
    const sqlCalls: unknown[][] = [];
    const pauseSql = (async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      sqlCalls.push(values);
      return [{ id: "query-1" }, { id: "query-2" }];
    }) as unknown as SqlClient;
    const schedule = vi.fn();
    const control = createNettiautoCrawlerControl({
      sql: pauseSql,
      scheduler: { schedule } as ManualCrawlScheduler,
      crawlerState: defaultState,
      logger,
      now: () => Date.parse("2026-08-12T08:00:00Z"),
    });

    await expect(
      control.apply({ kind: "pause", crawlKind: "current", pauseMinutes: 90 }),
    ).resolves.toEqual({
      kind: "pause_updated",
      action: "pause",
      crawlKind: "current",
      affectedQueryCount: 2,
      pausedUntil: "2026-08-12T09:30:00.000Z",
    });
    expect(schedule).not.toHaveBeenCalled();
    expect(sqlCalls).toEqual([
      [new Date("2026-08-12T09:30:00.000Z"), "admin_pause", "current", "current"],
    ]);
  });
});
