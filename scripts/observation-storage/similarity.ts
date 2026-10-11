// Executed from stdin in the existing worker. All evidence stays in server RAM.
// The runner replaces only these two local import paths with their /app paths.
import { createSqlClient } from "../../packages/db/src/index.ts";
import { packStorageValue, unpackRawEvidence, type RawEvidenceEntry } from "../../packages/domain/src/storage-codec.ts";

const limits = {
  selectedRows: 300, selectedBytes: 8 * 1024 ** 2, bundles: 80,
  decodedBytes: 256 * 1024 ** 2, compressionInputBytes: 128 * 1024 ** 2,
  sqlQueries: 260, runtimeSeconds: 90,
};
type Kind = "current" | "sold" | "detail";
type Row = {
  id: string; source: string; sourceId: string; capturedAt: string;
  digest: string; index: number; kind: Kind; pair?: RawEvidenceEntry;
};
const sql = createSqlClient(process.env.DATABASE_URL!, 1, 5000);
const counters = { sqlQueries: 0, bundleReads: 0, decodedBytes: 0, selectedBytes: 0,
  candidateRows: 0, acceptedRows: 0, skippedRows: 0, compressionInputBytes: 0,
  roundTrips: 0, seedListings: 0, currentRuns: 0, soldRuns: 0 };
const watchdog = setTimeout(() => process.exit(124), limits.runtimeSeconds * 1000);
let stage = 0;
function queryBudget() {
  if (++counters.sqlQueries > limits.sqlQueries) throw new Error("Query budget reached");
}
try {
  await sql`set default_transaction_read_only=on`;
  await sql`set lock_timeout='500ms'`;
  await sql`set max_parallel_workers_per_gather=0`;
  await sql`set work_mem='4MB'`;
  counters.sqlQueries = 4;
  stage = 1;
  queryBudget();
  const runs = await sql<{ id: string; kind: Kind; pages: number }[]>`
    select id::text, crawl_kind as kind, fetched_page_count as pages from (
      select id,crawl_kind,fetched_page_count,finished_at,
        row_number() over(partition by crawl_kind order by finished_at desc,id) as rank
      from crawl_runs where status='completed' and is_complete
        and finished_at >= '2026-07-01' and finished_at < '2026-10-11'
    ) r where rank<=3 order by crawl_kind,finished_at,id
  `;
  const candidates: Row[] = [];
  const seeds = new Map<string, { id: string; source: string; sourceId: string }>();
  for (const kind of ["current", "sold"] as const) {
    const cohort = runs.filter(r => r.kind === kind);
    counters[kind === "current" ? "currentRuns" : "soldRuns"] = cohort.length;
    if (cohort.length < 2) throw new Error("Insufficient completed crawls");
    const oldest = cohort[0]!;
    const selected = new Map<string, { id: string; source: string; sourceId: string }>();
    for (const fraction of [0, 1 / 3, 2 / 3]) {
      queryBudget();
      const [fetch] = await sql`select id from source_fetches where crawl_run_id=${oldest.id}
        and fetch_kind='search_result_page' and page_number>=${Math.max(1, Math.floor(oldest.pages * fraction))}
        and response_status between 200 and 299 order by page_number,attempt_number limit 1`;
      if (!fetch) continue;
      queryBudget();
      const pageSeeds = await sql<{ id: string; source: string; sourceId: string }[]>`
        select l.id::text,l.source::text,l.source_listing_id as "sourceId"
        from raw_listing_records r join listings l on l.source=r.source and l.source_listing_id=r.source_listing_id
        where r.source_fetch_id=${fetch.id} and r.record_kind='search_result_card'
        order by r.source_listing_id limit 4
      `;
      for (const row of pageSeeds) { selected.set(row.id, row); seeds.set(row.id, row); }
    }
    for (const listing of selected.values()) for (const run of cohort) {
      queryBudget();
      const rows = await sql<Row[]>`select r.id::text,r.source::text,r.source_listing_id as "sourceId",
        r.captured_at::text as "capturedAt",encode(r.payload_digest,'hex') as digest,r.payload_index as index
        from listing_sightings s join raw_listing_records r on r.id=s.raw_listing_record_id
        where s.listing_id=${listing.id} and s.crawl_run_id=${run.id}
        order by s.seen_at,s.id limit 1`;
      candidates.push(...rows.map(row => ({ ...row, kind })));
    }
  }
  counters.seedListings = seeds.size;
  // Include up to two detail observations for eight of the same source identities.
  // Details may be singletons: they are reported separately, never assumed repeatable.
  stage = 2;
  for (const seed of [...seeds.values()].slice(0, 8)) {
    queryBudget();
    const rows = await sql<Row[]>`select id::text,source::text,source_listing_id as "sourceId",
      captured_at::text as "capturedAt",encode(payload_digest,'hex') as digest,payload_index as index
      from raw_listing_records where source=${seed.source} and source_listing_id=${seed.sourceId}
        and record_kind='detail_page' order by captured_at desc,id limit 2`;
    candidates.push(...rows.map(row => ({ ...row, kind: "detail" as const })));
  }
  const distinct = [...new Map(candidates.map(row => [row.id, row])).values()];
  counters.candidateRows = distinct.length;
  if (distinct.length > limits.selectedRows) throw new Error("Row budget reached");
  const groups = new Map<string, Row[]>();
  for (const row of distinct) {
    if (!row.digest || !/^[0-9a-f]{64}$/.test(row.digest) || row.index === null) continue;
    const group = groups.get(row.digest) ?? [];
    group.push(row); groups.set(row.digest, group);
  }
  stage = 3;
  // Prefer bundles serving several selected observations, but never exceed the work budget.
  // Any skipped candidates are counted; this is a survivor panel, not a random census.
  const accepted: Row[] = [];
  for (const [digest, rows] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    if (counters.bundleReads >= limits.bundles) break;
    queryBudget();
    const [meta] = await sql`select decoded_bytes,octet_length(content) as compressed_bytes
      from raw_listing_payloads where digest=decode(${digest},'hex')`;
    if (!meta || meta.decoded_bytes > 64 * 1024 ** 2 || meta.compressed_bytes > 64 * 1024 ** 2 ||
        counters.decodedBytes + meta.decoded_bytes > limits.decodedBytes) continue;
    queryBudget();
    const [packed] = await sql<Parameters<typeof unpackRawEvidence>[0][]>`select encode(digest,'hex') as digest,codec,decoded_bytes as "decodedBytes",content
      from raw_listing_payloads where digest=decode(${digest},'hex')`;
    counters.bundleReads++;
    counters.decodedBytes += meta.decoded_bytes;
    if (!packed) throw new Error("Missing evidence bundle");
    const pairs = unpackRawEvidence(packed);
    for (const row of rows) {
      const pair = pairs[row.index];
      if (!pair) throw new Error("Missing evidence index");
      const bytes = Buffer.byteLength(JSON.stringify(pair));
      if (counters.selectedBytes + bytes > limits.selectedBytes) continue;
      counters.selectedBytes += bytes;
      accepted.push({ ...row, pair });
    }
  }
  counters.acceptedRows = accepted.length;
  counters.skippedRows = distinct.length - accepted.length;
  stage = 4;
  function summarize(rows: Row[]) {
    const identities = new Map<string, number>();
    for (const row of rows) {
      const identity = `${row.source}:${row.sourceId}:${row.kind === "detail" ? "detail" : "search"}`;
      identities.set(identity, (identities.get(identity) ?? 0) + 1);
    }
    const layouts: Record<string, { bytes: number; bundles: number; verifiedRows: number }> = {};
    for (const batchSize of [16, 64, 250]) for (const order of ["uuid", "temporal"]) {
      const sorted = [...rows].sort((a, b) => order === "uuid" ? a.id.localeCompare(b.id) :
        a.source.localeCompare(b.source) || a.sourceId.localeCompare(b.sourceId) ||
        Number(a.kind === "detail") - Number(b.kind === "detail") ||
        a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id));
      const result = { bytes: 0, bundles: 0, verifiedRows: 0 };
      for (let i = 0; i < sorted.length; i += batchSize) {
        const pairs = sorted.slice(i, i + batchSize).map(row => row.pair!);
        const expected = JSON.stringify(pairs);
        counters.compressionInputBytes += Buffer.byteLength(expected);
        if (counters.compressionInputBytes > limits.compressionInputBytes) throw new Error("Compression budget reached");
        const packed = packStorageValue(pairs);
        if (JSON.stringify(unpackRawEvidence(packed)) !== expected) throw new Error("Round trip mismatch");
        counters.roundTrips += pairs.length;
        result.bytes += packed.content.length; result.bundles++; result.verifiedRows += pairs.length;
      }
      layouts[`${order}${batchSize}`] = result;
    }
    return { rows: rows.length, identities: identities.size,
      repeatedIdentities: [...identities.values()].filter(n => n > 1).length,
      singletonIdentities: [...identities.values()].filter(n => n === 1).length,
      layouts };
  }
  const panels = { all: summarize(accepted), current: summarize(accepted.filter(r => r.kind === "current")),
    sold: summarize(accepted.filter(r => r.kind === "sold")), detail: summarize(accepted.filter(r => r.kind === "detail")) };
  // Fixed keys and numeric leaves only: no identifiers, hashes, dates, text, or raw records.
  process.stdout.write(JSON.stringify({ version: 1, exportedObservationRows: 0, limits, counters, panels }));
} catch {
  process.stderr.write(JSON.stringify({ failed: true, stage, exportedObservationRows: 0 }) + "\n");
  process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
  await sql.end({ timeout: 5 });
}
