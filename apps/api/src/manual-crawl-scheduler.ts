import type { SqlClient } from "@nettiauto/db";

export type CrawlKindSelection = "all" | "current" | "sold";

export type ManualCrawlScheduleResult =
  | { kind: "scheduled"; jobId: string | null; runAt: string | null }
  | { kind: "not_ready" };

export interface ManualCrawlScheduler {
  schedule(crawlKind: CrawlKindSelection): Promise<ManualCrawlScheduleResult>;
}

export function createPostgresManualCrawlScheduler(sql: SqlClient): ManualCrawlScheduler {
  return {
    async schedule(crawlKind) {
      const [existsRow] = await sql<{ relationName: string | null }[]>`
        select to_regclass('graphile_worker.jobs')::text as "relationName"
      `;
      if (!existsRow?.relationName) {
        return { kind: "not_ready" };
      }

      const payload = crawlKind === "all" ? { force: true } : { force: true, crawlKind };
      const jobKey = `nettiauto:schedule:manual:${crawlKind}`;
      const [job] = await sql<{ jobId: string; runAt: string }[]>`
        select
          id::text as "jobId",
          run_at::text as "runAt"
        from graphile_worker.add_job(
          identifier => 'schedule_nettiauto_crawl',
          payload => ${sql.json(payload)}::json,
          queue_name => 'nettiauto',
          run_at => null::timestamptz,
          max_attempts => 1,
          job_key => ${jobKey},
          priority => 0,
          flags => null::text[],
          job_key_mode => 'preserve_run_at'
        )
      `;

      return {
        kind: "scheduled",
        jobId: job?.jobId ?? null,
        runAt: job?.runAt ?? null,
      };
    },
  };
}
