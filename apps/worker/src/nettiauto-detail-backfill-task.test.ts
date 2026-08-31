import type { WorkerConfig } from "@nettiauto/config";
import type { SqlClient } from "@nettiauto/db";
import type { AppLogger } from "@nettiauto/logging";
import type { AddJobFunction } from "graphile-worker";
import { describe, expect, it, vi } from "vitest";
import {
  detailBackfillDispatchCapacity,
  executeManagedDetailBackfillJob,
} from "./nettiauto-detail-backfill-task";

describe("managed Nettiauto detail backfill jobs", () => {
  it("retires legacy unbounded jobs without SQL, queue, or network work", async () => {
    const sql = vi.fn(() => {
      throw new Error("Legacy retirement must not query the database.");
    }) as unknown as SqlClient;
    const addJob = vi.fn() as unknown as AddJobFunction;
    const execute = vi.fn();

    await executeManagedDetailBackfillJob({
      sql,
      config: {} as WorkerConfig,
      logger: {} as AppLogger,
      addJob,
      command: {
        detailBackfillRunId: "cc1ab41a-c8eb-4c72-95de-1fa292a2e760",
        detailBackfillTargetListingId: null,
      },
      execute,
    });

    expect(sql).not.toHaveBeenCalled();
    expect(addJob).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("limits a circuit-breaker recovery to one probe", () => {
    expect(detailBackfillDispatchCapacity(200, 0, true)).toBe(1);
    expect(detailBackfillDispatchCapacity(200, 0, false)).toBe(200);
    expect(detailBackfillDispatchCapacity(200, 200, true)).toBe(0);
  });
});
