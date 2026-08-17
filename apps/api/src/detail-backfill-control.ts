import type { SqlClient } from "@nettiauto/db";
import type { AppLogger } from "@nettiauto/logging";
import type { AdminDetailBackfillStatusResponse } from "@nettiauto/schemas";
import {
  CrawlerDisabledError,
  CrawlerPausedError,
  CrawlerSchedulerUnavailableError,
  type CrawlerState,
} from "./nettiauto-crawler-control";

const ACTIVE_RUN_STATUSES = ["planned", "running", "queued"] as const;

export class DetailBackfillAlreadyActiveError extends Error {
  constructor() {
    super("A Nettiauto detail backfill is already active.");
    this.name = "DetailBackfillAlreadyActiveError";
  }
}

export interface DetailBackfillControl {
  observe(): Promise<AdminDetailBackfillStatusResponse>;
  start(): Promise<{
    task: "schedule_nettiauto_detail_backfill";
    jobId: string | null;
    runAt: string | null;
  }>;
}

export function createDetailBackfillControl(input: {
  sql: SqlClient;
  crawlerState: Readonly<CrawlerState>;
  logger: AppLogger;
}): DetailBackfillControl {
  return {
    async observe() {
      const [[latestRun], [workerSchema]] = await Promise.all([
        input.sql<NonNullable<AdminDetailBackfillStatusResponse["latestRun"]>[]>`
          select
            run.id,
            run.target_parser_version as "targetParserVersion",
            run.status,
            run.target_count as "targetCount",
            run.scheduled_count as "scheduledCount",
            greatest(
              run.succeeded_count,
              (
                select count(distinct record.source_listing_id)::int
                from raw_listing_records record
                where record.detail_backfill_run_id = run.id
                  and record.parser_status = 'parsed'
                  and record.parser_version = run.target_parser_version
              )
            )::int as "parsedCount",
            run.unavailable_count as "unavailableCount",
            run.failed_count as "failedCount",
            run.started_at::text as "startedAt",
            run.finished_at::text as "finishedAt",
            run.created_at::text as "createdAt"
          from detail_backfill_runs run
          order by
            (run.status in ('planned', 'running', 'queued')) desc,
            run.created_at desc
          limit 1
        `,
        input.sql<{ relationName: string | null }[]>`
          select to_regclass('graphile_worker.jobs')::text as "relationName"
        `,
      ]);
      const [scheduler] = workerSchema?.relationName
        ? await input.sql<{ queued: boolean }[]>`
            select exists (
              select 1
              from graphile_worker.jobs
              where task_identifier = 'schedule_nettiauto_detail_backfill'
                and attempts < max_attempts
            ) as queued
          `
        : [];
      const schedulerQueued = scheduler?.queued ?? false;
      return {
        active: schedulerQueued || isActiveRun(latestRun?.status),
        schedulerQueued,
        latestRun: latestRun ?? null,
      };
    },

    async start() {
      if (!input.crawlerState.enabled) {
        throw new CrawlerDisabledError();
      }
      if (input.crawlerState.paused) {
        throw new CrawlerPausedError();
      }

      const receipt = await input.sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtext('nettiauto:detail-backfill:start'))`;

        const [workerSchema] = await tx<{ relationName: string | null }[]>`
          select to_regclass('graphile_worker.jobs')::text as "relationName"
        `;
        if (!workerSchema?.relationName) {
          throw new CrawlerSchedulerUnavailableError();
        }

        const [activeRun] = await tx<{ exists: boolean }[]>`
          select exists (
            select 1
            from detail_backfill_runs
            where status in ('planned', 'running', 'queued')
          ) as "exists"
        `;
        const [queuedScheduler] = await tx<{ exists: boolean }[]>`
          select exists (
            select 1
            from graphile_worker.jobs
            where task_identifier = 'schedule_nettiauto_detail_backfill'
              and attempts < max_attempts
          ) as "exists"
        `;
        if (activeRun?.exists || queuedScheduler?.exists) {
          throw new DetailBackfillAlreadyActiveError();
        }

        const [job] = await tx<{ jobId: string; runAt: string }[]>`
          select
            id::text as "jobId",
            run_at::text as "runAt"
          from graphile_worker.add_job(
            identifier => 'schedule_nettiauto_detail_backfill',
            payload => '{}'::json,
            queue_name => 'nettiauto-backfill-control',
            run_at => null::timestamptz,
            max_attempts => 5,
            priority => 0,
            flags => null::text[]
          )
        `;
        return {
          task: "schedule_nettiauto_detail_backfill" as const,
          jobId: job?.jobId ?? null,
          runAt: job?.runAt ?? null,
        };
      });

      input.logger.info(
        { jobId: receipt.jobId },
        "Nettiauto missing/v1 detail backfill scheduled by admin",
      );
      return receipt;
    },
  };
}

function isActiveRun(status: string | undefined) {
  return ACTIVE_RUN_STATUSES.some((activeStatus) => activeStatus === status);
}
