// Runs from stdin inside the existing worker. SELECT-only, sequential, bounded.
// AGGREGATES ONLY. Raw records never leave the server, including on success.
import { createSqlClient } from "/app/packages/db/src/index.ts";
import { unpackRawEvidence, packStorageValue, unpackStorageValue } from "/app/packages/domain/src/storage-codec.ts";
import { createHash } from "node:crypto";

const sql = createSqlClient(process.env.DATABASE_URL!, 1, 5000);
const MAX_ROWS = 300, MAX_BYTES = 8 * 1024 * 1024;
const output: any = { version: 1, selection: {}, observations: [], fetches: [], runs: [], queries: [] };
let stage = "connection";
const encodedSize = () => Buffer.byteLength(JSON.stringify(output));
const append = (key: string, row: unknown) => {
  output[key].push(row);
  if (encodedSize() > MAX_BYTES - 4096) {
    output[key].pop();
    throw new Error("Extraction byte limit reached; no additional sample emitted");
  }
};
try {
  await sql`set default_transaction_read_only=on`;
  await sql`set lock_timeout='500ms'`;
  await sql`set max_parallel_workers_per_gather=0`;
  await sql`set work_mem='4MB'`;
  stage = "cohort-query";
  const runs = await sql`select to_jsonb(r) as row from (
    select *,row_number() over(partition by crawl_kind order by finished_at desc,id) as rank
    from crawl_runs where status='completed' and is_complete
    and finished_at >= '2026-07-01' and finished_at < '2026-10-06'
  ) r where rank<=3 order by crawl_kind,finished_at`;
  const cohorts: Record<string, any[]> = { current: [], sold: [] };
  for (const { row } of runs) { delete row.rank; cohorts[row.crawl_kind].push(row); append("runs", row); }
  for (const kind of ["current", "sold"]) {
    stage = `seed-${kind}`;
    const cohort = cohorts[kind];
    if (cohort.length < 2) throw new Error("Need at least two complete crawls per kind");
    const oldest = cohort[0];
    const listings = new Set<string>();
    // 3 page positions in the oldest chosen crawl; 4 source cards per page.
    for (const fraction of [0, 1 / 3, 2 / 3]) {
      const page = Math.max(1, Math.floor(oldest.fetched_page_count * fraction));
      const [fetch] = await sql`select id from source_fetches where crawl_run_id=${oldest.id}
        and fetch_kind='search_result_page' and page_number>=${page} and response_status between 200 and 299
        order by page_number,attempt_number limit 1`;
      if (!fetch) continue;
      const seeds = await sql`select l.id from raw_listing_records r join listings l
        on l.source=r.source and l.source_listing_id=r.source_listing_id
        where r.source_fetch_id=${fetch.id} and r.record_kind='search_result_card'
        order by r.source_listing_id limit 4`;
      seeds.forEach(row => listings.add(row.id));
    }
    for (const listing of listings) for (const run of cohort) {
      stage = `observations-${kind}`;
      const records = await sql`select to_jsonb(s) as sighting,
        to_jsonb(r)-'source_payload'-'source_html_fragment' as raw
        from listing_sightings s join raw_listing_records r on r.id=s.raw_listing_record_id
        where s.listing_id=${listing} and s.crawl_run_id=${run.id}
        order by s.seen_at,s.id limit 3`;
      for (const row of records) {
        if (output.observations.length >= MAX_ROWS) throw new Error("Observation cap reached");
        append("observations", row);
      }
    }
  }
  for (const id of [...new Set(output.observations.map((r: any) => r.raw.source_fetch_id))]) {
    stage = "fetch-references";
    const [row] = await sql`select to_jsonb(f) as row from source_fetches f where id=${id}`;
    append("fetches", row.row);
  }
  for (const id of [...new Set(output.runs.map((r: any) => r.search_query_id))]) {
    stage = "query-references";
    const [row] = await sql`select to_jsonb(q) as row from source_search_queries q where id=${id}`;
    append("queries", row.row);
  }
  // Decode only on the server; emit just each selected pair, never unrelated bundle entries.
  // At most 80 bundle reads, 64 MiB per bundle, 256 MiB aggregate decode work.
  const groups = new Map<string, any[]>();
  for (const row of output.observations) {
    const digest = row.raw.payload_digest;
    if (!digest || row.raw.payload_index === null) throw new Error("Sample requires packed evidence");
    groups.set(digest, [...(groups.get(digest) ?? []), row]);
  }
  let decodedWorkBytes = 0;
  if (groups.size > 80) throw new Error("Bundle I/O cap reached");
  for (const [digest, rows] of groups) {
    stage = "evidence-metadata";
    if (!/^\\x[0-9a-f]{64}$/.test(digest)) throw new Error("Invalid stored evidence reference");
    const [meta] = await sql`select decoded_bytes from raw_listing_payloads where digest=decode(${digest.slice(2)},'hex')`;
    decodedWorkBytes += meta.decoded_bytes;
    if (decodedWorkBytes > 256 * 1024 * 1024) throw new Error("Decode work budget reached");
    const [packed] = await sql`select encode(digest,'hex') as digest,codec,decoded_bytes as "decodedBytes",content
      from raw_listing_payloads where digest=decode(${digest.slice(2)},'hex')`;
    stage = "evidence-decode";
    const entries = unpackRawEvidence(packed);
    for (const row of rows) {
      row.evidence = entries[row.raw.payload_index];
      if (!row.evidence || encodedSize() > MAX_BYTES - 4096) throw new Error("Evidence extraction cap reached");
    }
  }
  output.selection = {
    window: ["2026-07-01", "2026-10-06"], runs: output.runs.map((r: any) => ({kind:r.crawl_kind,finishedAt:r.finished_at})),
    seeds: "4 source IDs from pages near 0%, 33%, 67% of oldest selected crawl; track same listings in up to 3 completed crawls",
    bias: "Small survivor panel, ordered source-ID seeds, search cards only; excludes incomplete crawls, missing observations and detail pages",
    observations: output.observations.length, bundleReads: groups.size, decodedWorkBytes,
    maxObservationRows: MAX_ROWS, maxExtractedBytes: MAX_BYTES,
  };
  if (encodedSize() > MAX_BYTES) throw new Error("Final byte cap exceeded");
  const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const summarize = (rows: any[]) => {
    const unique = new Map<string, any>();
    const byJson = new Map<string, Set<string>>();
    let decodedBytes = 0;
    for (const row of rows) {
      const key = digest(row.evidence);
      if (unique.has(key) && JSON.stringify(unique.get(key)) !== JSON.stringify(row.evidence)) {
        throw new Error("Hash collision; refusing merge");
      }
      unique.set(key, row.evidence);
      const json = digest(row.evidence[0]);
      byJson.set(json, (byJson.get(json) ?? new Set()).add(key));
      decodedBytes += Buffer.byteLength(JSON.stringify(row.evidence));
    }
    const pack = (pairs: any[]) => {
      let bytes = 0;
      for (let i = 0; i < pairs.length; i += 250) {
        const chunk = pairs.slice(i, i + 250);
        const packed = packStorageValue(chunk);
        if (JSON.stringify(unpackStorageValue(packed)) !== JSON.stringify(chunk)) throw new Error("Round trip failed");
        bytes += packed.content.length;
      }
      return bytes;
    };
    return { observations: rows.length, exactUniquePairs: unique.size,
      exactDuplicateObservations: rows.length-unique.size, decodedBytes,
      jsonIdentitiesWithDifferentHtml: [...byJson.values()].filter(x=>x.size>1).length,
      baselineRepacked250Bytes: pack(rows.map(x=>x.evidence)),
      exactDedupRepacked250Bytes: pack([...unique.values()]),
      exactRoundTripsVerified: rows.length };
  };
  const fetches = new Map(output.fetches.map((r: any)=>[r.id,r]));
  const cohortRuns = new Map(output.runs.map((r: any)=>[r.id,r]));
  const mismatches = output.observations.filter((o: any)=>{
    const f: any = fetches.get(o.raw.source_fetch_id), r: any=cohortRuns.get(o.sighting.crawl_run_id);
    return o.raw.crawl_run_id!==f.crawl_run_id || o.raw.detail_backfill_run_id!==f.detail_backfill_run_id ||
      o.sighting.crawl_run_id!==f.crawl_run_id || o.sighting.search_query_id!==f.search_query_id ||
      o.sighting.page_number!==f.page_number || o.sighting.crawl_kind!==r.crawl_kind;
  }).length;
  const summary = { selection: output.selection, all: summarize(output.observations),
    current: summarize(output.observations.filter((o: any)=>o.sighting.crawl_kind==='current')),
    sold: summarize(output.observations.filter((o: any)=>o.sighting.crawl_kind==='sold')),
    contextMismatchRows: mismatches, extractedObservationRows: 0,
    note: "Only aggregate statistics exported. Repacked byte counts exclude PostgreSQL structures and are not estimates of production reclamation." };
  process.stdout.write(JSON.stringify(summary));
} catch (error: any) {
  // Deliberately do not expose query parameters, credentials, or payloads on error.
  process.stderr.write(JSON.stringify({message:"Bounded sampling failed; no sample emitted",stage,
    code: typeof error.code==='string'?error.code:"application-guard", sampledRows:output.observations.length})+"\n");
  process.exitCode = 1;
} finally { await sql.end({ timeout: 5 }); }
