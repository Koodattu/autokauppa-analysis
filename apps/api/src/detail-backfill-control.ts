import type { SqlClient, TransactionSqlClient } from "@nettiauto/db";
import type { AppLogger } from "@nettiauto/logging";
import type { AdminDetailBackfillStatusResponse } from "@nettiauto/schemas";
import {
  CrawlerDisabledError,
  CrawlerPausedError,
  CrawlerSchedulerUnavailableError,
  type CrawlerState,
} from "./nettiauto-crawler-control";

const ACTIVE_RUN_STATUSES = [
  "planned",
  "running",
  "queued",
  "blocked",
  "paused",
  "cancelling",
] as const;

export type DetailBackfillAction = "pause" | "resume" | "cancel";

export class DetailBackfillAlreadyActiveError extends Error {
  constructor() {
    super("A Nettiauto detail backfill is already active.");
    this.name = "DetailBackfillAlreadyActiveError";
  }
}

export class DetailBackfillNotActiveError extends Error {
  constructor() {
    super("No active Nettiauto detail backfill was found.");
    this.name = "DetailBackfillNotActiveError";
  }
}

export interface DetailBackfillControl {
  observe(): Promise<AdminDetailBackfillStatusResponse>;
  start(): Promise<{
    task: "schedule_nettiauto_detail_backfill";
    jobId: string | null;
    runAt: string | null;
  }>;
  control(action: DetailBackfillAction): Promise<{
    action: DetailBackfillAction;
    runId: string;
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
        input.sql<Array<
          NonNullable<AdminDetailBackfillStatusResponse["latestRun"]>
          & { targetLedgerCount: number }
        >>`
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
            run.attempted_count as "attemptedCount",
            run.cancelled_count as "cancelledCount",
            run.blocked_until::text as "blockedUntil",
            run.block_reason as "blockReason",
            run.last_progress_at::text as "lastProgressAt",
            run.started_at::text as "startedAt",
            run.finished_at::text as "finishedAt",
            run.created_at::text as "createdAt",
            (select count(*)::int from detail_backfill_targets target
              where target.run_id = run.id) as "remainingCount",
            (select count(*)::int from detail_backfill_targets target
              where target.run_id = run.id and target.state = 'queued') as "queuedCount",
            (select count(*)::int from detail_backfill_targets target
              where target.run_id = run.id and target.state = 'pending') as "pendingCount",
            (select count(*)::int from detail_backfill_targets target
              where target.run_id = run.id) as "targetLedgerCount"
          from detail_backfill_runs run
          order by
            (run.status in ('planned', 'running', 'queued', 'blocked', 'paused', 'cancelling')) desc,
            run.created_at desc
          limit 1
        `,
        input.sql<{ relationName: string | null }[]>`
          select to_regclass('graphile_worker.jobs')::text as "relationName"
        `,
      ]);

      let schedulerQueued = false;
      let legacyJobCount = 0;
      if (workerSchema?.relationName) {
        const [[scheduler], [legacyJobs]] = await Promise.all([
          input.sql<{ queued: boolean }[]>`
            select exists (
              select 1
              from graphile_worker.jobs
              where task_identifier in (
                'schedule_nettiauto_detail_backfill',
                'cancel_nettiauto_detail_backfill'
              )
                and attempts < max_attempts
            ) as queued
          `,
          latestRun
            ? input.sql<{ count: number }[]>`
                select count(*)::int as count
                from graphile_worker.jobs
                where key is not null
                  and (
                    (
                      task_identifier = 'crawl_nettiauto_detail_page'
                      and key like ${`nettiauto:detail-backfill:${latestRun.id}:%`}
                    )
                    or (
                      task_identifier = 'schedule_nettiauto_detail_backfill'
                      and key like ${`nettiauto:detail-backfill-schedule:${latestRun.id}:%`}
                    )
                    or (
                      task_identifier = 'finalize_nettiauto_detail_backfill'
                      and key like ${`nettiauto:detail-backfill-finalize:${latestRun.id}%`}
                    )
                  )
              `
            : Promise.resolve([]),
        ]);
        schedulerQueued = scheduler?.queued ?? false;
        legacyJobCount = legacyJobs?.count ?? 0;
      }

      const normalizedRun = latestRun
        ? (() => {
            const { targetLedgerCount, ...publicRun } = latestRun;
            return {
              ...publicRun,
              remainingCount: targetLedgerCount > 0
                ? latestRun.remainingCount
                : Math.max(
                    0,
                    latestRun.targetCount
                      - latestRun.parsedCount
                      - latestRun.unavailableCount
                      - latestRun.failedCount
                      - latestRun.cancelledCount,
                  ),
              legacyJobCount,
              recoveryRequired:
                latestRun.status === "queued"
                && targetLedgerCount === 0
                && latestRun.targetCount > 0,
            };
        })()
        : null;

      return {
        active: schedulerQueued || isActiveRun(normalizedRun?.status),
        schedulerQueued,
        latestRun: normalizedRun,
      };
    },

    async start() {
      assertCrawlerAvailable(input.crawlerState);

      const receipt = await input.sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtext('nettiauto:detail-backfill:start'))`;
        await assertWorkerReady(tx);

        const [activeRun] = await tx<{ exists: boolean }[]>`
          select exists (
            select 1
            from detail_backfill_runs
            where status in ('planned', 'running', 'queued', 'blocked', 'paused', 'cancelling')
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

        return addControlJob(tx, "schedule_nettiauto_detail_backfill", {});
      });

      input.logger.info({ jobId: receipt.jobId }, "Nettiauto detail backfill scheduled by admin");
      return { task: "schedule_nettiauto_detail_backfill" as const, ...receipt };
    },

    async control(action) {
      if (action === "resume") {
        assertCrawlerAvailable(input.crawlerState);
      }

      const receipt = await input.sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtext('nettiauto:detail-backfill:control'))`;
        const [run] = await tx<{
          id: string;
          status: string;
          targetCount: number;
          targetLedgerCount: number;
          completedCount: number;
        }[]>`
          select run.id, run.status, run.target_count as "targetCount",
                 (run.succeeded_count + run.unavailable_count + run.failed_count
                   + run.cancelled_count)::int as "completedCount",
                 (select count(*)::int from detail_backfill_targets target
                   where target.run_id = run.id) as "targetLedgerCount"
          from detail_backfill_runs run
          where run.status in ('planned', 'running', 'queued', 'blocked', 'paused', 'cancelling')
          order by run.created_at desc
          limit 1
          for update
        `;
        if (!run) {
          throw new DetailBackfillNotActiveError();
        }

        if (action === "pause") {
          await tx`
            update detail_backfill_runs
            set status = 'paused', blocked_until = null,
                block_reason = 'operator_paused', updated_at = now()
            where id = ${run.id}
              and status in ('planned', 'running', 'queued', 'blocked')
          `;
          return { action, runId: run.id, jobId: null, runAt: null };
        }

        await assertWorkerReady(tx);

        if (action === "cancel") {
          await tx`
            update detail_backfill_runs
            set status = 'cancelling', blocked_until = null,
                block_reason = 'operator_cancelled', updated_at = now()
            where id = ${run.id} and status <> 'cancelling'
          `;
          const job = await addControlJob(
            tx,
            "cancel_nettiauto_detail_backfill",
            { runId: run.id },
          );
          return { action, runId: run.id, ...job };
        }

        const rebuildTargets =
          run.targetLedgerCount === 0 && run.targetCount > run.completedCount;
        const job = await addControlJob(
          tx,
          "schedule_nettiauto_detail_backfill",
          { runId: run.id, resume: true, rebuildTargets },
        );
        return { action, runId: run.id, ...job };
      });

      input.logger.info(
        { action, runId: receipt.runId, jobId: receipt.jobId },
        "Nettiauto detail backfill control updated by admin",
      );
      return receipt;
    },
  };
}

function assertCrawlerAvailable(crawlerState: Readonly<CrawlerState>) {
  if (!crawlerState.enabled) {
    throw new CrawlerDisabledError();
  }
  if (crawlerState.paused) {
    throw new CrawlerPausedError();
  }
}

async function assertWorkerReady(sql: SqlClient | TransactionSqlClient) {
  const [workerSchema] = await sql<{ relationName: string | null }[]>`
    select to_regclass('graphile_worker.jobs')::text as "relationName"
  `;
  if (!workerSchema?.relationName) {
    throw new CrawlerSchedulerUnavailableError();
  }
}

async function addControlJob(
  sql: SqlClient | TransactionSqlClient,
  task: "schedule_nettiauto_detail_backfill" | "cancel_nettiauto_detail_backfill",
  payload: Record<string, unknown>,
) {
  const runId = typeof payload.runId === "string" ? payload.runId : null;
  const jobKey = task === "cancel_nettiauto_detail_backfill"
    ? `nettiauto:control:detail-backfill-cancel:${runId}`
    : runId
      ? `nettiauto:control:detail-backfill-pump:${runId}`
      : "nettiauto:control:detail-backfill-start";
  const [job] = await sql<{ jobId: string; runAt: string }[]>`
    select id::text as "jobId", run_at::text as "runAt"
    from graphile_worker.add_job(
      identifier => ${task},
      payload => ${JSON.stringify(payload)}::json,
      queue_name => 'nettiauto-backfill-control',
      run_at => null::timestamptz,
      max_attempts => 5,
      job_key => ${jobKey},
      priority => 0,
      flags => null::text[],
      job_key_mode => 'replace'
    )
  `;
  return { jobId: job?.jobId ?? null, runAt: job?.runAt ?? null };
}

function isActiveRun(status: string | undefined) {
  return ACTIVE_RUN_STATUSES.some((activeStatus) => activeStatus === status);
}
