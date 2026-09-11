import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { createDbClient, createSqlClient } from "../packages/db/src/index";
import { packLegacyImagesBatch, packRawEvidenceBatch, verifyLegacyImages } from "../packages/domain/src/storage";
import { unpackRawEvidence, type RawEvidenceEntry } from "../packages/domain/src/storage-codec";
import { getPublicListingDetail } from "../packages/domain/src/product";

const url = new URL(process.env.DATABASE_URL ?? "");
const action = process.argv[2] ?? "";
const productionAudit = process.env.STORAGE_AUDIT_PRODUCTION_READ_ONLY === "nettiauto_analytics";
if (productionAudit) {
  if (url.pathname !== "/nettiauto_analytics" || !["baseline", "api-baseline", "api-verify", "verify", "sizes"].includes(action)) {
    throw new Error("Production audit permits only read-only preservation operations on nettiauto_analytics");
  }
} else if (url.hostname !== "127.0.0.1" || !["nettiauto_audit_test", "nettiauto_storage_fixture_test"].includes(url.pathname.slice(1))) {
  throw new Error("This rehearsal tool requires the isolated local audit or fixture database");
}
const directory = process.env.STORAGE_AUDIT_DIRECTORY;
if (!directory) throw new Error("Run through scripts/run-storage-audit.py");
const requireDb = createRequire(new URL("../packages/db/package.json", import.meta.url));
const postgres = (await import(requireDb.resolve("postgres"))).default;
const sql: ReturnType<typeof createSqlClient> = productionAudit
  ? postgres(url.toString(), { max: 4, prepare: false, connection: {
    default_transaction_read_only: "on", application_name: "nettiauto-storage-preservation",
  } })
  : createSqlClient(url.toString(), 4);
const startedAt = Date.now();
const firstId = "00000000-0000-0000-0000-000000000000";
let lastReport = 0;
function report(value: unknown, force = false) {
  if (force || Date.now() - lastReport > 20000) {
    console.log(JSON.stringify(value));
    lastReport = Date.now();
  }
}
async function save(name: string, value: unknown) {
  await writeFile(join(directory!, name + ".json"), JSON.stringify(value, null, 2) + "\n");
}
async function sizes() {
  const relations = await sql`select relname, pg_total_relation_size(relid)::float8 as bytes
    from pg_stat_user_tables order by pg_total_relation_size(relid) desc`;
  const [database] = await sql`select pg_database_size(current_database())::float8 as bytes`;
  return { database, relations };
}
async function tableFingerprint(table: string, primaryKey = "id") {
  const hash = createHash("sha256");
  let count = 0;
  const projection = table === "raw_listing_records"
    ? `jsonb_build_object('id',t.id,'source',t.source,'source_listing_id',t.source_listing_id,
        'crawl_run_id',t.crawl_run_id,'detail_backfill_run_id',t.detail_backfill_run_id,
        'source_fetch_id',t.source_fetch_id,'record_kind',t.record_kind,'source_url',t.source_url,
        'source_payload_sha256',t.source_payload_sha256,'source_updated_date',t.source_updated_date,
        'parser_version',t.parser_version,'parser_status',t.parser_status,'captured_at',t.captured_at,'parse_error',t.parse_error)`
    : "to_jsonb(t)";
  for await (const rows of sql.unsafe(`select md5((${projection})::text) as digest from ${table} t order by ${primaryKey}`).cursor(2000)) {
    for (const row of rows) hash.update(row.digest + "\n");
    count += rows.length;
    report({ stage: "fingerprint", table, count });
  }
  return { count, sha256: hash.digest("hex") };
}
async function rawFingerprint(packed: boolean) {
  const hash = createHash("sha256");
  let cursor = firstId;
  let count = 0;
  let inline = 0;
  for (;;) {
    const columns = packed ? "payload_digest, payload_index" : "null::text as payload_digest, null::integer as payload_index";
    const rows = await sql.unsafe(`select r.id::text, r.source_payload::text as payload, r.source_html_fragment as html, ${columns}
      from raw_listing_records r where r.id > $1::uuid order by r.id limit 1000`, [cursor]);
    if (!rows.length) break;
    const decoded = new Map<string, RawEvidenceEntry[]>();
    const digests = [...new Set(rows.map(r => r.payload_digest).filter(Boolean))];
    if (digests.length) {
      const bundles = await sql`select digest, codec, decoded_bytes as "decodedBytes", record_count as "recordCount", content
        from raw_listing_payloads where digest = any(${digests}::text[])`;
      for (const bundle of bundles) {
        const entries = unpackRawEvidence(bundle as never);
        if (entries.length !== bundle.recordCount) throw new Error("Raw bundle record count mismatch");
        decoded.set(bundle.digest, entries);
      }
    }
    for (const row of rows) {
      const evidence = row.payload !== null ? [row.payload, row.html] : decoded.get(row.payload_digest)?.[row.payload_index];
      if (!evidence) throw new Error("Missing raw evidence");
      if (row.payload !== null) inline++;
      hash.update(JSON.stringify([row.id, ...evidence]) + "\n");
    }
    count += rows.length;
    cursor = rows.at(-1)!.id;
    report({ stage: "raw_fingerprint", count });
  }
  return { count, inline, sha256: hash.digest("hex") };
}
const unchangedTables = ["listings", "listing_snapshots", "listing_sightings", "listing_events", "source_fetches", "listing_image_assets", "listing_hero_images", "raw_listing_records"];
try {
  if (productionAudit) {
    const [setting] = await sql`show default_transaction_read_only`;
    if (setting?.default_transaction_read_only !== "on") throw new Error("Production audit connection is not read-only");
  }
  if (action === "migrate") {
    const { migrate } = requireDb("drizzle-orm/postgres-js/migrator");
    await migrate(createDbClient(sql), { migrationsFolder: "packages/db/drizzle" });
    report({ stage: action, complete: true }, true);
  } else if (action === "baseline") {
    const path = join(directory, "baseline.json");
    if (await Bun.file(path).exists()) throw new Error("Baseline already exists; refusing to overwrite");
    const tables: Record<string, unknown> = {};
    for (const table of unchangedTables) tables[table] = await tableFingerprint(table, table === "listing_hero_images" ? "listing_id" : "id");
    const details = await sql`select listing_id::text as id, md5(to_jsonb(d)::text) as digest from listing_details d order by listing_id`;
    await save("original-details", details);
    await save("baseline", { sizes: await sizes(), tables, raw: await rawFingerprint(false) });
    report({ stage: action, complete: true }, true);
  } else if (["v2", "images", "raw"].includes(action)) {
    const { runV2DetailStorageBatch } = await import("../apps/worker/src/tasks/backfill_nettiauto_v2_details");
    for (;;) {
      const result = action === "v2" ? await runV2DetailStorageBatch(sql, 500)
        : action === "images" ? await packLegacyImagesBatch(sql, 100) : await packRawEvidenceBatch(sql, 250);
      report(result, result.status !== "running");
      if (result.status !== "running") {
        await save(action + "-result", { progress: result, elapsedSeconds: (Date.now() - startedAt) / 1000, sizes: await sizes() });
        if (result.status === "partial") throw new Error("Migration has unresolved exceptions");
        break;
      }
    }
  } else if (action === "api-baseline" || action === "api-verify") {
    const path = join(directory, "api-baseline.json");
    const samples = action === "api-baseline"
      ? await sql`(select distinct i.listing_id as id from listing_images i
          where not exists(select 1 from listing_image_assets a where a.listing_id=i.listing_id) order by i.listing_id limit 100)
        union (select distinct i.listing_id as id from listing_images i
          where exists(select 1 from listing_image_assets a where a.listing_id=i.listing_id) order by i.listing_id limit 100)
        union (select listing_id as id from listing_hero_images order by listing_id limit 50)`
      : JSON.parse(await readFile(path, "utf8"));
    const captured = [];
    const originalDetailIds = action === "api-verify"
      ? new Set<string>(JSON.parse(await readFile(join(directory, "original-details.json"), "utf8")).map((row: { id: string }) => row.id))
      : new Set<string>();
    let enrichedLabels = 0;
    for (const sample of samples) {
      const detail = await getPublicListingDetail(sql, sample.id);
      const value = detail ? { listing: detail.listing, history: detail.history, imageMetadata: detail.imageMetadata } : null;
      const digest = createHash("sha256").update(JSON.stringify(value)).digest("hex");
      if (action === "api-verify" && digest !== sample.digest) {
        const [source] = await sql`select source_parser_version from listing_details where listing_id=${sample.id}`;
        if (!value || originalDetailIds.has(sample.id) || source?.source_parser_version !== "nettiauto-detail-v2" ||
            value.listing.sourceAttribution.observedDataLabel !== "Search Result and Detail Page Data") {
          throw new Error("Public listing/history/image response changed");
        }
        const previousAttribution = structuredClone(value);
        previousAttribution.listing.sourceAttribution.observedDataLabel = "Search Result Data";
        if (createHash("sha256").update(JSON.stringify(previousAttribution)).digest("hex") !== sample.digest) {
          throw new Error("Public response changed beyond the expected v2 provenance label");
        }
        enrichedLabels++;
      }
      captured.push({ id: sample.id, digest });
      report({ stage: action, count: captured.length });
    }
    if (action === "api-baseline") {
      if (await Bun.file(path).exists()) throw new Error("API baseline already exists");
      await save("api-baseline", captured);
    } else await save("api-verification", { count: captured.length, enrichedLabels, verifiedAt: new Date().toISOString() });
    report({ stage: action, count: captured.length, enrichedLabels, complete: true }, true);
  } else if (action === "verify-images") {
    const count = await verifyLegacyImages(sql, rows => report({ stage: action, rows }));
    await save("images-verification", { count, elapsedSeconds: (Date.now() - startedAt) / 1000, verifiedAt: new Date().toISOString() });
    report({ stage: action, count, complete: true }, true);
  } else if (action === "verify") {
    const baseline = JSON.parse(await readFile(join(directory, "baseline.json"), "utf8"));
    for (const table of unchangedTables) {
      const actual = await tableFingerprint(table, table === "listing_hero_images" ? "listing_id" : "id");
      if (JSON.stringify(actual) !== JSON.stringify(baseline.tables[table])) throw new Error(`Preservation mismatch: ${table}`);
    }
    const originalDetails = JSON.parse(await readFile(join(directory, "original-details.json"), "utf8"));
    for (let i = 0; i < originalDetails.length; i += 1000) {
      const batch = originalDetails.slice(i, i + 1000);
      const actual = await sql`select listing_id::text as id, md5(to_jsonb(d)::text) as digest from listing_details d
        where listing_id = any(${batch.map((r: { id: string }) => r.id)}::uuid[]) order by listing_id`;
      if (JSON.stringify(actual) !== JSON.stringify(batch)) throw new Error("Original detail data changed");
    }
    const raw = await rawFingerprint(true);
    if (raw.count !== baseline.raw.count || raw.sha256 !== baseline.raw.sha256 || raw.inline !== 0) throw new Error("Raw evidence census/checksum mismatch");
    const [v2] = await sql`select count(*)::int as missing from listings l where not exists
      (select 1 from listing_details d where d.listing_id=l.id) and exists
      (select 1 from raw_listing_records r where r.source=l.source and r.source_listing_id=l.source_listing_id
        and r.record_kind='detail_page' and r.parser_status='parsed' and r.parser_version='nettiauto-detail-v2')`;
    if (v2?.missing !== 0) throw new Error("Legacy v2 details remain uncovered");
    const progress = await sql`select stage,status,error_count from storage_migration_progress order by stage`;
    if (progress.length !== 3 || progress.some(p => p.status !== "completed" || Number(p.error_count) !== 0)) throw new Error("Storage stages incomplete");
    await save("preservation-verification", { raw, originalDetails: originalDetails.length, progress, verifiedAt: new Date().toISOString() });
    report({ stage: action, complete: true, rawRecords: raw.count }, true);
  } else if (action === "reclaim-images") {
    if (!await Bun.file(join(directory, "api-verification.json")).exists() ||
        !await Bun.file(join(directory, "images-verification.json")).exists()) throw new Error("Run image preservation and API checks first");
    const [legacy] = await sql`select to_regclass('listing_images') is not null as present`;
    if (legacy?.present) {
      const connection = await sql.reserve();
      try {
        await connection.unsafe(await readFile("scripts/contract-legacy-images.sql", "utf8"));
      } finally {
        connection.release();
      }
    } else {
      const verified = JSON.parse(await readFile(join(directory, "images-verification.json"), "utf8"));
      const [state] = await sql`select status,error_count,processed_count::float8 as count,
        (select coalesce(sum(row_count),0)::float8 from listing_legacy_image_bundles) as packed
        from storage_migration_progress where stage='legacy_images'`;
      if (state?.status !== "completed" || Number(state.error_count) !== 0 || state.count !== verified.count || state.packed !== verified.count) {
        throw new Error("Cannot resume an unverified image contract");
      }
    }
    await save("reclaimed-image-sizes", { ...await sizes(), elapsedSeconds: (Date.now() - startedAt) / 1000 });
    report({ stage: action, complete: true, sizes: await sizes() }, true);
  } else if (action === "reclaim-raw") {
    if (!await Bun.file(join(directory, "preservation-verification.json")).exists()) throw new Error("Run full preservation checks first");
    const connection = await sql.reserve();
    try {
      await connection`set lock_timeout = '5s'`;
      await connection`vacuum (full, analyze) raw_listing_records`;
    } finally {
      connection.release();
    }
    await save("reclaimed-sizes", { ...await sizes(), elapsedSeconds: (Date.now() - startedAt) / 1000 });
    report({ stage: action, complete: true, sizes: await sizes() }, true);
  } else if (action === "sizes") {
    report(await sizes(), true);
  } else {
    throw new Error("Expected migrate, baseline, api-baseline, api-verify, v2, images, verify-images, raw, verify, reclaim-images, reclaim-raw or sizes");
  }
} finally {
  await sql.end({ timeout: 5 });
}
