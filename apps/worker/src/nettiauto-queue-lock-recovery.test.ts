import type { Job, JobHelpers } from "graphile-worker";
import { describe, expect, it, vi } from "vitest";
import { recoverStaleNettiautoQueueLocks } from "./nettiauto-queue-lock-recovery";

function createHelpers(query: JobHelpers["query"], workerId = "current-worker") {
  return {
    job: { locked_by: workerId } as Job,
    query,
  };
}

describe("recoverStaleNettiautoQueueLocks", () => {
  it("uses the official Graphile function to unlock stale workers", async () => {
    const lockedAt = new Date("2026-09-01T12:00:00Z");
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [
          { workerId: "stale-worker-a", lockedAt },
          { workerId: "stale-worker-b", lockedAt },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) as unknown as JobHelpers["query"];

    const recovered = await recoverStaleNettiautoQueueLocks(createHelpers(query));

    expect(recovered).toHaveLength(2);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("locked_by <> $2"),
      ["nettiauto", "current-worker", "5 minutes"],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      "select graphile_worker.force_unlock_workers($1::text[])",
      [["stale-worker-a", "stale-worker-b"]],
    );
  });

  it("does nothing when there are no stale workers", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] }) as unknown as JobHelpers["query"];

    await expect(recoverStaleNettiautoQueueLocks(createHelpers(query))).resolves.toEqual([]);

    expect(query).toHaveBeenCalledOnce();
  });

  it("refuses to recover locks without the current worker ID", async () => {
    const query = vi.fn() as unknown as JobHelpers["query"];

    await expect(
      recoverStaleNettiautoQueueLocks(createHelpers(query, "")),
    ).rejects.toThrow("current worker ID");
    expect(query).not.toHaveBeenCalled();
  });
});
