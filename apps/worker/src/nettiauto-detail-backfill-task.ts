import { parseWorkerConfig } from "@nettiauto/config";
import { closeSqlClient, createSqlClient } from "@nettiauto/db";
import { NETTIAUTO_DETAIL_PARSER_VERSION } from "@nettiauto/domain";
import { createLogger } from "@nettiauto/logging";
import type { AddJobFunction, Task } from "graphile-worker";
import { z } from "zod";
import {
  NETTIAUTO_DETAIL_BACKFILL_MAX_ATTEMPTS,
  NETTIAUTO_DETAIL_PRIORITY_OFFSET,
} from "./nettiauto-fetch-policy";

type DetailBackfillTaskName =
  | "schedule_nettiauto_detail_backfill"
  | "finalize_nettiauto_detail_backfill";

const schedulePayloadSchema = z.object({
  runId: z.string().uuid().optional(),
  afterListingId: z.string().uuid().optional(),
});

const finalizePayloadSchema = z.object({ runId: z.string().uuid() });

export function createNettiautoDetailBackfillTask(taskName: DetailBackfillTaskName): Task {
  return async (payload, helpers) => {
    const config = parseWorkerConfig();
    const logger = createLogger({ service: "worker", env: config.APP_ENV });
    if (
      taskName !== "finalize_nettiauto_detail_backfill"
      && (!config.CRAWLER_ENABLED || config.CRAWLER_PAUSED)
    ) {
      logger.info({ task: taskName }, "Nettiauto detail backfill skipped while crawler is disabled or paused");
      return;
    }

    const sql = createSqlClient(config.DATABASE_URL, 1);
    try {
      if (taskName === "finalize_nettiauto_detail_backfill") {
        const command = finalizePayloadSchema.parse(payload);
        await finalizeDetailBackfill(sql, command.runId, helpers.addJob);
        return;
      }

      const command = schedulePayloadSchema.parse(payload ?? {});
      const runId = command.runId ?? await createDetailBackfillRun(sql);
      const [run] = await sql<{ scheduledCount: number; status: string }[]>`
        select scheduled_count as "scheduledCount", status
        from detail_backfill_runs
        where id = ${runId}
      `;
      if (!run || !["planned", "running"].includes(run.status)) {
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
          listing.id as "listingId",
          listing.source_listing_id as "sourceListingId",
          listing.canonical_source_url as "sourceUrl",
          latest_sighting.search_query_id as "searchQueryId",
          latest_sighting.priority
        from listings listing
        join lateral (
          select sighting.search_query_id, source_query.priority
          from listing_sightings sighting
          join source_search_queries source_query on source_query.id = sighting.search_query_id
          where sighting.listing_id = listing.id
            and source_query.source = 'nettiauto'
          order by sighting.seen_at desc
          limit 1
        ) latest_sighting on true
        where listing.source = 'nettiauto'
          and listing.id > coalesce(
            ${command.afterListingId ?? null}::uuid,
            '00000000-0000-0000-0000-000000000000'::uuid
          )
          and listing.canonical_source_url ~ '^https://www\\.nettiauto\\.com/'
          and not exists (
            select 1
            from raw_listing_records detail_record
            where detail_record.source = listing.source
              and detail_record.source_listing_id = listing.source_listing_id
              and detail_record.record_kind = 'detail_page'
              and detail_record.parser_status = 'parsed'
              and detail_record.parser_version <> 'nettiauto-detail-v1'
          )
        order by listing.id
        limit ${config.DETAIL_BACKFILL_BATCH_SIZE}
      `;

      for (const [index, candidate] of candidates.entries()) {
        await helpers.addJob(
          "crawl_nettiauto_detail_page",
          {
            crawlRunId: null,
            detailBackfillRunId: runId,
            searchQueryId: candidate.searchQueryId,
            sourceListingId: candidate.sourceListingId,
            sourceUrl: candidate.sourceUrl,
            force: true,
          },
          {
            queueName: "nettiauto",
            maxAttempts: NETTIAUTO_DETAIL_BACKFILL_MAX_ATTEMPTS,
            jobKey: `nettiauto:detail-backfill:${runId}:${candidate.sourceListingId}`,
            jobKeyMode: "preserve_run_at",
            priority: candidate.priority + NETTIAUTO_DETAIL_PRIORITY_OFFSET,
            runAt: new Date(
              Date.now() + (run.scheduledCount + index) * config.CRAWLER_DELAY_MS,
            ),
          },
        );
      }

      await sql`
        update detail_backfill_runs
        set
          status = 'running',
          started_at = coalesce(started_at, now()),
          scheduled_count = scheduled_count + ${candidates.length},
          updated_at = now()
        where id = ${runId}
      `;

      const lastCandidate = candidates.at(-1);
      if (candidates.length === config.DETAIL_BACKFILL_BATCH_SIZE && lastCandidate) {
        await helpers.addJob(
          "schedule_nettiauto_detail_backfill",
          { runId, afterListingId: lastCandidate.listingId },
          {
            queueName: "nettiauto-backfill-control",
            maxAttempts: 5,
            jobKey: `nettiauto:detail-backfill-schedule:${runId}:${lastCandidate.listingId}`,
          },
        );
        return;
      }

      const [completedScheduling] = await sql<{ scheduledCount: number }[]>`
        update detail_backfill_runs
        set status = 'queued', updated_at = now()
        where id = ${runId}
        returning scheduled_count as "scheduledCount"
      `;
      const scheduledCount = completedScheduling?.scheduledCount ?? run.scheduledCount;
      await helpers.addJob(
        "finalize_nettiauto_detail_backfill",
        { runId },
        {
          queueName: "nettiauto-backfill-control",
          maxAttempts: 5,
          jobKey: `nettiauto:detail-backfill-finalize:${runId}`,
          runAt: new Date(
            Date.now() + scheduledCount * config.CRAWLER_DELAY_MS + 60 * 60 * 1_000,
          ),
        },
      );
      logger.info(
        { runId, scheduledCount, parserVersion: NETTIAUTO_DETAIL_PARSER_VERSION },
        "Nettiauto detail backfill queued",
      );
    } finally {
      await closeSqlClient(sql);
    }
  };
}

async function createDetailBackfillRun(
  sql: ReturnType<typeof createSqlClient>,
) {
  const [counts] = await sql<{ targetCount: number; unavailableCount: number }[]>`
    select
      count(*)::int as "targetCount",
      count(*) filter (where
        listing.canonical_source_url is null
        or listing.canonical_source_url !~ '^https://www\\.nettiauto\\.com/'
        or not exists (select 1 from listing_sightings sighting where sighting.listing_id = listing.id)
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
  const [run] = await sql<{ id: string }[]>`
    insert into detail_backfill_runs (
      source,
      target_parser_version,
      selection,
      status,
      target_count,
      unavailable_count,
      notes
    )
    values (
      'nettiauto',
      ${NETTIAUTO_DETAIL_PARSER_VERSION},
      'missing_or_v1',
      'planned',
      ${counts?.targetCount ?? 0},
      ${counts?.unavailableCount ?? 0},
      'Network refetch of listings with no parsed detail or only nettiauto-detail-v1 data.'
    )
    returning id
  `;
  if (!run) {
    throw new Error("Failed to create Nettiauto detail backfill run.");
  }
  return run.id;
}

async function finalizeDetailBackfill(
  sql: ReturnType<typeof createSqlClient>,
  runId: string,
  addJob: AddJobFunction,
) {
  const [pending] = await sql<{ count: number }[]>`
    select count(*)::int as count
    from graphile_worker.jobs
    where task_identifier = 'crawl_nettiauto_detail_page'
      and payload->>'detailBackfillRunId' = ${runId}
  `;
  if ((pending?.count ?? 0) > 0) {
    await addJob(
      "finalize_nettiauto_detail_backfill",
      { runId },
      {
        queueName: "nettiauto-backfill-control",
        maxAttempts: 5,
        jobKey: `nettiauto:detail-backfill-finalize:${runId}:${Date.now()}`,
        runAt: new Date(Date.now() + 15 * 60 * 1_000),
      },
    );
    return;
  }

  const [counts] = await sql<{
    targetCount: number;
    initiallyUnavailableCount: number;
    succeededCount: number;
    fetchedUnavailableCount: number;
  }[]>`
    select
      run.target_count as "targetCount",
      run.unavailable_count as "initiallyUnavailableCount",
      (
        select count(distinct record.source_listing_id)::int
        from raw_listing_records record
        where record.detail_backfill_run_id = run.id
          and record.parser_status = 'parsed'
          and record.parser_version = run.target_parser_version
      ) as "succeededCount",
      (
        select count(distinct fetch.source_listing_id)::int
        from source_fetches fetch
        where fetch.detail_backfill_run_id = run.id
          and fetch.response_status in (404, 410)
      ) as "fetchedUnavailableCount"
    from detail_backfill_runs run
    where run.id = ${runId}
  `;
  if (!counts) {
    return;
  }

  const unavailableCount = counts.initiallyUnavailableCount + counts.fetchedUnavailableCount;
  const failedCount = Math.max(0, counts.targetCount - counts.succeededCount - unavailableCount);
  await sql`
    update detail_backfill_runs
    set
      status = ${failedCount === 0 ? "completed" : "partial"},
      succeeded_count = ${counts.succeededCount},
      unavailable_count = ${unavailableCount},
      failed_count = ${failedCount},
      finished_at = now(),
      updated_at = now()
    where id = ${runId}
  `;
}
