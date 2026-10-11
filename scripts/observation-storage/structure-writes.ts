// Metadata writer probe, deliberately not an application persistence replacement.
// Uses only the guarded synthetic fixture connection and public/compact schemas.
import { strict as assert } from "node:assert";
import { createSqlClient } from "../../packages/db/src/index";
import { sql,target,uuid,now,elapsed } from "./structure-fixture";

export async function writePage(layout:"baseline"|"compact",page:number,attempt=0,at="2026-10-03T18:00:00.000987Z",connection:any=sql) {
  return connection.begin(async(tx:any)=>{
    const [fetch]=await tx`insert into public.source_fetches(id,crawl_run_id,search_query_id,source,
      fetch_kind,page_number,attempt_number,source_url,response_body_shape,fetched_at)
      values(${uuid(`write-fetch:${page}`)},${uuid("run:current:3")},${uuid("query:current")},'nettiauto',
        'search_result_page',${page},1,'https://example.invalid/write','ajax_json',${at}::text::timestamptz)
      on conflict(crawl_run_id,fetch_kind,page_number,attempt_number) do update set fetched_at=excluded.fetched_at returning id`;
    let fetchKey:any,contextKey:any,sightingContext:any;
    if(layout==='compact') {
      await tx`insert into compact.fetch_keys(id) values(${fetch.id}) on conflict(id) do nothing`;
      [fetchKey]=await tx`select k from compact.fetch_keys where id=${fetch.id}`;
      await tx`insert into compact.raw_contexts(crawl_run_id,detail_backfill_run_id,parser_key,parser_status,captured_at)
        select c.crawl_run_id,c.detail_backfill_run_id,c.parser_key,c.parser_status,${at}::text::timestamptz
        from compact.raw_rows r join compact.raw_contexts c on c.k=r.context_key where r.id=${uuid('raw:0:3')}
        on conflict(crawl_run_id,detail_backfill_run_id,parser_key,parser_status,captured_at) do nothing`;
      [contextKey]=await tx`select k from compact.raw_contexts where crawl_run_id=${uuid('run:current:3')}
        and captured_at=${at}::text::timestamptz and parser_key=(select k from compact.parser_keys where version='synthetic-search-parser-v1')
        and parser_status='parsed' and detail_backfill_run_id is null`;
      await tx`insert into compact.sighting_contexts(crawl_kind,page_number,source_list_id,source_status_label)
        values('current',${page},'current','active') on conflict(crawl_kind,page_number,source_list_id,source_status_label) do nothing`;
      [sightingContext]=await tx`select k from compact.sighting_contexts where crawl_kind='current' and page_number=${page}
        and source_list_id='current' and source_status_label='active'`;
    }
    const identities=[];
    for(let i=0;i<30;i++) {
      const raw=uuid(`write-raw:${page}:${attempt}:${i}`),sighting=uuid(`write-sighting:${page}:${attempt}:${i}`);
      let storedRaw:any,storedSighting:any;
      if(layout==='baseline') {
        [storedRaw]=await tx`insert into public.raw_listing_records(id,source,source_listing_id,crawl_run_id,detail_backfill_run_id,
          source_fetch_id,record_kind,source_url,source_payload,source_html_fragment,payload_digest,payload_index,
          source_payload_sha256,source_updated_date,parser_version,parser_status,captured_at,parse_error)
          select ${raw},source,source_listing_id,crawl_run_id,detail_backfill_run_id,${fetch.id},record_kind,source_url,
            source_payload,source_html_fragment,payload_digest,payload_index,source_payload_sha256,source_updated_date,
            parser_version,parser_status,${at}::text::timestamptz,parse_error from public.raw_listing_records where id=${uuid(`raw:${i}:3`)}
          on conflict(source_fetch_id,source_listing_id,record_kind) do update set captured_at=excluded.captured_at returning id`;
        [storedSighting]=await tx`insert into public.listing_sightings(id,listing_id,crawl_run_id,search_query_id,source_fetch_id,
          raw_listing_record_id,crawl_kind,seen_at,page_number,position,source_list_id,source_status_label)
          select ${sighting},listing_id,crawl_run_id,search_query_id,${fetch.id},${storedRaw.id},crawl_kind,${at}::text::timestamptz,${page},
            position,source_list_id,source_status_label from public.listing_sightings where id=${uuid(`sighting:${i}:3`)}
          on conflict(crawl_run_id,listing_id,source_fetch_id) do update set raw_listing_record_id=excluded.raw_listing_record_id,
            seen_at=excluded.seen_at returning id`;
      } else {
        [storedRaw]=await tx`insert into compact.raw_rows(id,source_key,fetch_key,record_kind,context_key,url_key,
          payload_key,payload_index,source_payload_sha256,source_updated_date,parse_error,source_payload,source_html_fragment)
          select ${raw},source_key,${fetchKey.k},record_kind,${contextKey.k},url_key,payload_key,payload_index,
            source_payload_sha256,source_updated_date,parse_error,source_payload,source_html_fragment
          from compact.raw_rows where id=${uuid(`raw:${i}:3`)}
          on conflict(fetch_key,source_key,record_kind) do update set context_key=excluded.context_key returning id`;
        [storedSighting]=await tx`insert into compact.sighting_rows(id,listing_key,run_key,query_key,fetch_key,
          raw_listing_record_id,seen_at,context_key,position)
          select ${sighting},listing_key,run_key,query_key,${fetchKey.k},${storedRaw.id},${at}::text::timestamptz,${sightingContext.k},position
          from compact.sighting_rows where id=${uuid(`sighting:${i}:3`)}
          on conflict(run_key,listing_key,fetch_key) do update set raw_listing_record_id=excluded.raw_listing_record_id,
            seen_at=excluded.seen_at returning id`;
      }
      identities.push([storedRaw.id,storedSighting.id]);
    }
    return identities;
  });
}

export async function writeChecks() {
  const results:any={samples:{baseline:[],compact:[]},checks:{}};
  for(let n=0;n<6;n++) for(const layout of (n%2?['compact','baseline']:['baseline','compact']) as ('baseline'|'compact')[]) {
    const start=now();const ids=await writePage(layout,800000+n);
    assert.equal(ids.length,30);
    if(n>0) results.samples[layout].push(elapsed(start));
  }
  for(const layout of ['baseline','compact'] as const) {
    const original=await writePage(layout,810000);
    const retried=await writePage(layout,810000,1,"2026-08-07T07:00:00.000001Z");
    assert.deepEqual(retried,original,"Retry/late observation retains IDs and independent exact timestamp");
    const schema=layout==='baseline'?'public':'compact';
    const [late]=await sql.unsafe(`select count(*)::int as count from ${schema}.listing_sightings s
      join ${schema}.raw_listing_records r on r.id=s.raw_listing_record_id
      where s.source_fetch_id=$1 and s.seen_at='2026-08-07T07:00:00.000001Z'
        and r.captured_at='2026-08-07T07:00:00.000001Z'`,[uuid('write-fetch:810000')]);
    assert.equal(late.count,30);
    const census=()=>sql.unsafe(`select (select count(*) from public.source_fetches) as fetches,
      (select count(*) from ${schema}.raw_listing_records) as raw,
      (select count(*) from ${schema}.listing_sightings) as sightings`);
    const before=await census();
    const abortConnection={begin:(handler:any)=>sql.begin(async(tx:any)=>{
      await handler(tx);throw new Error('rollback canary');
    })};
    await assert.rejects(()=>writePage(layout,820000,0,undefined,abortConnection),/rollback canary/);
    assert.deepEqual(await census(),before,"The whole metadata page must roll back");
    const concurrent=[createSqlClient(target.toString(),1,30000),createSqlClient(target.toString(),1,30000)];
    try {
      const start=now();
      const [a,b]=await Promise.all(concurrent.map((c,i)=>writePage(layout,830000,i,"2026-10-03T18:00:00.000987Z",c)));
      results[`${layout}ConcurrentMs`]=elapsed(start);
      assert.deepEqual(a,b,"Concurrent duplicate pages return the winning original IDs");
      const [counts]=await sql.unsafe(`select count(*)::int as count from ${schema}.listing_sightings where source_fetch_id=$1`,[uuid('write-fetch:830000')]);
      assert.equal(counts.count,30);
    } finally {for(const c of concurrent) await c.end({timeout:5});}
  }
  for(const [table,conflict] of [['raw_rows','fetch_key,source_key,record_kind'],['sighting_rows','run_key,listing_key,fetch_key']]) {
    const cols=(await sql`select attname from pg_attribute where attrelid=${`compact.${table}`}::regclass and attnum>0 and not attisdropped order by attnum`).map((r:any)=>r.attname);
    await assert.rejects(()=>sql.begin((tx:any)=>tx.unsafe(`insert into compact.${table} select ${cols.map((c:string)=>c==='id'?'gen_random_uuid()':c).join(',')} from compact.${table} limit 1`)),(e:any)=>e.code==='23505',conflict);
  }
  await assert.rejects(()=>sql.begin((tx:any)=>tx`update compact.raw_rows set payload_key=-1 where id=${uuid('raw:0:0')}`),(e:any)=>e.code==='23503');
  await assert.rejects(()=>sql.begin((tx:any)=>tx`update compact.raw_rows set payload_index=null where id=${uuid('raw:0:0')}`),(e:any)=>e.code==='23514');
  results.checks={identityPreservingRetries:2,lateMicrosecondTimestamp:true,duplicateRejections:2,foreignKeyRejections:1,evidenceConstraintRejections:1,rolledBackPages:2,concurrentWriterPairs:2};
  return results;
}
