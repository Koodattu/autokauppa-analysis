import { describe, expect, it, vi } from "vitest";
import type { SqlClient } from "@nettiauto/db";
import type { AppLogger } from "@nettiauto/logging";
import {
  createDetailBackfillControl,
  DetailBackfillAlreadyActiveError,
} from "./detail-backfill-control";
import { CrawlerDisabledError, type CrawlerState } from "./nettiauto-crawler-control";

const crawlerState: CrawlerState = {
  enabled: true,
  paused: false,
  delayMs: 2_500,
  maxPagesPerRun: 2,
  detailEnabled: false,
  detailMaxPerRun: 50,
};

const logger = { info: vi.fn() } as unknown as AppLogger;

describe("Detail Backfill Control", () => {
  it("queues one locked, idempotent control job", async () => {
    const calls: string[] = [];
    const results = [
      [],
      [{ relationName: "graphile_worker.jobs" }],
      [{ exists: false }],
      [{ exists: false }],
      [{ jobId: "741999", runAt: "2026-08-17T12:00:00Z" }],
    ];
    const sql = transactionalSql(calls, results);

    await expect(createDetailBackfillControl({ sql, crawlerState, logger }).start()).resolves.toEqual({
      task: "schedule_nettiauto_detail_backfill",
      jobId: "741999",
      runAt: "2026-08-17T12:00:00Z",
    });

    expect(calls[0]).toContain("pg_advisory_xact_lock");
    expect(calls[2]).toContain("status in ('planned', 'running', 'queued')");
    expect(calls[4]).toContain("identifier => 'schedule_nettiauto_detail_backfill'");
    expect(calls[4]).toContain("queue_name => 'nettiauto-backfill-control'");
    expect(calls[4]).not.toContain("job_key");
  });

  it("rejects duplicate active runs while holding the transaction lock", async () => {
    const calls: string[] = [];
    const sql = transactionalSql(calls, [
      [],
      [{ relationName: "graphile_worker.jobs" }],
      [{ exists: true }],
      [{ exists: false }],
    ]);

    await expect(
      createDetailBackfillControl({ sql, crawlerState, logger }).start(),
    ).rejects.toBeInstanceOf(DetailBackfillAlreadyActiveError);
    expect(calls).toHaveLength(4);
  });

  it("rejects disabled crawling before opening a transaction", async () => {
    const begin = vi.fn();
    const sql = Object.assign(async () => [], { begin }) as unknown as SqlClient;

    await expect(
      createDetailBackfillControl({
        sql,
        crawlerState: { ...crawlerState, enabled: false },
        logger,
      }).start(),
    ).rejects.toBeInstanceOf(CrawlerDisabledError);
    expect(begin).not.toHaveBeenCalled();
  });

  it("reports the active run with live parsed progress", async () => {
    const sql = (async (strings: TemplateStringsArray) => {
      const text = strings.join("");
      if (text.includes("from detail_backfill_runs run")) {
        return [{
          id: "cc1ab41a-c8eb-4c72-95de-1fa292a2e760",
          targetParserVersion: "nettiauto-detail-v4",
          status: "running",
          targetCount: 145_503,
          scheduledCount: 10_000,
          parsedCount: 8_000,
          unavailableCount: 10,
          failedCount: 0,
          startedAt: "2026-08-17T12:00:00Z",
          finishedAt: null,
          createdAt: "2026-08-17T12:00:00Z",
        }];
      }
      if (text.includes("to_regclass('graphile_worker.jobs')")) {
        return [{ relationName: "graphile_worker.jobs" }];
      }
      return [{ queued: true }];
    }) as unknown as SqlClient;

    await expect(
      createDetailBackfillControl({ sql, crawlerState, logger }).observe(),
    ).resolves.toMatchObject({
      active: true,
      schedulerQueued: true,
      latestRun: { parsedCount: 8_000, targetCount: 145_503 },
    });
  });
});

function transactionalSql(calls: string[], results: unknown[][]) {
  const transaction = (async (strings: TemplateStringsArray) => {
    calls.push(strings.join(""));
    return results[calls.length - 1] ?? [];
  }) as unknown as SqlClient;
  return Object.assign(async () => [], {
    begin: async (callback: (sql: SqlClient) => Promise<unknown>) => callback(transaction),
  }) as unknown as SqlClient;
}
