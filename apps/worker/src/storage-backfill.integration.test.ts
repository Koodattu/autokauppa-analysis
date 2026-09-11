import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "graphile-worker";
import { createSqlClient } from "@nettiauto/db";
import { storeRawEvidence } from "@nettiauto/domain";
import { runV2DetailStorageBatch } from "./tasks/backfill_nettiauto_v2_details";
import legacyImageAssetTask from "./tasks/backfill_nettiauto_image_assets";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("Offline v2 storage migration", () => {
  if (!databaseUrl) return;
  if (new URL(databaseUrl).pathname !== "/nettiauto_storage_fixture_test") {
    throw new Error("Storage migration tests require the dedicated disposable fixture database");
  }
  const sql = createSqlClient(databaseUrl, 1);
  let fetchId = "";
  let runId = "";
  beforeAll(async () => { await runMigrations({ connectionString: databaseUrl }); });
  beforeEach(async () => {
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("CRAWLER_ENABLED", "false");
    vi.stubEnv("CRAWLER_PAUSED", "true");
    await sql`delete from graphile_worker._private_jobs where key like 'storage:v2_details:%'`;
    await sql`truncate source_search_queries, listings, reprocessing_runs, raw_listing_payloads cascade`;
    const [query] = await sql`insert into source_search_queries(source,vehicle_category,crawl_kind,entry_path,source_search_hash)
      values ('nettiauto','passenger_car','current','/test',${randomUUID()}) returning id`;
    const [run] = await sql`insert into crawl_runs(source,search_query_id,crawl_kind,vehicle_category,status)
      values ('nettiauto',${query!.id},'current','passenger_car','completed') returning id`;
    runId = run!.id;
    const [fetch] = await sql`insert into source_fetches(crawl_run_id,search_query_id,source,fetch_kind,source_url,response_body_shape,fetched_at)
      values (${runId},${query!.id},'nettiauto','detail_page','https://example.invalid/test','html_document',now()) returning id`;
    fetchId = fetch!.id;
  });
  afterEach(() => { vi.unstubAllEnvs(); });
  afterAll(async () => {
    await sql`delete from graphile_worker._private_jobs where key like 'storage:v2_details:%'`;
    await sql`truncate storage_migration_progress cascade`;
    await sql.end({ timeout: 5 });
  });

  async function seed(payload: unknown) {
    const sourceId = randomUUID();
    const [raw] = await sql`insert into raw_listing_records(source,source_listing_id,crawl_run_id,source_fetch_id,record_kind,
      source_payload,source_payload_sha256,parser_version,parser_status,captured_at)
      values ('nettiauto',${sourceId},${runId},${fetchId},'detail_page',${sql.json(payload as never)},${sourceId},'nettiauto-detail-v2','parsed',now()) returning id`;
    const [listing] = await sql`insert into listings(source,source_listing_id,vehicle_category,first_seen_at,last_seen_at)
      values ('nettiauto',${sourceId},'passenger_car',now(),now()) returning id`;
    return { listingId: listing!.id as string, rawId: raw!.id as string };
  }

  it("does not run the obsolete image task after lossless cutover", async () => {
    await sql`insert into storage_migration_progress(stage,status) values ('legacy_images','completed')`;
    await sql`alter table listing_images rename to listing_images_rehearsal_hidden`;
    try {
      await expect(legacyImageAssetTask({}, {} as never)).resolves.toBeUndefined();
    } finally {
      await sql`alter table listing_images_rehearsal_hidden rename to listing_images`;
    }
  });

  it("reads packed v2 evidence, retains provenance and never overwrites existing v4 details", async () => {
    const payload = { normalizedData: { vin: "wvwzzz1kz6w000001" }, fields: [{ label: "Vääntö", value: "400 Nm" }] };
    const old = await seed(payload);
    const current = await seed(payload);
    const digest = await storeRawEvidence(sql, [[JSON.stringify(payload), "<p>original</p>"]]);
    await sql`update raw_listing_records set source_payload=null, payload_digest=${digest}, payload_index=0 where id=${old.rawId}`;
    await sql`insert into listing_details(listing_id,source_parser_version,normalization_schema_version,source_raw_listing_record_id,source_fetch_id,fetched_at,torque_nm)
      values (${current.listingId},'nettiauto-detail-v4','nettiauto-detail-v4',${current.rawId},${fetchId},now(),555)`;
    expect((await runV2DetailStorageBatch(sql, 1)).status).toBe("running");
    const done = await runV2DetailStorageBatch(sql, 1);
    expect(done).toMatchObject({ status: "completed", migratedCount: 1, errorCount: 0 });
    expect(await runV2DetailStorageBatch(sql, 1)).toEqual(done);
    const [legacy] = await sql`select source_parser_version,normalization_schema_version,torque_nm,vin from listing_details where listing_id=${old.listingId}`;
    expect(legacy).toEqual({ source_parser_version: "nettiauto-detail-v2", normalization_schema_version: "nettiauto-detail-v4", torque_nm: 400, vin: "WVWZZZ1KZ6W000001" });
    const [latest] = await sql`select source_parser_version,torque_nm from listing_details where listing_id=${current.listingId}`;
    expect(latest).toEqual({ source_parser_version: "nettiauto-detail-v4", torque_nm: 555 });
    const [runs] = await sql`select count(*)::int as count from reprocessing_runs`;
    expect(runs?.count).toBe(1);
  });

  it("records unconvertible v2 data as an exception instead of declaring completion", async () => {
    const missing = await seed({ fields: [] });
    const result = await runV2DetailStorageBatch(sql, 10);
    expect(result).toMatchObject({ status: "partial", errorCount: 1, migratedCount: 0 });
    const [exception] = await sql`select source_id,reason from storage_migration_exceptions where stage='v2_details'`;
    expect(exception).toEqual({ source_id: missing.listingId, reason: "legacy_normalized_data_missing" });
  });

  it("commits normalization, its checkpoint and continuation job atomically", async () => {
    await seed({ normalizedData: {} });
    await sql.unsafe(`create function fail_storage_queue_test() returns trigger language plpgsql as $$ begin raise exception 'injected queue failure'; end $$`);
    await sql`create trigger fail_storage_queue_test before insert on graphile_worker._private_jobs
      for each row when (new.key like 'storage:v2_details:%') execute function fail_storage_queue_test()`;
    try {
      await expect(runV2DetailStorageBatch(sql, 1, true)).rejects.toThrow("injected queue failure");
      const [state] = await sql`select (select count(*) from storage_migration_progress)::int as progress,
        (select count(*) from reprocessing_runs)::int as runs, (select count(*) from listing_details)::int as details`;
      expect(state).toEqual({ progress: 0, runs: 0, details: 0 });
    } finally {
      await sql`drop trigger fail_storage_queue_test on graphile_worker._private_jobs`;
      await sql`drop function fail_storage_queue_test()`;
    }
    const progress = await runV2DetailStorageBatch(sql, 1, true);
    expect(progress).toMatchObject({ status: "running", migratedCount: 1 });
    const [job] = await sql`select payload, max_attempts from graphile_worker._private_jobs
      where key=${`storage:v2_details:${progress.cursorId}`}`;
    expect(job).toEqual({ payload: {}, max_attempts: 5 });
  });

  it("rolls back both normalization and run accounting after a failed insert", async () => {
    await seed({ normalizedData: {} });
    await sql.unsafe(`create function fail_v2_storage_test() returns trigger language plpgsql as $$ begin raise exception 'injected v2 failure'; end $$`);
    await sql`create trigger fail_v2_storage_test before insert on listing_details for each row execute function fail_v2_storage_test()`;
    try {
      await expect(runV2DetailStorageBatch(sql, 10)).rejects.toThrow("injected v2 failure");
      const [state] = await sql`select (select count(*) from storage_migration_progress)::int as progress,
        (select count(*) from reprocessing_runs)::int as runs, (select count(*) from listing_details)::int as details`;
      expect(state).toEqual({ progress: 0, runs: 0, details: 0 });
    } finally {
      await sql`drop trigger fail_v2_storage_test on listing_details`;
      await sql`drop function fail_v2_storage_test()`;
    }
    expect((await runV2DetailStorageBatch(sql, 10)).migratedCount).toBe(1);
  });
});
