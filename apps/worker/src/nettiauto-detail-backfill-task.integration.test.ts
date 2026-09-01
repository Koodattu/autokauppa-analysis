import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeSqlClient, createSqlClient } from "@nettiauto/db";
import { runMigrations, type AddJobFunction, type Task } from "graphile-worker";
import { createNettiautoDetailBackfillTask } from "./nettiauto-detail-backfill-task";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = testDatabaseUrl ? describe : describe.skip;

describeDatabase("Nettiauto detail backfill target cap", () => {
  if (!testDatabaseUrl) {
    return;
  }

  const databaseName = new URL(testDatabaseUrl).pathname.slice(1);
  if (!databaseName.includes("test")) {
    throw new Error("Integration tests require a database name containing 'test'.");
  }

  const sql = createSqlClient(testDatabaseUrl, 1);
  const fixtureId = randomUUID();
  const sourceListingPrefix = `backfill-cap-${fixtureId}`;
  let searchQueryId = "";
  let crawlRunId = "";
  let sourceFetchId = "";
  let backfillRunId = "";

  beforeAll(async () => {
    vi.stubEnv("DATABASE_URL", testDatabaseUrl);
    vi.stubEnv("CRAWLER_ENABLED", "true");
    vi.stubEnv("CRAWLER_PAUSED", "false");
    vi.stubEnv("DETAIL_BACKFILL_TARGET_LIMIT", "200");
    await runMigrations({ connectionString: testDatabaseUrl });

    [searchQueryId] = await sql.begin(async (tx) => {
      const [query] = await tx<{ id: string }[]>`
        insert into source_search_queries (
          source, vehicle_category, crawl_kind, entry_path, source_search_hash,
          query_params, enabled, priority, target_cadence_interval, notes
        ) values (
          'nettiauto', 'passenger_car', 'current', '/test', ${fixtureId},
          '{}'::jsonb, true, 10, interval '1 day', 'Detail backfill cap integration test'
        ) returning id
      `;
      if (!query) throw new Error("Failed to create test Source Search Query.");

      const [crawlRun] = await tx<{ id: string }[]>`
        insert into crawl_runs (
          source, search_query_id, crawl_kind, vehicle_category, status, started_at
        ) values ('nettiauto', ${query.id}, 'current', 'passenger_car', 'running', now())
        returning id
      `;
      if (!crawlRun) throw new Error("Failed to create test Crawl Run.");
      crawlRunId = crawlRun.id;

      const [sourceFetch] = await tx<{ id: string }[]>`
        insert into source_fetches (
          crawl_run_id, search_query_id, source, fetch_kind, page_number,
          source_url, request_headers, response_status, response_body_shape, fetched_at
        ) values (
          ${crawlRun.id}, ${query.id}, 'nettiauto', 'search_result_page', 1,
          'https://www.nettiauto.com/test', '{}'::jsonb, 200, 'html_document', now()
        ) returning id
      `;
      if (!sourceFetch) throw new Error("Failed to create test Source Fetch.");
      sourceFetchId = sourceFetch.id;

      const [rawRecord] = await tx<{ id: string }[]>`
        insert into raw_listing_records (
          source, source_listing_id, crawl_run_id, source_fetch_id, record_kind,
          source_payload, source_payload_sha256, parser_version, parser_status, captured_at
        ) values (
          'nettiauto', ${sourceListingPrefix}, ${crawlRun.id}, ${sourceFetch.id},
          'search_result_card', '{}'::jsonb, ${fixtureId}, 'integration-test', 'parsed', now()
        ) returning id
      `;
      if (!rawRecord) throw new Error("Failed to create test Raw Listing Record.");

      for (const availability of ["active", "sold"] as const) {
        for (const detailCohort of ["missing", "v1"] as const) {
          for (let index = 0; index < 60; index += 1) {
            const sourceListingId =
              `${sourceListingPrefix}-${availability}-${detailCohort}-${index}`;
            const lastSeenAt = new Date(Date.now() - index * 60_000);
            const [listing] = await tx<{ id: string }[]>`
              insert into listings (
                source, source_listing_id, vehicle_category, canonical_source_url,
                current_availability, first_seen_at, last_seen_at
              ) values (
                'nettiauto', ${sourceListingId}, 'passenger_car',
                ${`https://www.nettiauto.com/test/${sourceListingId}`},
                ${availability}, ${lastSeenAt}, ${lastSeenAt}
              ) returning id
            `;
            if (!listing) throw new Error("Failed to create test Listing.");

            if (detailCohort === "v1") {
              await tx`
                insert into raw_listing_records (
                  source, source_listing_id, crawl_run_id, source_fetch_id, record_kind,
                  source_url, source_payload, source_payload_sha256, parser_version,
                  parser_status, captured_at
                ) values (
                  'nettiauto', ${sourceListingId}, ${crawlRun.id}, ${sourceFetch.id},
                  'detail_page', ${`https://www.nettiauto.com/test/${sourceListingId}`},
                  '{}'::jsonb, ${`${fixtureId}-${sourceListingId}`},
                  'nettiauto-detail-v1', 'parsed', ${lastSeenAt}
                )
              `;
            }

            await tx`
              insert into listing_sightings (
                listing_id, crawl_run_id, search_query_id, source_fetch_id,
                raw_listing_record_id, crawl_kind, seen_at, page_number
              ) values (
                ${listing.id}, ${crawlRun.id}, ${query.id}, ${sourceFetch.id},
                ${rawRecord.id}, 'current', ${lastSeenAt}, 1
              )
            `;
          }
        }
      }

      const [backfillRun] = await tx<{ id: string }[]>`
        insert into detail_backfill_runs (
          source, target_parser_version, selection, status, target_count, scheduled_count
        ) values ('nettiauto', 'nettiauto-detail-v4', 'missing_or_v1', 'queued', 145503, 145503)
        returning id
      `;
      if (!backfillRun) throw new Error("Failed to create test Detail Backfill Run.");
      backfillRunId = backfillRun.id;

      await tx`
        select graphile_worker.add_job(
          'crawl_nettiauto_detail_page',
          ${tx.json({ detailBackfillRunId: backfillRun.id })}::json,
          job_key := ${`nettiauto:detail-backfill:${backfillRun.id}:legacy`}
        )
      `;

      return [query.id];
    });
  });

  afterAll(async () => {
    if (backfillRunId) {
      await sql`delete from detail_backfill_runs where id = ${backfillRunId}`;
    }
    if (crawlRunId) {
      await sql`delete from listing_sightings where crawl_run_id = ${crawlRunId}`;
    }
    await sql`delete from listings where source_listing_id like ${`${sourceListingPrefix}%`}`;
    await sql`delete from raw_listing_records where source_listing_id like ${`${sourceListingPrefix}%`}`;
    if (sourceFetchId) {
      await sql`delete from source_fetches where id = ${sourceFetchId}`;
    }
    if (crawlRunId) {
      await sql`delete from crawl_runs where id = ${crawlRunId}`;
    }
    if (searchQueryId) {
      await sql`delete from source_search_queries where id = ${searchQueryId}`;
    }
    await closeSqlClient(sql);
    vi.unstubAllEnvs();
  });

  it("retires legacy jobs before selecting 25 newest and oldest targets per audit cohort", async () => {
    const addJob = vi.fn(async () => undefined) as unknown as AddJobFunction;
    const task = createNettiautoDetailBackfillTask("schedule_nettiauto_detail_backfill");
    const helpers = { addJob } as unknown as Parameters<Task>[1];

    await task({ runId: backfillRunId, resume: true, rebuildTargets: true }, helpers);

    const [beforeSeed] = await sql<{ count: number }[]>`
      select count(*)::int as count from detail_backfill_targets where run_id = ${backfillRunId}
    `;
    expect(beforeSeed?.count).toBe(0);

    await task({ runId: backfillRunId }, helpers);

    const selected = await sql<{ sourceListingId: string }[]>`
      select listing.source_listing_id as "sourceListingId"
      from detail_backfill_targets target
      join listings listing on listing.id = target.listing_id
      where target.run_id = ${backfillRunId}
    `;
    const [run] = await sql<{ targetCount: number; unavailableCount: number; status: string }[]>`
      select target_count as "targetCount", unavailable_count as "unavailableCount", status
      from detail_backfill_runs where id = ${backfillRunId}
    `;

    const selectedIds = new Set(selected.map((row) => row.sourceListingId));
    expect(selectedIds.size).toBe(200);
    for (const availability of ["active", "sold"] as const) {
      for (const detailCohort of ["missing", "v1"] as const) {
        for (let index = 0; index < 60; index += 1) {
          const sourceListingId =
            `${sourceListingPrefix}-${availability}-${detailCohort}-${index}`;
          expect(selectedIds.has(sourceListingId)).toBe(index < 25 || index >= 35);
        }
      }
    }
    expect(run).toEqual({ targetCount: 200, unavailableCount: 0, status: "running" });
  });
});
