import type { JobHelpers, Task } from "graphile-worker";

const NETTIAUTO_QUEUE_NAME = "nettiauto";
const STALE_LOCK_AGE = "5 minutes";

type RecoveryHelpers = Pick<JobHelpers, "job" | "query">;

type StaleQueueLock = {
  workerId: string;
  lockedAt: Date;
};

export async function recoverStaleNettiautoQueueLocks(helpers: RecoveryHelpers) {
  const currentWorkerId = helpers.job.locked_by;
  if (!currentWorkerId) {
    throw new Error("Cannot recover Nettiauto queue locks without the current worker ID.");
  }

  const result = await helpers.query<StaleQueueLock>(
    `
      select locked_by as "workerId", min(locked_at) as "lockedAt"
      from graphile_worker.jobs
      where queue_name = $1
        and locked_by is not null
        and locked_by <> $2
        and locked_at < now() - $3::interval
      group by locked_by
    `,
    [NETTIAUTO_QUEUE_NAME, currentWorkerId, STALE_LOCK_AGE],
  );
  if (result.rows.length === 0) {
    return [];
  }

  const staleWorkerIds = result.rows.map((lock) => lock.workerId);
  await helpers.query(
    "select graphile_worker.force_unlock_workers($1::text[])",
    [staleWorkerIds],
  );
  return result.rows;
}

export const recoverNettiautoQueueLocksTask: Task = async (_payload, helpers) => {
  const recoveredLocks = await recoverStaleNettiautoQueueLocks(helpers);
  if (recoveredLocks.length > 0) {
    helpers.logger.warn("Recovered stale Nettiauto queue locks", {
      lockCount: recoveredLocks.length,
      oldestLockedAt: recoveredLocks.reduce(
        (oldest, lock) => lock.lockedAt < oldest ? lock.lockedAt : oldest,
        recoveredLocks[0]!.lockedAt,
      ),
    });
  }
};
