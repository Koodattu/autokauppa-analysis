// Read-only production catalog refresh. Emits aggregate statistics only; no payload reads.
import { createSqlClient } from "/app/packages/db/src/index.ts";

const sql = createSqlClient(process.env.DATABASE_URL!, 1, 5000);
let stage = "connect";
try {
  await sql`set default_transaction_read_only=on`;
  await sql`set lock_timeout='500ms'`;
  await sql`set max_parallel_workers_per_gather=0`;
  await sql`set work_mem='4MB'`;
  await sql.begin("read only", async tx => {
    stage = "catalog";
    const tables = await tx`select c.relname as name,c.reltuples::bigint as estimated_rows,
      pg_total_relation_size(c.oid)::bigint as total_bytes,pg_relation_size(c.oid)::bigint as heap_bytes,
      pg_indexes_size(c.oid)::bigint as index_bytes,
      case when c.reltoastrelid=0 then 0 else pg_total_relation_size(c.reltoastrelid) end::bigint as toast_bytes,
      s.n_live_tup,s.n_dead_tup,s.last_analyze,s.last_autoanalyze
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      left join pg_stat_user_tables s on s.relid=c.oid
      where n.nspname='public' and c.relkind='r' order by pg_total_relation_size(c.oid) desc`;
    const indexes = await tx`select relname as table_name,indexrelname as name,
      pg_relation_size(indexrelid)::bigint as bytes,idx_scan
      from pg_stat_user_indexes where schemaname='public' order by pg_relation_size(indexrelid) desc`;
    const widths = await tx`select tablename,attname,avg_width,null_frac,n_distinct
      from pg_stats where schemaname='public' and tablename in
      ('raw_listing_records','listing_sightings','source_fetches','listing_snapshots','raw_listing_payloads')
      order by tablename,attname`;
    stage = "bounded-metadata";
    // At most 256 sampled sightings, with indexed primary-key probes only.
    // No sample rows, IDs, hashes, timestamps or text values leave this process.
    const panel = await tx`with panel as materialized (
      select * from listing_sightings tablesample system(0.02) repeatable(1010) limit 256
    ) select count(*)::int as sampled_sightings,
      count(*) filter(where (s.crawl_run_id,s.search_query_id,s.page_number)
        is distinct from (f.crawl_run_id,f.search_query_id,f.page_number))::int as fetch_context_mismatches,
      count(*) filter(where s.seen_at is distinct from r.captured_at)::int as independent_timestamp_rows,
      count(*) filter(where (s.crawl_run_id,s.source_fetch_id)
        is distinct from (r.crawl_run_id,r.source_fetch_id))::int as raw_context_mismatches,
      count(*) filter(where r.record_kind <> 'search_result_card')::int as other_record_kinds,
      avg(pg_column_size(s))::float8 as sighting_tuple_bytes,
      avg(pg_column_size(r))::float8 as raw_tuple_bytes,
      avg(length(r.source_url))::float8 as raw_url_chars
      from panel s join raw_listing_records r on r.id=s.raw_listing_record_id
      join source_fetches f on f.id=s.source_fetch_id`;
    const info = await tx`select version() as version,pg_database_size(current_database())::bigint as database_bytes,
      current_setting('transaction_read_only') as read_only,current_setting('statement_timeout') as statement_timeout`;
    const output = JSON.stringify({tables,indexes,widths,panel,info,exportedObservationRows:0});
    if (Buffer.byteLength(output)>65536) throw new Error("Aggregate output cap exceeded");
    process.stdout.write(output);
  });
} catch (error: any) {
  process.stderr.write(JSON.stringify({stage,code:typeof error.code==='string'?error.code:'guard'})+'\n');
  process.exitCode=1;
} finally { await sql.end({timeout:5}); }
