// Synthetic fixture reused from the October 5 experiment, scaled with per-fetch timestamps.
// No production data. This module has no main entry point.
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
import { packStorageValue, type RawEvidenceEntry } from "../../packages/domain/src/storage-codec";

const target = new URL(process.env.PROTOTYPE_DATABASE_URL ?? "http://invalid");
if (target.hostname !== "127.0.0.1" || target.pathname !== "/nettiauto_observation_prototype_test") {
  throw new Error("Only the dedicated disposable localhost database is accepted");
}
// The default postgres-js timestamp serializer rounds strings through Date.
// Synthetic historical timestamps must reach PostgreSQL with their microseconds.
const driver=createRequire(resolve(import.meta.dir,"../../packages/db/package.json"))("postgres");
const postgres=driver.default??driver;
const sql: any = postgres(target.toString(), {max:1,prepare:false,connection:{statement_timeout:30000},
  types:{exactTimestamp:{to:1184,from:[1184],serialize:(value:any)=>typeof value==='string'?value:value.toISOString(),
    parse:(value:string)=>new Date(value)}}});
const root = resolve(import.meta.dir, "../..");
const directory = process.env.PROTOTYPE_DIRECTORY!;
const result: any = { runtime: { bun: Bun.version }, checks: {} };
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

type Observation = { raw:any; sighting:any|null; pair:RawEvidenceEntry; kind:string; period:number; listing:string };
const observations: Observation[]=[];
const fetches:any[]=[], runs:any[]=[], listings:any[]=[], snapshots:any[]=[], payloads:any[]=[], queries:any[]=[];
const dates=["2026-07-08T10:00:00.000123Z","2026-08-08T10:00:00.000123Z","2026-09-08T10:00:00.000123Z","2026-10-03T10:00:00.000123Z"];
const LISTINGS=Number(process.env.STRUCTURE_LISTINGS ?? 20000);
assert(Number.isInteger(LISTINGS) && LISTINGS >= 4000 && LISTINGS <= 100000 && LISTINGS % 2 === 0);
const knownFetches=new Set<string>();
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
      if (!knownFetches.has(fetchId)) { knownFetches.add(fetchId); fetches.push({id:fetchId,crawl_run_id:uuid(`run:${kind}:${p}`),
        detail_backfill_run_id:null,search_query_id:queryId,source:"nettiauto",fetch_kind:"search_result_page",page_number:page,
        attempt_number:1,source_url:`https://example.invalid/search/${kind}/${page}`,request_headers:json({profile:"synthetic"}),
        response_status:200,response_body_shape:"ajax_json",fetched_at:dates[p]}); }
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
  // Distinct microsecond timestamps by fetch; a recent quarter remains page-packed,
  // with older raw evidence packed in 250s, matching the deployed mixed layout.
  const byFetch=new Map(fetches.map((f,i)=>[f.id,{f,i}]));
  const timestamp=(base:string,offset:number)=>new Date(Date.parse(base)+offset*1000).toISOString().replace('.000Z','.000123Z');
  for (const {f,i} of byFetch.values()) f.fetched_at=timestamp(f.fetched_at,i);
  const byRaw=new Map(observations.map(o=>[o.raw.id,o]));
  for (const o of observations) {
    o.raw.captured_at=byFetch.get(o.raw.source_fetch_id)!.f.fetched_at;
    if(o.sighting) o.sighting.seen_at=o.raw.captured_at;
    o.raw.source_url=`https://example.invalid/brand/model/${o.raw.source_listing_id}`;
    o.raw.parser_version=o.sighting?'synthetic-search-parser-v1':'synthetic-detail-parser-v4';
  }
  for(const s of snapshots) { s.observed_at=byRaw.get(s.raw_listing_record_id)!.raw.captured_at; s.created_at=s.observed_at; }
  // Completed-run times include the synthetic page window.
  for(const r of runs) r.finished_at=timestamp(r.finished_at,fetches.length+100);
  const groups:Observation[][]=[];
  const historical=observations.filter(o=>o.period<3 || !o.sighting).sort((a,b)=>a.raw.id.localeCompare(b.raw.id));
  groups.push(...chunks(historical,250));
  const recent=new Map<string,Observation[]>();
  for(const o of observations.filter(o=>o.period===3 && o.sighting)) {
    const group=recent.get(o.raw.source_fetch_id)??[];group.push(o);recent.set(o.raw.source_fetch_id,group);
  }
  groups.push(...recent.values());
  const packingStart=now();
  for(const group of groups) {
    const packed=packStorageValue(group.map(o=>o.pair));
    payloads.push({digest:Buffer.from(packed.digest,'hex'),codec:packed.codec,decoded_bytes:packed.decodedBytes,
      record_count:group.length,content:packed.content});
    group.forEach((o,i)=>{o.raw.payload_digest=Buffer.from(packed.digest,'hex');o.raw.payload_index=i;});
  }
  result.fixturePackingMs=elapsed(packingStart);
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
  await sql`update listings l set latest_snapshot_id=s.id from (select distinct on(listing_id) id,listing_id from listing_snapshots order by listing_id,observed_at desc) s where s.listing_id=l.id`;
  // Same-time competing snapshot: historical choice must prefer the exact observation's raw ID.
  for (let i=0;i<8;i++) await sql`insert into listing_snapshots(id,listing_id,raw_listing_record_id,parser_version,observed_at,
    availability,asking_price_eur,normalized_data,change_hash,created_at)
    values(${uuid(`tie:${i}`)},${uuid(`listing:${i}`)},${uuid(`raw:${i}:0`)},'synthetic-tie',${observations.find(o=>o.raw.id===uuid(`raw:${i}:2`))!.raw.captured_at},'active',999999,'{}','tie',${dates[3]})`;
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


export { sql, target, directory, result, hash, uuid, progress, now, elapsed, chunks, insert, size, total, observations, LISTINGS, fixture, migrate, seed };
