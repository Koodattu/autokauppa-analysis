// Opt-in disposable database experiment. Application code and migrations are unchanged.
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { createSqlClient } from "../../packages/db/src/index";
import { packStorageValue, unpackStorageValue, type RawEvidenceEntry } from "../../packages/domain/src/storage-codec";
import { getPriceResearch } from "../../packages/domain/src/research";
import { getPublicListingDetail, getAnalyticsTimeSeries } from "../../packages/domain/src/product";
import { readRawEvidence } from "../../packages/domain/src/storage";
import { listingFiltersQuerySchema, listingSearchQuerySchema } from "../../packages/schemas/src/index";

const target = new URL(process.env.PROTOTYPE_DATABASE_URL ?? "http://invalid");
if (target.hostname !== "127.0.0.1" || target.pathname !== "/nettiauto_observation_prototype_test") {
  throw new Error("Only the dedicated disposable localhost database is accepted");
}
const sql: any = createSqlClient(target.toString(), 1, 30000);
const root = resolve(import.meta.dir, "../..");
const directory = process.env.PROTOTYPE_DIRECTORY!;
const result: any = { runtime: { bun: Bun.version }, checks: {}, metadata: {}, evidence: {} };
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const uuid = (s: string) => { const x=hash(s); return `${x.slice(0,8)}-${x.slice(8,12)}-4${x.slice(13,16)}-8${x.slice(17,20)}-${x.slice(20,32)}`; };
const json = (value: unknown) => sql.json(value);
const progress = (stage: string) => console.log(JSON.stringify({stage}));
const now = () => performance.now();
const elapsed = (start: number) => +(now()-start).toFixed(2);
const chunks = <T>(rows: T[], size=250): T[][] => Array.from({length: Math.ceil(rows.length/size)}, (_,i)=>rows.slice(i*size,(i+1)*size));
async function insert(table: string, rows: any[]) {
  for (const batch of chunks(rows)) if (batch.length) await sql`insert into ${sql(table)} ${sql(batch,Object.keys(batch[0]))}`;
}
async function size(schema: string, only?: string[]) {
  return sql`select c.relname as name,pg_total_relation_size(c.oid)::bigint as total,
    pg_relation_size(c.oid)::bigint as heap,pg_indexes_size(c.oid)::bigint as indexes,
    case when c.reltoastrelid=0 then 0 else pg_total_relation_size(c.reltoastrelid) end::bigint as toast
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname=${schema} and c.relkind in ('r','S')
      and (${only===undefined} or c.relname=any(${only??[]}::text[])) order by c.relname`;
}
const total = (rows: any[])=>rows.reduce((sum,r)=>sum+Number(r.total),0);
async function timed(action:()=>Promise<unknown>, repeats=9) {
  await action(); // warm both planner and buffers before recorded measurements
  const samples=[];
  for (let i=0;i<repeats;i++) { const start=now(); await action(); samples.push(elapsed(start)); }
  samples.sort((a,b)=>a-b);
  return {medianMs:samples[Math.floor(samples.length/2)],p95Ms:samples[Math.ceil(samples.length*.95)-1],samplesMs:samples};
}

type Observation = { raw:any; sighting:any|null; pair:RawEvidenceEntry; kind:string; period:number; listing:string };
const observations: Observation[]=[];
const fetches:any[]=[], runs:any[]=[], listings:any[]=[], snapshots:any[]=[], payloads:any[]=[], queries:any[]=[];
const dates=["2026-07-08T10:00:00.000123Z","2026-08-08T10:00:00.000123Z","2026-09-08T10:00:00.000123Z","2026-10-03T10:00:00.000123Z"];
const LISTINGS=4000;
function fixture() {
  for (const kind of ["current","sold"]) {
    const queryId=uuid(`query:${kind}`);
    queries.push({id:queryId,source:"nettiauto",vehicle_category:"passenger_car",crawl_kind:kind,
      entry_path:"/fixture",source_search_hash:kind,enabled:false});
    for (let p=0;p<4;p++) runs.push({id:uuid(`run:${kind}:${p}`),source:"nettiauto",search_query_id:queryId,
      crawl_kind:kind,vehicle_category:"passenger_car",status:"completed",started_at:dates[p],finished_at:dates[p],
      is_complete:true,expected_page_count:Math.ceil(LISTINGS/2/30),fetched_page_count:Math.ceil(LISTINGS/2/30)});
  }
  for (let i=0;i<LISTINGS;i++) {
    const kind=i<LISTINGS/2?"current":"sold", listing=uuid(`listing:${i}`), sourceId=String(9_000_000+i);
    const queryId=uuid(`query:${kind}`), availability=kind==="current"?"active":"sold";
    for (let p=0;p<4;p++) {
      const page=Math.floor((i%(LISTINGS/2))/30)+1,fetchId=uuid(`fetch:${kind}:${p}:${page}`),rawId=uuid(`raw:${i}:${p}`);
      if (!fetches.some(f=>f.id===fetchId)) fetches.push({id:fetchId,crawl_run_id:uuid(`run:${kind}:${p}`),
        detail_backfill_run_id:null,search_query_id:queryId,source:"nettiauto",fetch_kind:"search_result_page",page_number:page,
        attempt_number:1,source_url:`https://example.invalid/search/${kind}/${page}`,request_headers:json({profile:"synthetic"}),
        response_status:200,response_body_shape:"ajax_json",fetched_at:dates[p]});
      const revision=p<2?0:1,price=10_000+(i%60)*500-revision*500;
      const pair:RawEvidenceEntry=[`{"sourceId":"${sourceId}","price":${price},"largeInteger":900719925474099312345,"equipment":"${"synthetic equipment;".repeat(40)}"}`,
        `<article data-source="${sourceId}" data-price="${price}">${"<span>Synthetic listing equipment and seller text.</span>".repeat(70)}${i%5===0&&p===3?"<!-- changed HTML only -->":""}</article>`];
      observations.push({kind,period:p,listing,pair,raw:{id:rawId,source:"nettiauto",source_listing_id:sourceId,
        crawl_run_id:uuid(`run:${kind}:${p}`),detail_backfill_run_id:null,source_fetch_id:fetchId,record_kind:"search_result_card",
        source_url:`https://example.invalid/car/${sourceId}`,source_payload:null,source_html_fragment:null,payload_digest:null,payload_index:null,
        source_payload_sha256:Buffer.from(hash(pair[0]),"hex"),source_updated_date:null,parser_version:"synthetic-search-v1",
        parser_status:"parsed",captured_at:dates[p],parse_error:null},sighting:{id:uuid(`sighting:${i}:${p}`),listing_id:listing,
        crawl_run_id:uuid(`run:${kind}:${p}`),search_query_id:queryId,source_fetch_id:fetchId,raw_listing_record_id:rawId,
        crawl_kind:kind,seen_at:dates[p],page_number:page,position:i%30,source_list_id:kind,source_status_label:availability}});
      snapshots.push({id:uuid(`snapshot:${i}:${p}`),listing_id:listing,raw_listing_record_id:rawId,parser_version:"synthetic-search-v1",
        observed_at:dates[p],availability,source_status_label:availability,asking_price_eur:kind==="current"?price:null,
        observed_sold_price_eur:kind==="sold"?price:null,mileage_km:40_000+(i%20)*10_000+p*1000,year_model:2015+i%10,
        make_source_label:i%2?"Toyota":"Volvo",model_source_label:i%2?"Corolla":"V60",fuel_type_source_label:"Petrol",
        transmission_source_label:"Automatic",body_type_source_label:"Estate",seller_type_source_label:"Dealer",seller_source_label:"Synthetic",
        normalized_data:json({sourceLocationLabel:"Synthetic Helsinki"}),change_hash:hash(`${i}:${p}`),created_at:dates[p]});
    }
    listings.push({id:listing,source:"nettiauto",source_listing_id:sourceId,vehicle_category:"passenger_car",
      canonical_source_url:`https://example.invalid/car/${sourceId}`,current_availability:availability,first_seen_at:dates[0],
      last_seen_at:dates[3],availability_last_confirmed_at:dates[3],last_raw_listing_record_id:uuid(`raw:${i}:3`)});
    // Detail fetches are intentionally one observation per context: prevents overstating shared-context savings.
    const fetchId=uuid(`detail-fetch:${i}`),rawId=uuid(`detail-raw:${i}`);
    fetches.push({id:fetchId,crawl_run_id:uuid(`run:${kind}:3`),detail_backfill_run_id:null,search_query_id:queryId,source:"nettiauto",
      fetch_kind:"detail_page",page_number:null,attempt_number:1,source_url:`https://example.invalid/car/${sourceId}`,
      request_headers:json({profile:"synthetic"}),response_status:200,response_body_shape:"html_document",fetched_at:dates[3]});
    const pair:RawEvidenceEntry=[`{"id":"${sourceId}","detail":true}`,`<section>${sourceId}: ${"synthetic detail; ".repeat(300)}</section>`];
    observations.push({kind,period:3,listing,pair,sighting:null,raw:{id:rawId,source:"nettiauto",source_listing_id:sourceId,
      crawl_run_id:uuid(`run:${kind}:3`),detail_backfill_run_id:null,source_fetch_id:fetchId,record_kind:"detail_page",
      source_url:`https://example.invalid/car/${sourceId}`,source_payload:null,source_html_fragment:null,payload_digest:null,payload_index:null,
      source_payload_sha256:Buffer.from(hash(pair[0]),"hex"),source_updated_date:null,parser_version:"synthetic-detail-v4",
      parser_status:"parsed",captured_at:dates[3],parse_error:null}});
  }
  // The current packed baseline: page bundles for crawls and singleton detail bundles.
  const groups=new Map<string,Observation[]>();
  for (const o of observations) groups.set(o.raw.source_fetch_id,[...(groups.get(o.raw.source_fetch_id)??[]),o]);
  for (const group of groups.values()) {
    const packed=packStorageValue(group.map(o=>o.pair));
    payloads.push({digest:Buffer.from(packed.digest,"hex"),codec:packed.codec,decoded_bytes:packed.decodedBytes,
      record_count:group.length,content:packed.content});
    group.forEach((o,i)=>{o.raw.payload_digest=Buffer.from(packed.digest,"hex");o.raw.payload_index=i;});
  }
}

async function migrate() {
  const [exists]=await sql`select count(*)::int as count from pg_tables where schemaname='public'`;
  assert.equal(exists.count,0,"Refusing to reuse nonempty database");
  for (const file of readdirSync(resolve(root,"packages/db/drizzle")).filter(f=>/^\d+.*\.sql$/.test(f)).sort()) {
    for (const statement of readFileSync(resolve(root,"packages/db/drizzle",file),"utf8").split("--> statement-breakpoint")) {
      await sql.begin(async (tx:any)=>tx.unsafe(statement));
    }
  }
  result.runtime.postgres=(await sql`select version() as version`)[0].version;
}

async function seed() {
  await insert("source_search_queries",queries); await insert("crawl_runs",runs); await insert("source_fetches",fetches);
  await insert("raw_listing_payloads",[...new Map(payloads.map(p=>[p.digest.toString('hex'),p])).values()]); await insert("raw_listing_records",observations.map(o=>o.raw));
  await insert("listings",listings); await insert("listing_sightings",observations.flatMap(o=>o.sighting?[o.sighting]:[]));
  await insert("listing_snapshots",snapshots);
  await sql`update listings l set latest_snapshot_id=s.id from listing_snapshots s where s.listing_id=l.id and s.observed_at=${dates[3]}`;
  // Same-time competing snapshot: historical choice must prefer the exact observation's raw ID.
  for (let i=0;i<8;i++) await sql`insert into listing_snapshots(id,listing_id,raw_listing_record_id,parser_version,observed_at,
    availability,asking_price_eur,normalized_data,change_hash,created_at)
    values(${uuid(`tie:${i}`)},${uuid(`listing:${i}`)},${uuid(`raw:${i}:0`)},'synthetic-tie',${dates[2]},'active',999999,'{}','tie',${dates[3]})`;
  await sql`insert into storage_migration_progress(stage,status,error_count) values('legacy_images','completed',0)`;
  for (let i=0;i<8;i++) {
    const listingId=uuid(`listing:${i}`), rawRecordId=uuid(`raw:${i}:3`);
    const images=[0,1].map(position=>({id:uuid(`image:${i}:${position}`),listingId,source:"nettiauto",
      imageUrl:`https://images.nettiauto.com/live/synthetic-prototype/${i}/${position}-large.jpg`,role:"gallery",position,width:640,height:480,
      firstSeenAt:dates[0],lastSeenAt:dates[3],rawRecordId,recordKind:"search_result_card",capturedAt:dates[3]}));
    const p=packStorageValue(images);
    await insert("listing_legacy_image_bundles",[{listing_id:listingId,digest:p.digest,codec:p.codec,decoded_bytes:p.decodedBytes,row_count:2,content:p.content}]);
  }
  await sql.unsafe("analyze"); // local disposable DB only
}

async function eligible(client:any=sql) {
  const [r]=await client`select
    (select count(*) from public.raw_listing_records r join public.source_fetches f on f.id=r.source_fetch_id
      where (r.crawl_run_id,r.detail_backfill_run_id) is distinct from (f.crawl_run_id,f.detail_backfill_run_id))::int as raw,
    (select count(*) from public.listing_sightings s join public.source_fetches f on f.id=s.source_fetch_id
      left join public.crawl_runs cr on cr.id=f.crawl_run_id
      where (s.crawl_run_id,s.search_query_id,s.crawl_kind,s.page_number) is distinct from
      (f.crawl_run_id,f.search_query_id,cr.crawl_kind,f.page_number))::int as sightings`;
  return r.raw===0&&r.sightings===0;
}

async function candidate() {
  assert(await eligible(),"Cannot normalize inconsistent context; do not silently correct history");
  await sql.unsafe("create schema candidate; set search_path=candidate,public");
  const tables=await sql`select tablename from pg_tables where schemaname='public' order by tablename`;
  for (const {tablename} of tables) {
    const name=tablename==="raw_listing_records"?"raw_metadata":tablename==="listing_sightings"?"sighting_metadata":tablename;
    await sql.unsafe(`create table candidate.${name}(like public.${tablename} including all)`);
  }
  await sql.unsafe(`alter table candidate.source_fetches add column fetch_key bigint generated always as identity;
    create unique index fetch_key_unique on candidate.source_fetches(fetch_key);
    create index fetch_run_lookup on candidate.source_fetches(crawl_run_id,fetch_key);
    create index fetch_query_time_lookup on candidate.source_fetches(search_query_id,fetched_at,fetch_key);
    alter table candidate.raw_metadata drop column crawl_run_id,drop column detail_backfill_run_id,drop column source_fetch_id;
    alter table candidate.raw_metadata add column fetch_key bigint not null references candidate.source_fetches(fetch_key);
    create unique index raw_fetch_listing_kind_unique on candidate.raw_metadata(fetch_key,source_listing_id,record_kind);
    alter table candidate.sighting_metadata drop column crawl_run_id,drop column search_query_id,drop column source_fetch_id,
      drop column crawl_kind,drop column page_number;
    alter table candidate.sighting_metadata add column fetch_key bigint not null references candidate.source_fetches(fetch_key);
    create unique index sighting_fetch_listing_unique on candidate.sighting_metadata(fetch_key,listing_id);
    create index sighting_raw_lookup on candidate.sighting_metadata(raw_listing_record_id);
    alter table candidate.sighting_metadata add foreign key(raw_listing_record_id) references candidate.raw_metadata(id);
    alter table candidate.raw_metadata add foreign key(payload_digest) references candidate.raw_listing_payloads(digest);`);
  for (const {tablename} of tables) {
    if (["raw_listing_records","listing_sightings"].includes(tablename)) continue;
    await sql.unsafe(`insert into candidate.${tablename} select * from public.${tablename}`);
  }
  for (const [original,narrow] of [["raw_listing_records","raw_metadata"],["listing_sightings","sighting_metadata"]]) {
    const columns=(await sql`select attname from pg_attribute where attrelid=${`candidate.${narrow}`}::regclass and attnum>0 and not attisdropped order by attnum`).map((r:any)=>r.attname);
    await sql.unsafe(`insert into candidate.${narrow}(${columns.join(",")}) select ${columns.map((c:string)=>c==="fetch_key"?"f.fetch_key":`r.${c}`).join(",")}
      from public.${original} r join candidate.source_fetches f on f.id=r.source_fetch_id`);
    const originalCols=(await sql`select attname from pg_attribute where attrelid=${`public.${original}`}::regclass and attnum>0 and not attisdropped order by attnum`).map((r:any)=>r.attname);
    const derived:Record<string,string>=original==="raw_listing_records"?
      {crawl_run_id:"f.crawl_run_id",detail_backfill_run_id:"f.detail_backfill_run_id",source_fetch_id:"f.id"}:
      {crawl_run_id:"f.crawl_run_id",search_query_id:"f.search_query_id",source_fetch_id:"f.id",crawl_kind:"cr.crawl_kind",page_number:"f.page_number"};
    await sql.unsafe(`create view candidate.${original} as select ${originalCols.map((c:string)=>`${derived[c]??`r.${c}`} as ${c}`).join(",")}
      from candidate.${narrow} r join candidate.source_fetches f on f.fetch_key=r.fetch_key
      ${original==="listing_sightings"?"join candidate.crawl_runs cr on cr.id=f.crawl_run_id":""}`);
  }
  // Re-establish every unaffected FK; LIKE copies indexes/checks, but not foreign keys.
  const fks=await sql`select t.relname,c.conname,pg_get_constraintdef(c.oid) as definition
    from pg_constraint c join pg_class t on t.oid=c.conrelid where c.contype='f' and t.relnamespace='public'::regnamespace`;
  for (const fk of fks) {
    if (["raw_listing_records","listing_sightings"].includes(fk.relname)) continue;
    let definition=fk.definition.replaceAll("public.","candidate.").replace(/REFERENCES (?:candidate\.)?raw_listing_records/g,"REFERENCES candidate.raw_metadata");
    await sql.unsafe(`alter table candidate.${fk.relname} add constraint ${fk.conname} ${definition}`);
  }
  await sql.unsafe(`alter table candidate.sighting_metadata add foreign key(listing_id) references candidate.listings(id);
    create function candidate.protect_fetch_context() returns trigger language plpgsql as $$
    begin
      if (new.crawl_run_id,new.detail_backfill_run_id,new.search_query_id,new.page_number)
        is distinct from (old.crawl_run_id,old.detail_backfill_run_id,old.search_query_id,old.page_number) then
        raise exception 'Referenced context must be versioned, never changed in place' using errcode='23514';
      end if; return new;
    end $$;
    create trigger immutable_fetch_context before update on candidate.source_fetches
      for each row execute function candidate.protect_fetch_context();
    create function candidate.protect_run_kind() returns trigger language plpgsql as $$
    begin if new.crawl_kind is distinct from old.crawl_kind then
      raise exception 'Crawl kind is part of preserved observation context' using errcode='23514';
    end if; return new; end $$;
    create trigger immutable_run_kind before update on candidate.crawl_runs
      for each row execute function candidate.protect_run_kind();`);
  await sql.unsafe("analyze; set search_path=public");
}

async function verifyMetadata() {
  for (const table of ["raw_listing_records","listing_sightings"]) {
    const [r]=await sql.unsafe(`select count(*)::int as differences from (
      (select to_jsonb(r) from public.${table} r except all select to_jsonb(r) from candidate.${table} r)
      union all (select to_jsonb(r) from candidate.${table} r except all select to_jsonb(r) from public.${table} r)) d`);
    assert.equal(r.differences,0,`${table} exact reconstruction`);
  }
  const [tie]=await sql`select s.asking_price_eur from candidate.listing_sightings sighting
    join lateral(select * from candidate.listing_snapshots s where s.listing_id=sighting.listing_id and s.observed_at<=sighting.seen_at
      order by s.observed_at desc,(s.raw_listing_record_id=sighting.raw_listing_record_id) desc,s.created_at desc,s.id desc limit 1) s on true
    where sighting.id=${uuid("sighting:0:2")}`;
  assert.equal(tie.asking_price_eur,9500,"Exact raw observation wins a timestamp tie");
  let duplicateChecks=0;
  for (const table of ["raw_metadata","sighting_metadata"]) {
    try {
      await sql.begin(async(tx:any)=>{
        const columns=(await tx`select attname from pg_attribute where attrelid=${`candidate.${table}`}::regclass and attnum>0 and not attisdropped order by attnum`).map((r:any)=>r.attname);
        await tx.unsafe(`insert into candidate.${table} select ${columns.map((c:string)=>c==="id"?"gen_random_uuid()":c).join(",")} from candidate.${table} limit 1`);
        throw new Error("Uniqueness did not reject a duplicate observation");
      });
    } catch (e:any) { assert.equal(e.code,"23505"); duplicateChecks++; }
    await sql.begin(async(tx:any)=>{
      const columns=(await tx`select attname from pg_attribute where attrelid=${`candidate.${table}`}::regclass and attnum>0 and not attisdropped order by attnum`).map((r:any)=>r.attname);
      const [original]=await tx.unsafe(`select id from candidate.${table} order by id limit 1`);
      const conflict=table==='raw_metadata'?'fetch_key,source_listing_id,record_kind':'fetch_key,listing_id';
      const [retried]=await tx.unsafe(`insert into candidate.${table}
        select ${columns.map((c:string)=>c==='id'?'gen_random_uuid()':c).join(',')} from candidate.${table} where id=$1
        on conflict(${conflict}) do update set fetch_key=excluded.fetch_key returning id`,[original.id]);
      assert.equal(retried.id,original.id,"Retry must preserve original observation identity");
      throw new Error('retry rollback');
    }).catch((e:any)=>assert.equal(e.message,'retry rollback'));
  }
  await sql.begin(async(tx:any)=>{
    await tx`update public.listing_sightings set page_number=999999 where id=${uuid("sighting:0:0")}`;
    assert.equal(await eligible(tx),false); throw new Error("intentional rollback");
  }).catch((e:any)=>assert.equal(e.message,"intentional rollback"));
  assert(await eligible());
  let foreignKeyChecks=0, immutableChecks=0;
  for (const statement of [
    `update candidate.raw_metadata set payload_digest=decode(repeat('00',32),'hex') where id='${uuid("raw:0:0")}'`,
    `update candidate.sighting_metadata set listing_id='${uuid("nonexistent-listing")}' where id='${uuid("sighting:0:0")}'`,
  ]) {
    await assert.rejects(()=>sql.begin((tx:any)=>tx.unsafe(statement)),(e:any)=>e.code==='23503'); foreignKeyChecks++;
  }
  for (const statement of [
    `update candidate.source_fetches set page_number=999999 where id='${uuid("fetch:current:0:1")}'`,
    `update candidate.crawl_runs set crawl_kind='sold' where id='${uuid("run:current:0")}'`,
  ]) {
    await assert.rejects(()=>sql.begin((tx:any)=>tx.unsafe(statement)),(e:any)=>e.code==='23514'); immutableChecks++;
  }
  result.checks.exactMetadataRows=observations.length+observations.filter(o=>o.sighting).length;
  result.checks.uniquenessRejections=duplicateChecks;
  result.checks.identityPreservingRetries=2;
  result.checks.timestampTieAndContextMismatch=true;
  result.checks.foreignKeyRejections=foreignKeyChecks;
  result.checks.immutableContextRejections=immutableChecks;
}

async function appChecks() {
  const other:any=createSqlClient(target.toString(),1,30000);
  await other.unsafe("set search_path=candidate,public; set max_parallel_workers_per_gather=0");
  try {
    let comparisons=0;
    const queriesToTest:any[]=[];
    for (const availability of ["current","sold","all"]) for (const date of [undefined,"2026-08-31","2026-09-30"]) {
      queriesToTest.push(listingSearchQuerySchema.parse({availability,from:date?"2026-07-01":undefined,to:date,make:"Toyota",priceMin:10000,mileageMax:160000,sort:"priceAsc"}));
      queriesToTest.push(listingSearchQuerySchema.parse({availability,from:date?"2026-07-01":undefined,to:date,sort:"lastSeenDesc"}));
    }
    for (const query of queriesToTest) { assert.deepEqual(await getPriceResearch(other,query),await getPriceResearch(sql,query)); comparisons++; }
    for (const availability of ["current","sold","all"]) {
      const q=listingFiltersQuerySchema.parse({availability,from:"2026-07-01",to:"2026-10-04",interval:"month"});
      assert.deepEqual(await getAnalyticsTimeSeries(other,q),await getAnalyticsTimeSeries(sql,q)); comparisons++;
    }
    for (let i=0;i<8;i++) {
      const a=await getPublicListingDetail(sql,uuid(`listing:${i}`));
      assert(a && a.imageMetadata.length===2,"Legacy gallery fallback must actually be exercised");
      assert.deepEqual(await getPublicListingDetail(other,uuid(`listing:${i}`)),a); comparisons++;
    }
    result.checks.applicationResponseComparisons=comparisons;
    let rawChecks=0;
    for (const o of observations.filter((_,i)=>i%191===0)) { assert.deepEqual(await readRawEvidence(other,o.raw.id),o.pair); rawChecks++; }
    result.checks.applicationRawRecoveryComparisons=rawChecks;
    const history=listingSearchQuerySchema.parse({availability:"all",from:"2026-07-01",to:"2026-09-30",make:"Toyota",priceMin:10000});
    result.metadata.reads={};
    for (const [name,client] of [["baseline",sql],["candidate",other]] as const) {
      result.metadata.reads[name]={
        listingHistory:await timed(()=>client`select id,raw_listing_record_id,seen_at from listing_sightings where listing_id=${uuid("listing:500")} order by seen_at desc,id`),
        runResearch:await timed(()=>getPriceResearch(client,history),5),
        runCount:await timed(()=>client`select count(*) from listing_sightings where crawl_run_id=${uuid("run:current:2")}`),
        queryListingHistory:await timed(()=>client`select id,seen_at from listing_sightings where search_query_id=${uuid("query:current")} and listing_id=${uuid("listing:500")} and seen_at>${dates[0]} order by seen_at desc`),
      };
    }
  } finally { await other.end(); }
}

async function evidenceExperiment(label:string, corpus:Observation[]) {
  const ordered=[...corpus].sort((a,b)=>a.raw.id.localeCompare(b.raw.id));
  const exact=new Map<string,{id:number;pair:RawEvidenceEntry}>();
  const refs:any[]=[];
  const startHash=now();
  for (const o of ordered) {
    const digest=hash(JSON.stringify(o.pair)), found=exact.get(digest);
    if (found) assert.deepEqual(found.pair,o.pair,"Digest collision must not merge different JSON/HTML");
    else exact.set(digest,{id:exact.size+1,pair:o.pair});
    refs.push({raw_id:o.raw.id,evidence_id:exact.get(digest)!.id});
  }
  const hashMs=elapsed(startHash), metrics:any={rows:corpus.length,uniquePairs:exact.size,duplicateRows:corpus.length-exact.size,hashAndCompareMs:hashMs};
  const schemas=[`${label}_page`,`${label}_batch`,`${label}_dedup`];
  for (const schema of schemas) {
    await sql.unsafe(`create schema ${schema};
      create table ${schema}.bundles(digest bytea primary key,codec text not null,decoded_bytes int not null,record_count int not null,content bytea not null);
      alter table ${schema}.bundles alter column content set storage external;`);
    if (schema.endsWith("dedup")) await sql.unsafe(`create table ${schema}.dictionary(id bigint primary key,exact_digest bytea not null unique,
      bundle_digest bytea not null references ${schema}.bundles(digest),entry_index int not null);
      create index dictionary_bundle_lookup on ${schema}.dictionary(bundle_digest);
      create table ${schema}.locators(raw_id uuid primary key,evidence_id bigint not null references ${schema}.dictionary(id));
      create index locator_evidence_lookup on ${schema}.locators(evidence_id);`);
    else await sql.unsafe(`create table ${schema}.locators(raw_id uuid primary key,bundle_digest bytea not null references ${schema}.bundles(digest),entry_index int not null);
      create index locator_bundle_lookup on ${schema}.locators(bundle_digest);`);
    const dedup=schema.endsWith("dedup"), page=schema.endsWith("page"), groups=new Map<string,Observation[]>();
    if (page) for(const o of ordered) groups.set(o.raw.source_fetch_id,[...(groups.get(o.raw.source_fetch_id)??[]),o]);
    const entries=dedup?[...exact.entries()].map(([digest,e])=>({digest,...e})):ordered;
    const batches:any[][]=page?[...groups.values()]:chunks<(typeof entries)[number]>(entries,250);
    const bundleRows:any[]=[], locations:any[]=[], dictionaries:any[]=[];
    const packStart=now();
    for (const batch of batches) {
      const pairs=batch.map(o=>o.pair),packed=packStorageValue(pairs);
      assert.deepEqual(unpackStorageValue(packed),pairs);
      const digest=Buffer.from(packed.digest,"hex");
      bundleRows.push({digest,codec:packed.codec,decoded_bytes:packed.decodedBytes,record_count:batch.length,content:packed.content});
      batch.forEach((o,i)=>dedup?dictionaries.push({id:o.id,exact_digest:Buffer.from(o.digest,"hex"),bundle_digest:digest,entry_index:i}):
        locations.push({raw_id:o.raw.id,bundle_digest:digest,entry_index:i}));
    }
    const packingMs=elapsed(packStart),loadStart=now();
    await insert(`${schema}.bundles`,[...new Map(bundleRows.map(p=>[p.digest.toString('hex'),p])).values()]);
    if(dedup) await insert(`${schema}.dictionary`,dictionaries);
    await insert(`${schema}.locators`,dedup?refs:locations);
    const loadMs=elapsed(loadStart);
    await sql.unsafe(`analyze ${schema}.bundles; analyze ${schema}.locators`);
    const read=async(id:string)=>{
      const [r]=await sql.unsafe(dedup?`select encode(b.digest,'hex') as digest,b.codec,b.decoded_bytes as "decodedBytes",b.content,d.entry_index as index
        from ${schema}.locators l join ${schema}.dictionary d on d.id=l.evidence_id join ${schema}.bundles b on b.digest=d.bundle_digest where l.raw_id=$1`:
        `select encode(b.digest,'hex') as digest,b.codec,b.decoded_bytes as "decodedBytes",b.content,l.entry_index as index
         from ${schema}.locators l join ${schema}.bundles b on b.digest=l.bundle_digest where l.raw_id=$1`,[id]);
      return (unpackStorageValue(r) as any[])[r.index];
    };
    // Full reconstruction from stored bytes and actual SQL locator mappings, once per bundle.
    const stored=await sql.unsafe(`select encode(digest,'hex') as digest,codec,decoded_bytes as "decodedBytes",content from ${schema}.bundles`);
    const decoded=new Map(stored.map((p:any)=>[p.digest,unpackStorageValue(p)]));
    const maps=await sql.unsafe(dedup?`select l.raw_id,encode(d.bundle_digest,'hex') as digest,d.entry_index as index from ${schema}.locators l join ${schema}.dictionary d on d.id=l.evidence_id`:
      `select raw_id,encode(bundle_digest,'hex') as digest,entry_index as index from ${schema}.locators`);
    const expected=new Map(ordered.map(o=>[o.raw.id,o.pair]));
    assert.equal(maps.length,ordered.length);
    for(const row of maps) assert.deepEqual((decoded.get(row.digest) as any[])[row.index],expected.get(row.raw_id));
    metrics[page?"pageBaseline":dedup?"dedup":"batch250Baseline"]={packingMs,loadMs,structures:await size(schema),
      read:await timed(()=>read(ordered[Math.floor(ordered.length/2)].raw.id)),verifiedRows:maps.length};
    const m=metrics[page?"pageBaseline":dedup?"dedup":"batch250Baseline"];
    m.totalBytes=total(m.structures);
  }
  return metrics;
}

async function writes() {
  result.metadata.writes={};
  for (const schema of ["public","candidate"]) {
    // One new 30-card fetch in one transaction, including fetch context allocation and all indexes.
    let iteration=0;
    result.metadata.writes[schema]=await timed(async()=>{
        const page=999999+iteration++;
        await sql.begin(async(tx:any)=>{
          const [f]=await tx.unsafe(`insert into ${schema}.source_fetches(crawl_run_id,search_query_id,source,fetch_kind,page_number,source_url,response_body_shape,fetched_at)
            values($1,$2,'nettiauto','search_result_page',$4,'https://example.invalid/new','ajax_json',$3) returning *`,[uuid("run:current:3"),uuid("query:current"),dates[3],page]);
          for (let i=0;i<30;i++) {
            const raw=uuid(`write-raw:${schema}:${page}:${i}`),sighting=uuid(`write-sighting:${schema}:${page}:${i}`),listing=uuid(`listing:${i}`),base=observations.find(o=>o.raw.id===uuid(`raw:${i}:3`))!;
            if(schema==="public") {
              await tx`insert into public.raw_listing_records(id,source,source_listing_id,crawl_run_id,source_fetch_id,record_kind,payload_digest,payload_index,source_payload_sha256,parser_version,parser_status,captured_at)
                values(${raw},'nettiauto',${String(9_000_000+i)},${f.crawl_run_id},${f.id},'search_result_card',${base.raw.payload_digest},${base.raw.payload_index},${base.raw.source_payload_sha256},'synthetic','parsed',${dates[3]})`;
              await tx`insert into public.listing_sightings(id,listing_id,crawl_run_id,search_query_id,source_fetch_id,raw_listing_record_id,crawl_kind,seen_at,page_number)
                values(${sighting},${listing},${f.crawl_run_id},${f.search_query_id},${f.id},${raw},'current',${dates[3]},${page})`;
            } else {
              await tx`insert into candidate.raw_metadata(id,source,source_listing_id,fetch_key,record_kind,payload_digest,payload_index,source_payload_sha256,parser_version,parser_status,captured_at)
                values(${raw},'nettiauto',${String(9_000_000+i)},${f.fetch_key},'search_result_card',${base.raw.payload_digest},${base.raw.payload_index},${base.raw.source_payload_sha256},'synthetic','parsed',${dates[3]})`;
              await tx`insert into candidate.sighting_metadata(id,listing_id,fetch_key,raw_listing_record_id,seen_at) values(${sighting},${listing},${f.fetch_key},${raw},${dates[3]})`;
            }
          }
        });
    },5);
  }
}

try {
  await sql.unsafe("set max_parallel_workers_per_gather=0; set client_min_messages=warning");
  progress("migrate-and-generate-synthetic"); await migrate(); fixture();
  progress("load-identical-baseline"); await seed();
  result.fixture={listings:LISTINGS,observations:observations.length,sightings:observations.filter(o=>o.sighting).length,fetches:fetches.length,runs:runs.length,
    note:"Synthetic four-crawl current/sold panel; 20% of raw observations are singleton detail fetches. No production contents."};
  progress("build-shared-context-candidate"); const buildStart=now();await candidate();result.metadata.buildMs=elapsed(buildStart);
  await verifyMetadata();
  result.metadata.baseline=await size("public",["raw_listing_records","listing_sightings","source_fetches"]);
  result.metadata.candidate=await size("candidate",["raw_metadata","sighting_metadata","source_fetches","source_fetches_fetch_key_seq"]);
  result.metadata.baselineBytes=total(result.metadata.baseline);result.metadata.candidateBytes=total(result.metadata.candidate);
  result.metadata.scope="Raw metadata, sightings, full fetch table with all indexes, and identity sequence. Unchanged tables excluded equally; no credit for copy-induced compaction elsewhere.";
  progress("verify-application-and-measure-reads");await appChecks();
  progress("measure-transaction-writes");await writes();
  progress("measure-exact-evidence-deduplication");result.evidence.synthetic=await evidenceExperiment("ev",observations);
  // Explicitly prove that the equality key includes HTML, null/empty distinctions and original JSON text.
  const edgePairs:RawEvidenceEntry[]=[["{\"n\":900719925474099312345}","<b>A</b>"],["{\"n\":900719925474099312345}","<b>B</b>"],["{}",null],["{}",""]];
  assert.equal(new Set(edgePairs.map(p=>hash(JSON.stringify(p)))).size,4);
  assert.deepEqual(unpackStorageValue(packStorageValue(edgePairs)),edgePairs);
  result.checks.exactHtmlNullAndLargeInteger=true;
  result.limits={coldCacheTested:false,concurrentWritersTested:false,productionWrites:false,fullClone:false,
    note:"Warm single-client local measurements on fresh synthetic tables; no filesystem reclamation performed. Context eligibility requires a future production census."};
  writeFileSync(resolve(directory,"results.json"),JSON.stringify(result,null,2));
  console.log(JSON.stringify({fixture:result.fixture,checks:result.checks,metadata:result.metadata,
    evidence:result.evidence,limits:result.limits}));
} finally { await sql.end({timeout:5}); }
