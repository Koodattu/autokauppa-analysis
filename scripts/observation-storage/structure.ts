// Run only through `run.py structure`: fresh localhost PostgreSQL, synthetic records.
import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSqlClient } from "../../packages/db/src/index";
import { getPriceResearch } from "../../packages/domain/src/research";
import { getPublicListingDetail, getAnalyticsTimeSeries } from "../../packages/domain/src/product";
import { readRawEvidence } from "../../packages/domain/src/storage";
import { listingFiltersQuerySchema, listingSearchQuerySchema } from "../../packages/schemas/src/index";
import { sql,target,directory,result,uuid,progress,now,elapsed,size,total,observations,LISTINGS,fixture,migrate,seed } from "./structure-fixture";
import { writeChecks } from "./structure-writes";
import { packingExperiment } from "./packing";

const clients:Record<string,any>={baseline:sql};
async function compareTiming(actions:Record<string,()=>Promise<unknown>>, repeats=7) {
  const samples:Record<string,number[]>={};
  for(const [name,action] of Object.entries(actions)) { await action();samples[name]=[]; }
  const names=Object.keys(actions);
  for(let n=0;n<repeats;n++) for(const name of n%2?[...names].reverse():names) {
    const start=now();await actions[name]();samples[name]!.push(elapsed(start));
  }
  return Object.fromEntries(Object.entries(samples).map(([name,values])=>{
    const sorted=[...values].sort((a,b)=>a-b);
    return [name,{medianMs:sorted[Math.floor(sorted.length/2)],minMs:sorted[0],maxMs:sorted.at(-1),samplesMs:values}];
  }));
}
async function parity(label="compact") {
  for(const table of ["raw_listing_records","listing_sightings"]) {
    const [difference]=await sql.unsafe(`select count(*)::int as count from (
      (select to_jsonb(r) from public.${table} r except all select to_jsonb(r) from ${label}.${table} r)
      union all (select to_jsonb(r) from ${label}.${table} r except all select to_jsonb(r) from public.${table} r)) d`);
    assert.equal(difference.count,0,`${table}: exact SQL reconstruction including microseconds`);
  }
  result.checks.exactMetadataRows=observations.length+observations.filter(o=>o.sighting).length;
  let responses=0;
  for(const availability of ["current","sold","all"]) for(const to of [undefined,"2026-08-31","2026-09-30"]) {
    for(const options of [{},{make:"Toyota",priceMin:10000,mileageMax:160000,sort:"priceAsc",page:2}]) {
      const q=listingSearchQuerySchema.parse({availability,from:to?"2026-07-01":undefined,to,...options});
      assert.deepEqual(await getPriceResearch(clients[label],q),await getPriceResearch(sql,q));responses++;
    }
  }
  for(const availability of ["current","sold","all"]) {
    const q=listingFiltersQuerySchema.parse({availability,from:"2026-07-01",to:"2026-10-05",interval:"month"});
    assert.deepEqual(await getAnalyticsTimeSeries(clients[label],q),await getAnalyticsTimeSeries(sql,q));responses++;
  }
  for(let i=0;i<8;i++) {
    const expected=await getPublicListingDetail(sql,uuid(`listing:${i}`));
    assert(expected && expected.imageMetadata.length===2,"Legacy gallery exercised");
    assert.deepEqual(await getPublicListingDetail(clients[label],uuid(`listing:${i}`)),expected);responses++;
  }
  let recovery=0;
  for(const o of observations.filter((_,i)=>i%997===0)) {
    assert.deepEqual(await readRawEvidence(clients[label],o.raw.id),o.pair);recovery++;
  }
  result.checks[label]={applicationResponses:responses,rawRecoveryCalls:recovery};
  for(const client of [sql,clients[label]]) {
    const [tie]=await client`select s.asking_price_eur from listing_sightings sighting
      join lateral(select * from listing_snapshots s where s.listing_id=sighting.listing_id and s.observed_at<=sighting.seen_at
        order by s.observed_at desc,(s.raw_listing_record_id=sighting.raw_listing_record_id) desc,s.created_at desc,s.id desc limit 1) s on true
      where sighting.id=${uuid("sighting:0:2")}`;
    assert.equal(tie.asking_price_eur,9500);
  }
  result.checks.snapshotTie=true;
}
async function reads() {
  const history=listingSearchQuerySchema.parse({availability:"all",from:"2026-07-01",to:"2026-09-30",make:"Toyota",priceMin:10000});
  const unfiltered=listingSearchQuerySchema.parse({availability:"all",from:"2026-07-01",to:"2026-09-30"});
  const operations:Record<string,(client:any)=>Promise<unknown>>={
    listingHistory:c=>c`select id,raw_listing_record_id,seen_at from listing_sightings where listing_id=${uuid("listing:500")} order by seen_at desc,id`,
    filteredResearch:c=>getPriceResearch(c,history),
    unfilteredResearch:c=>getPriceResearch(c,unfiltered),
    runCount:c=>c`select count(distinct listing_id) from listing_sightings where crawl_run_id=${uuid("run:current:2")}`,
    queryListing:c=>c`select id,seen_at from listing_sightings where search_query_id=${uuid("query:current")} and listing_id=${uuid("listing:500")} order by seen_at desc`,
    rawBySource:c=>c`select id,captured_at from raw_listing_records where source='nettiauto' and source_listing_id='9000500' and record_kind='detail_page' and parser_status='parsed'`,
    parserQuality:c=>c`select parser_version,count(*),max(captured_at) from raw_listing_records where captured_at>='2026-09-01' group by parser_version`,
  };
  result.reads={};
  for(const [name,operation] of Object.entries(operations)) {
    progress(`read-${name}`);
    const expected=await operation(sql);
    // Row ordering is explicitly irrelevant for the grouped quality report.
    const canonical=(rows:any)=>Array.isArray(rows)?[...rows].map(r=>JSON.stringify(r)).sort():rows;
    for(const client of Object.values(clients)) assert.deepEqual(canonical(await operation(client)),canonical(expected),name);
    result.reads[name]=await compareTiming(Object.fromEntries(Object.entries(clients).map(([label,client])=>[label,()=>operation(client)])));
  }
  const native={baseline:()=>operations.runCount!(sql),
    compact:()=>sql`select count(distinct listing_key) from compact.sighting_rows
      where run_key=(select k from compact.run_keys where id=${uuid('run:current:2')})`,
    fused:()=>sql`select count(distinct listing_key) from fused.observations where sighting_id is not null
      and run_key=(select k from compact.run_keys where id=${uuid('run:current:2')})`};
  const [expected]:any=await native.baseline();
  for(const action of [native.compact,native.fused]) assert.equal((await action())[0].count,expected.count);
  result.nativeRunCount=await compareTiming(native);
}

async function blocks() {
  progress("lossless-metadata-blocks");
  const start=now();await sql.unsafe(readFileSync(resolve(import.meta.dir,"blocks.sql"),"utf8"));
  result.blocks={buildMs:elapsed(start),tables:await size("blocked")};
  // Unchanged compact lookups/sightings stay charged. URL dictionary is obsolete;
  // exact URLs now live in the block. No double counting of the replaced raw heap.
  result.blocks.totalBytes=total(result.compact.filter((r:any)=>!["raw_rows","url_keys","url_keys_k_seq"].includes(r.name)))+total(result.blocks.tables);
  await sql.unsafe("analyze blocked.cold_blocks; analyze blocked.raw_rows");
  // Full local preservation audit, not a production query or a reader timeout change.
  const [difference]=await sql.begin(async(tx:any)=>{
    await tx`set local statement_timeout='120s'`;
    return tx`select count(*)::int as count from (
    (select to_jsonb(r) from public.raw_listing_records r except all select to_jsonb(r) from blocked.raw_listing_records r)
    union all (select to_jsonb(r) from blocked.raw_listing_records r except all select to_jsonb(r) from public.raw_listing_records r)) d`;
  });
  assert.equal(difference.count,0,"Cold blocks preserve every raw metadata value");
  result.blocks.exactRows=observations.length;
  const client:any=createSqlClient(target.toString(),1,60000);
  try {
    await client.unsafe("set search_path=blocked,compact,public; set max_parallel_workers_per_gather=0");
    const selected=observations.filter((_,i)=>i%997===0);
    for(const o of selected) assert.deepEqual(await readRawEvidence(client,o.raw.id),o.pair);
    result.blocks.recoveryCalls=selected.length;
    const id=uuid("raw:500:2");
    result.blocks.recovery=await compareTiming({baseline:()=>readRawEvidence(sql,id),compact:()=>readRawEvidence(clients.compact,id),blocked:()=>readRawEvidence(client,id)});
  } finally {await client.end({timeout:5});}
}

async function fusionEligible(client:any=sql) {
  const [row]=await client`select not exists(select 1 from compact.sighting_rows group by raw_listing_record_id having count(*)>1)
    and not exists(select 1 from compact.sighting_rows s join compact.raw_rows r on r.id=s.raw_listing_record_id where s.fetch_key<>r.fetch_key) as eligible`;
  return row.eligible;
}
async function fusion() {
  progress("fuse-raw-and-sighting-metadata");
  assert(await fusionEligible(),"Fusion requires an explicit eligibility check; never silently discard extra sightings");
  await assert.rejects(()=>sql.begin(async(tx:any)=>{
    await tx`update compact.sighting_rows set raw_listing_record_id=${uuid('raw:1:0')} where id=${uuid('sighting:0:0')}`;
    assert.equal(await fusionEligible(tx),false);throw new Error('eligibility rollback');
  }),/eligibility rollback/);
  await assert.rejects(()=>sql.begin(async(tx:any)=>{
    await tx`update compact.sighting_rows set fetch_key=(select k from compact.fetch_keys where id=${uuid('detail-fetch:1001')})
      where id=${uuid('sighting:0:0')}`;
    assert.equal(await fusionEligible(tx),false);throw new Error('fetch mismatch rollback');
  }),/fetch mismatch rollback/);
  const start=now();await sql.unsafe(readFileSync(resolve(import.meta.dir,"fused.sql"),"utf8"));
  result.fused={buildMs:elapsed(start),tables:await size('fused'),eligibilityRejections:2,
    limitation:"Optimistic one-sighting-per-raw, matching-fetch layout. Production eligibility unknown. No exception storage or fused writer implemented; reject if those assumptions fail."};
  result.fused.totalBytes=total(result.compact.filter((r:any)=>!['raw_rows','sighting_rows'].includes(r.name)))+total(result.fused.tables);
  await sql.unsafe('analyze fused.observations');
  clients.fused=createSqlClient(target.toString(),1,60000);
  await clients.fused.unsafe('set search_path=fused,public; set max_parallel_workers_per_gather=0');
  await parity('fused');
}

async function edgeFixture() {
  await sql`update public.raw_listing_records set captured_at=captured_at+interval '1 microsecond',source_updated_date='2020-02-29',
    source_url='https://example.invalid/changed?exact=%2F&x=1',parse_error='synthetic failure',parser_status='failed'
    where id=${uuid('raw:1000:1')}`;
  await sql`update public.raw_listing_records set source_listing_id='0009001001',source_url=null where id=${uuid('raw:1001:1')}`;
  await sql`update public.listing_sightings set page_number=null,position=-1,source_list_id=null,source_status_label=''
    where id=${uuid('sighting:1000:1')}`;
  await sql`update public.raw_listing_records set source_payload='{"n":900719925474099312345}'::jsonb,source_html_fragment='',
    payload_digest=null,payload_index=null where id=${uuid('detail-raw:1001')}`;
  const [precision]=await sql`select extract(microseconds from captured_at)::integer%1000 as micros
    from raw_listing_records where id=${uuid('raw:0:0')}`;
  assert.equal(precision.micros,123,"Fixture must contain real microseconds, not rounded JS dates");
}

try {
  await sql.unsafe("set max_parallel_workers_per_gather=0; set client_min_messages=warning");
  progress("migrate-generate");await migrate();fixture();
  progress("load-baseline");await seed();await edgeFixture();
  result.fixture={listings:LISTINGS,raw:observations.length,sightings:observations.filter(o=>o.sighting).length,
    note:"Synthetic data only; independent per-fetch microsecond timestamps; 20% detail observations; mixed 250-row historical and page bundles."};
  result.baseline=await size("public",["raw_listing_records","listing_sightings"]);
  progress("build-compact-keys-and-contexts");
  let start=now();result.buildStatements=[];
  for(const statement of readFileSync(resolve(import.meta.dir,"compact.sql"),"utf8").split(";")) {
    if(!statement.trim()) continue;
    const step=now();await sql.unsafe(statement);
    result.buildStatements.push({sql:statement.trim().slice(0,90),ms:elapsed(step)});
  }
  result.buildMs=elapsed(start);
  await sql.unsafe("analyze");
  result.compact=await size("compact");
  result.baselineBytes=total(result.baseline);result.compactBytes=total(result.compact);
  result.savingBytes=result.baselineBytes-result.compactBytes;
  console.log(JSON.stringify({baselineBytes:result.baselineBytes,compactBytes:result.compactBytes,savingBytes:result.savingBytes}));
  clients.compact=createSqlClient(target.toString(),1,60000);
  await clients.compact.unsafe("set search_path=compact,public; set max_parallel_workers_per_gather=0; set client_min_messages=warning");
  progress("exact-and-application-parity");await parity();
  await fusion();
  await reads();
  await blocks();
  progress('metadata-writes-retries-concurrency');result.writes=await writeChecks();
  const q=listingSearchQuerySchema.parse({availability:'all',from:'2026-07-01',to:'2026-10-05'});
  assert.deepEqual(await getPriceResearch(clients.compact,q),await getPriceResearch(sql,q));
  result.checks.afterWriteResearchParity=true;
  progress('temporal-evidence-packing');result.packing={
    independent:await packingExperiment(false),stable:await packingExperiment(true)};
  result.limits={productionMutated:false,productionRowsExported:0,fullClone:false,coldCache:false,
    note:"Fresh synthetic allocation, warm local reads. No claim of production bloat reclamation. Common payload/fetch/listing/snapshot tables unchanged and excluded equally; every added mapping/dictionary/index/sequence included."};
  result.completed=true;
  writeFileSync(resolve(directory,`structure-${LISTINGS}-results.json`),JSON.stringify(result,null,2));
  console.log(JSON.stringify({fixture:result.fixture,baselineBytes:result.baselineBytes,compactBytes:result.compactBytes,savingBytes:result.savingBytes,fused:result.fused,reads:result.reads,blocks:result.blocks,writes:result.writes,packing:result.packing,checks:result.checks}));
} catch(error:any) {
  result.completed=false;writeFileSync(resolve(directory,'structure-partial.json'),JSON.stringify(result,null,2));
  console.error(JSON.stringify({message:error.message,code:error.code,stack:error.stack}));process.exitCode=1;
} finally { for(const client of Object.values(clients)) await client.end({timeout:5}); }
