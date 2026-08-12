import { describe, expect, it } from "vitest";
import type { SqlClient } from "@nettiauto/db";
import { createPostgresManualCrawlScheduler } from "./manual-crawl-scheduler";

describe("PostgreSQL manual crawl scheduler adapter", () => {
  it("owns the deployed Graphile task, payload, and job options", async () => {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const sql = Object.assign(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        calls.push({ text: strings.join("?"), values });
        return calls.length === 1
          ? [{ relationName: "graphile_worker.jobs" }]
          : [{ jobId: "job-1", runAt: "2026-08-12T08:00:00Z" }];
      },
      { json: (value: unknown) => value },
    ) as unknown as SqlClient;
    const scheduler = createPostgresManualCrawlScheduler(sql);

    await expect(scheduler.schedule("sold")).resolves.toEqual({
      kind: "scheduled",
      jobId: "job-1",
      runAt: "2026-08-12T08:00:00Z",
    });

    expect(calls).toHaveLength(2);
    const scheduleCall = calls[1]!;
    expect(scheduleCall.text).toContain("identifier => 'schedule_nettiauto_crawl'");
    expect(scheduleCall.text).toContain("queue_name => 'nettiauto'");
    expect(scheduleCall.text).toContain("max_attempts => 1");
    expect(scheduleCall.text).toContain("priority => 0");
    expect(scheduleCall.text).toContain("job_key_mode => 'preserve_run_at'");
    expect(scheduleCall.values).toEqual([
      { force: true, crawlKind: "sold" },
      "nettiauto:schedule:manual:sold",
    ]);
  });

  it("does not enqueue when the Graphile schema is unavailable", async () => {
    const calls: string[] = [];
    const sql = Object.assign(
      async (strings: TemplateStringsArray) => {
        calls.push(strings.join(""));
        return [{ relationName: null }];
      },
      { json: (value: unknown) => value },
    ) as unknown as SqlClient;

    await expect(createPostgresManualCrawlScheduler(sql).schedule("all")).resolves.toEqual({
      kind: "not_ready",
    });
    expect(calls).toHaveLength(1);
  });
});
