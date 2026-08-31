import type { WorkerConfig } from "@nettiauto/config";
import { parseWorkerConfig } from "@nettiauto/config";
import {
  closeSqlClient,
  createSqlClient,
  type SqlClient,
  type TransactionSqlClient,
} from "@nettiauto/db";
import { NETTIAUTO_DETAIL_PARSER_VERSION } from "@nettiauto/domain";
import type { AppLogger } from "@nettiauto/logging";
import { createLogger } from "@nettiauto/logging";
import type { AddJobFunction, Task } from "graphile-worker";
import { z } from "zod";
import type { DetailPageOutcome } from "./nettiauto-crawl-execution";
import {
  NETTIAUTO_DETAIL_BACKFILL_MAX_ATTEMPTS,
  NETTIAUTO_DETAIL_PRIORITY_OFFSET,
  RetryableNettiautoFetchError,
} from "./nettiauto-fetch-policy";

type DetailBackfillTaskName =
  | "schedule_nettiauto_detail_backfill"
  | "finalize_nettiauto_detail_backfill"
  | "maintain_nettiauto_detail_backfills"
  | "cancel_nettiauto_detail_backfill";

const schedulePayloadSchema = z.object({
  runId: z.string().uuid().optional(),
  resume: z.boolean().optional().default(false),
  rebuildTargets: z.boolean().optional().default(false),
});
const runPayloadSchema = z.object({ runId: z.string().uuid() });
const CONTROL_QUEUE = "nettiauto-backfill-control";
const DETAIL_QUEUE = "nettiauto";
const MANAGED_DETAIL_JOB_MAX_ATTEMPTS = 1;
const CANCEL_BATCH_SIZE = 1_000;

type ManagedDetailCommand = {
  detailBackfillRunId: string;
  detailBackfillTargetListingId: string | null;
};

export function createNettiautoDetailBackfillTask(taskName: DetailBackfillTaskName): Task {
  return async (payload, helpers) => {
    const config = parseWorkerConfig();
    const logger = createLogger({ service: "worker", env: config.APP_ENV });
    const sql = createSqlClient(config.DATABASE_URL, 1);
    try {
      if (taskName === "maintain_nettiauto_detail_backfills") {
        await maintainDetailBackfills(sql, helpers.addJob);
        return;
      }

      if (taskName === "cancel_nettiauto_detail_backfill") {
        const command = runPayloadSchema.parse(payload);
        await cancelDetailBackfill(sql, command.runId, helpers.addJob, logger);
        return;
      }

      if (taskName === "finalize_nettiauto_detail_backfill") {
        const command = runPayloadSchema.parse(payload);
        await pumpDetailBackfill(sql, config, command.runId, helpers.addJob, logger);
        return;
      }

      if (!config.CRAWLER_ENABLED || config.CRAWLER_PAUSED) {
        logger.info(
          { task: taskName },
          "Nettiauto detail backfill scheduling skipped while crawler is disabled or paused",
        );
        return;
      }

      const command = schedulePayloadSchema.parse(payload ?? {});
      const createdRun = !command.runId;
      const runId = command.runId ?? await createDetailBackfillRun(sql);
      if (command.runId && command.resume) {
        await resumeDetailBackfill(sql, runId, command.rebuildTargets);
      }
      try {
        await pumpDetailBackfill(sql, config, runId, helpers.addJob, logger);
      } catch (error) {
        if (!createdRun) {
          throw error;
        }
        logger.error(
          { error, runId },
          "Initial Nettiauto detail backfill dispatch failed; maintenance will resume the run",
        );
      }
    } finally {
      await closeSqlClient(sql);
    }
  };
}

export async function executeManagedDetailBackfillJob(input: {
  sql: SqlClient;
  config: Readonly<WorkerConfig>;
  logger: AppLogger;
  addJob: AddJobFunction;
  command: ManagedDetailCommand;
  execute: () => Promise<DetailPageOutcome>;
}) {
  const { detailBackfillRunId: runId, detailBackfillTargetListingId: listingId } = input.command;

  // Jobs from the original unbounded implementation have no target ID. Retire them without
  // contacting Nettiauto so deploying this worker cannot unleash the existing ready backlog.
  if (!listingId) {
    return;
  }

  const [context] = await input.sql<{
    runStatus: string;
    targetState: string;
  }[]>`
    select run.status as "runStatus", target.state as "targetState"
    from detail_backfill_targets target
    join detail_backfill_runs run on run.id = target.run_id
    where target.run_id = ${runId}
      and target.listing_id = ${listingId}
    limit 1
  `;
  if (!context || context.targetState !== "queued") {
    return;
  }

  if (context.runStatus !== "running") {
    if (["planned", "blocked", "paused", "queued"].includes(context.runStatus)) {
      await releaseTarget(input.sql, runId, listingId);
    }
    return;
  }

  let outcome: DetailPageOutcome;
  try {
    outcome = await input.execute();
  } catch (error) {
    const failureReason = error instanceof RetryableNettiautoFetchError
      ? error.failureReason
      : error instanceof Error
        ? error.message
        : "unknown_error";
    const nextAttemptAt = await retryOrFailTarget(input.sql, runId, listingId, failureReason);
    await queuePump(input.addJob, runId, nextAttemptAt ?? undefined);
    return;
  }

  if (outcome.kind === "stopped") {
    if (outcome.blockedUntil) {
      await blockDetailBackfill(
        input.sql,
        runId,
        listingId,
        outcome.failureReason,
        outcome.blockedUntil,
      );
      await removeAllMatchingBackfillJobs(input.sql, runId, "managed");
      await queuePump(input.addJob, runId, new Date(outcome.blockedUntil));
      input.logger.warn(
        { runId, blockedUntil: outcome.blockedUntil, failureReason: outcome.failureReason },
        "Nettiauto detail backfill circuit breaker opened",
      );
      return;
    }

    if (["crawler_disabled", "crawler_paused"].includes(outcome.failureReason)) {
      await pauseDetailBackfill(input.sql, runId, listingId, outcome.failureReason);
      return;
    }

    await finishTarget(input.sql, runId, listingId, "failed");
    await queuePump(input.addJob, runId);
    return;
  }

  if (outcome.kind === "skipped") {
    if (outcome.reason === "already_current") {
      await finishTarget(input.sql, runId, listingId, "succeeded");
    } else {
      await releaseTarget(input.sql, runId, listingId);
    }
    await queuePump(input.addJob, runId);
    return;
  }

  await finishTarget(
    input.sql,
    runId,
    listingId,
    outcome.outcome === "parsed" ? "succeeded" : outcome.outcome,
  );
  await queuePump(input.addJob, runId);
}

async function createDetailBackfillRun(sql: SqlClient) {
  return sql.begin(async (tx) => {
    const [run] = await tx<{ id: string }[]>`
      insert into detail_backfill_runs (
        source,
        target_parser_version,
        selection,
        status,
        notes
      )
      values (
        'nettiauto',
        ${NETTIAUTO_DETAIL_PARSER_VERSION},
        'missing_or_v1',
        'planned',
        'Bounded network refetch with an application-owned target ledger and circuit breaker.'
      )
      returning id
    `;
    if (!run) {
      throw new Error("Failed to create Nettiauto detail backfill run.");
    }
    await seedDetailBackfillTargets(tx, run.id);
    return run.id;
  });
}

async function resumeDetailBackfill(sql: SqlClient, runId: string, rebuildTargets: boolean) {
  if (rebuildTargets) {
    await sql.begin((tx) => seedDetailBackfillTargets(tx, runId));
    return;
  }

  await sql`
    update detail_backfill_runs
    set
      status = 'running',
      blocked_until = null,
      block_reason = null,
      next_dispatch_at = now(),
      started_at = coalesce(started_at, now()),
      updated_at = now()
    where id = ${runId}
      and status in ('planned', 'blocked', 'paused')
  `;
}

async function seedDetailBackfillTargets(
  sql: SqlClient | TransactionSqlClient,
  runId: string,
) {
  const [seedableRun] = await sql<{ id: string }[]>`
    select id
    from detail_backfill_runs
    where id = ${runId} and status in ('planned', 'queued', 'blocked', 'paused')
    limit 1
  `;
  if (!seedableRun) {
    return;
  }

  const [counts] = await sql<{ targetCount: number; unavailableCount: number }[]>`
    select
      count(*)::int as "targetCount",
      count(*) filter (where
        listing.canonical_source_url is null
        or listing.canonical_source_url !~ '^https://www\\.nettiauto\\.com/'
        or not exists (
          select 1
          from listing_sightings sighting
          join source_search_queries source_query on source_query.id = sighting.search_query_id
          where sighting.listing_id = listing.id
            and source_query.source = 'nettiauto'
            and source_query.enabled = true
        )
      )::int as "unavailableCount"
    from listings listing
    where listing.source = 'nettiauto'
      and not exists (
        select 1
        from raw_listing_records detail_record
        where detail_record.source = listing.source
          and detail_record.source_listing_id = listing.source_listing_id
          and detail_record.record_kind = 'detail_page'
          and detail_record.parser_status = 'parsed'
          and detail_record.parser_version <> 'nettiauto-detail-v1'
      )
  `;

  await sql`delete from detail_backfill_targets where run_id = ${runId}`;
  await sql`
    insert into detail_backfill_targets (run_id, listing_id)
    select ${runId}, listing.id
    from listings listing
    where listing.source = 'nettiauto'
      and listing.canonical_source_url ~ '^https://www\\.nettiauto\\.com/'
      and exists (
        select 1
        from listing_sightings sighting
        join source_search_queries source_query on source_query.id = sighting.search_query_id
        where sighting.listing_id = listing.id
          and source_query.source = 'nettiauto'
          and source_query.enabled = true
      )
      and not exists (
        select 1
        from raw_listing_records detail_record
        where detail_record.source = listing.source
          and detail_record.source_listing_id = listing.source_listing_id
          and detail_record.record_kind = 'detail_page'
          and detail_record.parser_status = 'parsed'
          and detail_record.parser_version <> 'nettiauto-detail-v1'
      )
    on conflict do nothing
  `;
  await sql`
    update detail_backfill_runs
    set
      status = 'running',
      target_count = ${counts?.targetCount ?? 0},
      scheduled_count = 0,
      succeeded_count = 0,
      unavailable_count = ${counts?.unavailableCount ?? 0},
      failed_count = 0,
      attempted_count = 0,
      cancelled_count = 0,
      blocked_until = null,
      block_reason = null,
      next_dispatch_at = now(),
      last_progress_at = null,
      cancelled_at = null,
      started_at = now(),
      finished_at = null,
      updated_at = now()
    where id = ${runId} and status in ('planned', 'queued', 'blocked', 'paused')
  `;
}

async function pumpDetailBackfill(
  sql: SqlClient,
  config: Readonly<WorkerConfig>,
  runId: string,
  addJob: AddJobFunction,
  logger: AppLogger,
) {
  const [run] = await sql<{
    status: string;
    blockedUntil: string | null;
    nextDispatchAt: string | null;
  }[]>`
    select status, blocked_until::text as "blockedUntil",
           next_dispatch_at::text as "nextDispatchAt"
    from detail_backfill_runs
    where id = ${runId}
    limit 1
  `;
  if (!run || ["completed", "partial", "cancelled", "cancelling", "paused"].includes(run.status)) {
    return;
  }

  const [ledger] = await sql<{ totalCount: number; queuedCount: number }[]>`
    select count(*)::int as "totalCount",
           count(*) filter (where state = 'queued')::int as "queuedCount"
    from detail_backfill_targets
    where run_id = ${runId}
  `;
  if ((ledger?.totalCount ?? 0) === 0 && run.status === "queued") {
    return;
  }

  let probeOnly = false;
  if (run.status === "blocked") {
    const blockedUntil = run.blockedUntil ? new Date(run.blockedUntil) : null;
    if (!blockedUntil || blockedUntil.getTime() > Date.now()) {
      if (blockedUntil) {
        await queuePump(addJob, runId, blockedUntil);
      }
      return;
    }
    await sql`
      update detail_backfill_runs
      set status = 'running', blocked_until = null, block_reason = null,
          next_dispatch_at = now(), updated_at = now()
      where id = ${runId} and status = 'blocked'
    `;
    probeOnly = true;
  }

  const retiredLegacyJobs = await removeBackfillJobs(sql, runId, "legacy");
  if (retiredLegacyJobs > 0) {
    await queuePump(addJob, runId);
    return;
  }

  const staleBefore = new Date(
    Date.now() - Math.max(
      15 * 60_000,
      config.DETAIL_BACKFILL_BATCH_SIZE * config.CRAWLER_DELAY_MS + 10 * 60_000,
    ),
  );
  await sql`
    update detail_backfill_targets target
    set state = 'pending', updated_at = now(), last_error = 'stale_dispatch_recovered'
    where target.run_id = ${runId}
      and target.state = 'queued'
      and target.updated_at < ${staleBefore}
      and not exists (
        select 1
        from graphile_worker.jobs job
        where job.key = 'nettiauto:detail-backfill:target:'
          || target.run_id::text || ':' || target.listing_id::text
          and (job.attempts < job.max_attempts or job.locked_at is not null)
      )
  `;

  await sql`
    with removed as (
      delete from detail_backfill_targets target
      where target.run_id = ${runId}
        and not exists (
          select 1
          from listing_sightings sighting
          join source_search_queries source_query on source_query.id = sighting.search_query_id
          where sighting.listing_id = target.listing_id
            and source_query.source = 'nettiauto'
            and source_query.enabled = true
        )
      returning 1
    ), removed_count as (
      select count(*)::int as count from removed
    )
    update detail_backfill_runs run
    set unavailable_count = unavailable_count + removed_count.count,
        last_progress_at = case when removed_count.count > 0 then now() else last_progress_at end,
        updated_at = case when removed_count.count > 0 then now() else updated_at end
    from removed_count
    where run.id = ${runId}
  `;

  const [counts] = await sql<{
    totalCount: number;
    queuedCount: number;
    nextAttemptAt: string | null;
  }[]>`
    select count(*)::int as "totalCount",
           count(*) filter (where state = 'queued')::int as "queuedCount",
           min(next_attempt_at)::text as "nextAttemptAt"
    from detail_backfill_targets
    where run_id = ${runId}
  `;
  if ((counts?.totalCount ?? 0) === 0) {
    await finalizeDetailBackfill(sql, runId, logger);
    return;
  }

  const capacity = detailBackfillDispatchCapacity(
    config.DETAIL_BACKFILL_BATCH_SIZE,
    counts?.queuedCount ?? 0,
    probeOnly,
  );
  if (capacity === 0) {
    return;
  }

  const candidates = await sql<{
    listingId: string;
    sourceListingId: string;
    sourceUrl: string;
    searchQueryId: string;
    priority: number;
  }[]>`
    select
      target.listing_id as "listingId",
      listing.source_listing_id as "sourceListingId",
      listing.canonical_source_url as "sourceUrl",
      latest_sighting.search_query_id as "searchQueryId",
      latest_sighting.priority
    from detail_backfill_targets target
    join listings listing on listing.id = target.listing_id
    join lateral (
      select sighting.search_query_id, source_query.priority
      from listing_sightings sighting
      join source_search_queries source_query on source_query.id = sighting.search_query_id
      where sighting.listing_id = listing.id
        and source_query.source = 'nettiauto'
        and source_query.enabled = true
      order by sighting.seen_at desc
      limit 1
    ) latest_sighting on true
    where target.run_id = ${runId}
      and target.state = 'pending'
      and (target.next_attempt_at is null or target.next_attempt_at <= now())
    order by target.listing_id
    limit ${capacity}
  `;

  if (candidates.length === 0) {
    const nextAttemptAt = counts?.nextAttemptAt ? new Date(counts.nextAttemptAt) : null;
    if (nextAttemptAt && nextAttemptAt.getTime() > Date.now()) {
      await queuePump(addJob, runId, nextAttemptAt);
    }
    return;
  }

  const baseDispatchAt = Math.max(
    Date.now(),
    run.nextDispatchAt ? new Date(run.nextDispatchAt).getTime() : Date.now(),
  );
  let scheduledCount = 0;
  let finalDispatchAt = baseDispatchAt;
  for (const candidate of candidates) {
    const [claimed] = await sql<{ listingId: string }[]>`
      update detail_backfill_targets
      set state = 'queued', updated_at = now(), last_error = null
      where run_id = ${runId}
        and listing_id = ${candidate.listingId}
        and state = 'pending'
        and exists (
          select 1 from detail_backfill_runs run
          where run.id = ${runId} and run.status = 'running'
        )
      returning listing_id as "listingId"
    `;
    if (!claimed) {
      continue;
    }

    finalDispatchAt = baseDispatchAt + (scheduledCount + 1) * config.CRAWLER_DELAY_MS;
    try {
      await addJob(
        "crawl_nettiauto_detail_page",
        {
          crawlRunId: null,
          detailBackfillRunId: runId,
          detailBackfillTargetListingId: candidate.listingId,
          searchQueryId: candidate.searchQueryId,
          sourceListingId: candidate.sourceListingId,
          sourceUrl: candidate.sourceUrl,
          force: true,
        },
        {
          queueName: DETAIL_QUEUE,
          maxAttempts: MANAGED_DETAIL_JOB_MAX_ATTEMPTS,
          jobKey: `nettiauto:detail-backfill:target:${runId}:${candidate.listingId}`,
          jobKeyMode: "replace",
          priority: candidate.priority + NETTIAUTO_DETAIL_PRIORITY_OFFSET,
          runAt: new Date(finalDispatchAt),
        },
      );
      scheduledCount += 1;
    } catch (error) {
      await releaseTarget(sql, runId, candidate.listingId, "dispatch_failed");
      throw error;
    }
  }

  if (scheduledCount > 0) {
    await sql`
      update detail_backfill_runs
      set scheduled_count = scheduled_count + ${scheduledCount},
          next_dispatch_at = ${new Date(finalDispatchAt)},
          started_at = coalesce(started_at, now()),
          updated_at = now()
      where id = ${runId} and status = 'running'
    `;
  }
}

async function finishTarget(
  sql: SqlClient,
  runId: string,
  listingId: string,
  outcome: "succeeded" | "unavailable" | "failed",
) {
  await sql.begin(async (tx) => {
    const [removed] = await tx<{ listingId: string }[]>`
      delete from detail_backfill_targets
      where run_id = ${runId} and listing_id = ${listingId}
      returning listing_id as "listingId"
    `;
    if (!removed) {
      return;
    }
    await tx`
      update detail_backfill_runs
      set
        succeeded_count = succeeded_count + ${outcome === "succeeded" ? 1 : 0},
        unavailable_count = unavailable_count + ${outcome === "unavailable" ? 1 : 0},
        failed_count = failed_count + ${outcome === "failed" ? 1 : 0},
        attempted_count = attempted_count + 1,
        last_progress_at = now(),
        updated_at = now()
      where id = ${runId}
    `;
  });
}

async function retryOrFailTarget(
  sql: SqlClient,
  runId: string,
  listingId: string,
  failureReason: string,
) {
  return sql.begin(async (tx) => {
    const [target] = await tx<{ attemptCount: number }[]>`
      select attempt_count as "attemptCount"
      from detail_backfill_targets
      where run_id = ${runId} and listing_id = ${listingId}
      for update
    `;
    if (!target) {
      return null;
    }
    const attemptCount = target.attemptCount + 1;
    if (attemptCount >= NETTIAUTO_DETAIL_BACKFILL_MAX_ATTEMPTS) {
      await tx`
        delete from detail_backfill_targets
        where run_id = ${runId} and listing_id = ${listingId}
      `;
      await tx`
        update detail_backfill_runs
        set failed_count = failed_count + 1,
            attempted_count = attempted_count + 1,
            last_progress_at = now(), updated_at = now()
        where id = ${runId}
      `;
      return null;
    }

    const retryDelayMs = Math.min(60 * 60_000, 60_000 * 2 ** (attemptCount - 1));
    const nextAttemptAt = new Date(Date.now() + retryDelayMs);
    await tx`
      update detail_backfill_targets
      set state = 'pending', attempt_count = ${attemptCount},
          next_attempt_at = ${nextAttemptAt}, last_error = ${failureReason}, updated_at = now()
      where run_id = ${runId} and listing_id = ${listingId}
    `;
    await tx`
      update detail_backfill_runs
      set attempted_count = attempted_count + 1, updated_at = now()
      where id = ${runId}
    `;
    return nextAttemptAt;
  });
}

async function blockDetailBackfill(
  sql: SqlClient,
  runId: string,
  listingId: string,
  failureReason: string,
  blockedUntil: string,
) {
  await sql.begin(async (tx) => {
    await tx`
      update detail_backfill_targets
      set state = 'pending', next_attempt_at = null,
          last_error = case
            when listing_id = ${listingId} then ${failureReason}
            else last_error
          end,
          updated_at = now()
      where run_id = ${runId} and state = 'queued'
    `;
    await tx`
      update detail_backfill_runs
      set status = 'blocked', blocked_until = ${new Date(blockedUntil)},
          block_reason = ${failureReason}, attempted_count = attempted_count + 1,
          updated_at = now()
      where id = ${runId}
        and status not in ('cancelling', 'cancelled', 'completed', 'partial')
    `;
  });
}

async function pauseDetailBackfill(
  sql: SqlClient,
  runId: string,
  listingId: string,
  reason: string,
) {
  await sql.begin(async (tx) => {
    await tx`
      update detail_backfill_targets
      set state = 'pending', last_error = ${reason}, updated_at = now()
      where run_id = ${runId} and listing_id = ${listingId}
    `;
    await tx`
      update detail_backfill_runs
      set status = 'paused', blocked_until = null, block_reason = ${reason}, updated_at = now()
      where id = ${runId}
        and status not in ('cancelling', 'cancelled', 'completed', 'partial')
    `;
  });
}

async function releaseTarget(
  sql: SqlClient,
  runId: string,
  listingId: string,
  reason: string | null = null,
) {
  await sql`
    update detail_backfill_targets
    set state = 'pending', last_error = ${reason}, updated_at = now()
    where run_id = ${runId} and listing_id = ${listingId}
  `;
}

async function finalizeDetailBackfill(sql: SqlClient, runId: string, logger: AppLogger) {
  const [run] = await sql<{ failedCount: number }[]>`
    update detail_backfill_runs
    set status = case when failed_count = 0 then 'completed' else 'partial' end,
        finished_at = now(), blocked_until = null, block_reason = null, updated_at = now()
    where id = ${runId}
      and status in ('planned', 'running', 'blocked')
      and not exists (select 1 from detail_backfill_targets where run_id = ${runId})
    returning failed_count as "failedCount"
  `;
  if (run) {
    logger.info({ runId, failedCount: run.failedCount }, "Nettiauto detail backfill finished");
  }
}

async function maintainDetailBackfills(
  sql: SqlClient,
  addJob: AddJobFunction,
) {
  const runs = await sql<{ id: string; status: string; blockedUntil: string | null }[]>`
    select id, status, blocked_until::text as "blockedUntil"
    from detail_backfill_runs
    where status in ('planned', 'running', 'blocked', 'cancelling')
    order by created_at
  `;
  for (const run of runs) {
    if (run.status === "cancelling") {
      await queueCancel(addJob, run.id);
    } else {
      await queuePump(
        addJob,
        run.id,
        run.status === "blocked" && run.blockedUntil
          ? new Date(run.blockedUntil)
          : undefined,
      );
    }
  }
}

async function cancelDetailBackfill(
  sql: SqlClient,
  runId: string,
  addJob: AddJobFunction,
  logger: AppLogger,
) {
  const removedJobCount = await removeBackfillJobs(sql, runId, "all");

  if (removedJobCount === CANCEL_BATCH_SIZE) {
    await queueCancel(addJob, runId);
    return;
  }

  const [targets] = await sql<{ count: number }[]>`
    with removed as (
      delete from detail_backfill_targets where run_id = ${runId} returning 1
    )
    select count(*)::int as count from removed
  `;
  await sql`
    update detail_backfill_runs
    set status = 'cancelled',
        cancelled_count = cancelled_count + ${targets?.count ?? 0},
        cancelled_at = now(), finished_at = now(), blocked_until = null,
        block_reason = 'operator_cancelled', updated_at = now()
    where id = ${runId} and status = 'cancelling'
  `;
  logger.info(
    { runId, cancelledTargetCount: targets?.count ?? 0 },
    "Nettiauto detail backfill cancelled",
  );
}

type BackfillJobScope = "legacy" | "managed" | "all";

async function removeAllMatchingBackfillJobs(
  sql: SqlClient,
  runId: string,
  scope: BackfillJobScope,
) {
  let removedCandidateCount: number;
  do {
    removedCandidateCount = await removeBackfillJobs(sql, runId, scope);
  } while (removedCandidateCount === CANCEL_BATCH_SIZE);
}

async function removeBackfillJobs(sql: SqlClient, runId: string, scope: BackfillJobScope) {
  const jobs = await sql<{ removedId: string | null }[]>`
    with keys as materialized (
      select key
      from graphile_worker.jobs
      where key is not null
        and (
          (
            ${scope !== "managed"}
            and task_identifier = 'crawl_nettiauto_detail_page'
            and key like ${`nettiauto:detail-backfill:${runId}:%`}
          )
          or (
            ${scope !== "legacy"}
            and task_identifier = 'crawl_nettiauto_detail_page'
            and key like ${`nettiauto:detail-backfill:target:${runId}:%`}
          )
          or (
            ${scope !== "managed"}
            and task_identifier = 'schedule_nettiauto_detail_backfill'
            and key like ${`nettiauto:detail-backfill-schedule:${runId}:%`}
          )
          or (
            ${scope !== "managed"}
            and task_identifier = 'finalize_nettiauto_detail_backfill'
            and key like ${`nettiauto:detail-backfill-finalize:${runId}%`}
          )
          or (
            ${scope === "all"}
            and task_identifier = 'schedule_nettiauto_detail_backfill'
            and key = ${`nettiauto:control:detail-backfill-pump:${runId}`}
          )
        )
      order by id
      limit ${CANCEL_BATCH_SIZE}
    )
    select (graphile_worker.remove_job(key)).id::text as "removedId"
    from keys
  `;
  return jobs.length;
}

async function queuePump(addJob: AddJobFunction, runId: string, runAt?: Date) {
  await addJob(
    "schedule_nettiauto_detail_backfill",
    { runId },
    {
      queueName: CONTROL_QUEUE,
      maxAttempts: 5,
      jobKey: `nettiauto:control:detail-backfill-pump:${runId}`,
      jobKeyMode: "replace",
      runAt,
    },
  );
}

async function queueCancel(addJob: AddJobFunction, runId: string) {
  await addJob(
    "cancel_nettiauto_detail_backfill",
    { runId },
    {
      queueName: CONTROL_QUEUE,
      maxAttempts: 5,
      jobKey: `nettiauto:control:detail-backfill-cancel:${runId}`,
      jobKeyMode: "replace",
    },
  );
}

export function detailBackfillDispatchCapacity(
  batchSize: number,
  queuedCount: number,
  probeOnly: boolean,
) {
  return Math.min(
    probeOnly ? 1 : batchSize,
    Math.max(0, batchSize - queuedCount),
  );
}
