import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations, type Job, type JobHelpers } from "graphile-worker";
import { recoverStaleNettiautoQueueLocks } from "./nettiauto-queue-lock-recovery";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = testDatabaseUrl ? describe : describe.skip;

describeDatabase("Nettiauto queue lock recovery", () => {
  if (!testDatabaseUrl) {
    return;
  }

  const databaseName = new URL(testDatabaseUrl).pathname.slice(1);
  if (!databaseName.includes("test")) {
    throw new Error("Integration tests require a database name containing 'test'.");
  }

  const client = new Client({ connectionString: testDatabaseUrl });

  beforeAll(async () => {
    await runMigrations({ connectionString: testDatabaseUrl });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it("preserves a recent lock and releases it after the stale threshold", async () => {
    const jobKey = `nettiauto-lock-recovery-test-${randomUUID()}`;
    const staleWorkerId = `stale-worker-${randomUUID()}`;
    await client.query("begin");
    try {
      const added = await client.query<{ id: string }>(
        `
          select (graphile_worker.add_job(
            'crawl_nettiauto_detail_page',
            '{}'::json,
            queue_name := 'nettiauto',
            job_key := $1
          )).id::text as id
        `,
        [jobKey],
      );
      const jobId = added.rows[0]!.id;
      await client.query(
        `
          update graphile_worker._private_jobs
          set locked_by = $2, locked_at = now() - interval '4 minutes'
          where id = $1
        `,
        [jobId, staleWorkerId],
      );
      await client.query(
        `
          update graphile_worker._private_job_queues queue
          set locked_by = $2, locked_at = now() - interval '4 minutes'
          from graphile_worker._private_jobs job
          where job.id = $1 and queue.id = job.job_queue_id
        `,
        [jobId, staleWorkerId],
      );

      const helpers = {
        job: { locked_by: "current-worker" } as Job,
        query: client.query.bind(client) as JobHelpers["query"],
      };
      await expect(recoverStaleNettiautoQueueLocks(helpers)).resolves.toEqual([]);

      await client.query(
        `
          update graphile_worker._private_jobs
          set locked_at = now() - interval '6 minutes'
          where id = $1
        `,
        [jobId],
      );
      await client.query(
        `
          update graphile_worker._private_job_queues queue
          set locked_at = now() - interval '6 minutes'
          from graphile_worker._private_jobs job
          where job.id = $1 and queue.id = job.job_queue_id
        `,
        [jobId],
      );

      const recovered = await recoverStaleNettiautoQueueLocks(helpers);
      expect(recovered.map((lock) => lock.workerId)).toEqual([staleWorkerId]);

      const locks = await client.query<{
        jobLockedBy: string | null;
        queueLockedBy: string | null;
      }>(
        `
          select job.locked_by as "jobLockedBy", queue.locked_by as "queueLockedBy"
          from graphile_worker._private_jobs job
          join graphile_worker._private_job_queues queue on queue.id = job.job_queue_id
          where job.id = $1
        `,
        [jobId],
      );
      expect(locks.rows[0]).toEqual({ jobLockedBy: null, queueLockedBy: null });
    } finally {
      await client.query("rollback");
    }
  });
});
