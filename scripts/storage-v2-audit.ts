import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { createDbClient, createSqlClient } from "../packages/db/src/index";
import { compactNormalizedRows, readSnapshotNormalizedText, type NormalizedTable } from "../packages/domain/src/normalized-storage";
import { readGalleryAssets, storeGalleryAssets, type GalleryAsset } from "../packages/domain/src/gallery-storage";
import { unpackStorageValue, unpackRawEvidence } from "../packages/domain/src/storage-codec";
import { storeRawEvidence } from "../packages/domain/src/storage";
import { getPublicListingDetail, searchListings } from "../packages/domain/src/product";
import { getDatasetOverview } from "../packages/domain/src/research";
import { listingSearchQuerySchema } from "../packages/schemas/src/index";

const url = new URL(process.env.DATABASE_URL ?? "");
const action = process.argv[2];
const production = process.env.STORAGE_V2_PRODUCTION === "nettiauto_analytics";
if (production ? url.pathname !== "/nettiauto_analytics" :
  url.hostname !== "127.0.0.1" || url.pathname !== "/nettiauto_audit_test") throw new Error("Unexpected audit database");
const directory = process.env.STORAGE_AUDIT_DIRECTORY;
if (!directory) throw new Error("Audit directory required");
const sql = createSqlClient(url.toString(), 1);
let lastReport = 0;
function report(value: unknown, force = false) {
  if (force || Date.now()-lastReport>20000) { console.log(JSON.stringify(value)); lastReport=Date.now(); }
}
async function save(name: string, value: unknown) {
  await writeFile(join(directory!, name+".json"),JSON.stringify(value,null,2)+"\n",{flag:"wx"});
}
async function sizes() {
  const [database] = await sql`select pg_database_size(current_database())::float8 as bytes`;
  const tables = await sql`select relname,pg_total_relation_size(relid)::float8 as bytes from pg_stat_user_tables order by 2 desc`;
  return {database,tables};
}
async function normalizedFingerprint(table: NormalizedTable) {
  const hash=createHash("sha256"); let count=0;
  const key=table==="listing_snapshots"?"id":"listing_id";
  let cursor="00000000-0000-0000-0000-000000000000";
  for (;;) {
    const rows=await sql.unsafe<Array<{ id:string;metadata:string;full:string;payloadId:string|null;normalizedIndex:number|null }>>(`
      with batch as materialized (select * from ${table} where ${key}>$1::uuid order by ${key} limit 250)
      select t.${key} as id,(to_jsonb(t)-'normalized_data'-'normalized_payload_id'-'normalized_payload_index')::text as metadata,
        t.normalized_data::text as full,t.normalized_payload_index as "normalizedIndex",t.normalized_payload_id as "payloadId"
      from batch t order by t.${key}`, [cursor]);
    if(!rows.length)break;
    const payloadIds=[...new Set(rows.map(row=>row.payloadId).filter((id):id is string=>id!==null))];
    const decoded=new Map<string,string[]>();
    if(payloadIds.length) {
      const bundles=await sql`select id,encode(digest,'hex') as digest,content,decoded_bytes as "decodedBytes",record_count as count
        from normalized_payloads where id=any(${payloadIds}::uuid[])`;
      for(const bundle of bundles) {
        const value=unpackStorageValue({...bundle,codec:'brotli-json-v1'} as never);
        if(!Array.isArray(value)||value.length!==bundle.count||value.some(v=>typeof v!=='string'))throw new Error("Invalid normalized bundle");
        decoded.set(bundle.id,value);
      }
    }
    for(const row of rows) {
      let full=row.full;
      if(row.normalizedIndex!==null) {
        const values=row.payloadId?decoded.get(row.payloadId):undefined;
        if(!values || typeof values[row.normalizedIndex]!=="string")throw new Error("Invalid normalized reference");
        full=values[row.normalizedIndex]!;
        const original=JSON.parse(full);
        const projection=Object.fromEntries(Object.entries(original).filter(([key])=>['detailParserVersion','sourceLocationLabel'].includes(key)));
        if(JSON.stringify(projection)!==JSON.stringify(JSON.parse(row.full)))throw new Error("Normalized SQL projection changed");
      }
      hash.update(JSON.stringify([row.metadata,full])+"\n");
    }
    count+=rows.length;cursor=rows.at(-1)!.id;report({stage:"fingerprint",table,count});
  }
  return {count,sha256:hash.digest("hex")};
}
function canonicalAsset(row: GalleryAsset) {
  return JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a],[b])=>a.localeCompare(b))));
}
async function galleryFingerprint(packed: boolean) {
  const hash=createHash("sha256");let count=0;
  if (!packed) {
    for await(const rows of sql`select to_jsonb(a) as value from listing_image_assets a order by listing_id,id`.cursor(2000)) {
      for(const row of rows)hash.update(canonicalAsset(row.value)+"\n");count+=rows.length;report({stage:"gallery_fingerprint",count});
    }
  } else {
    const [remaining]=await sql`select count(*)::int as count from listing_image_assets`;
    if(remaining?.count!==0)throw new Error("Inline galleries remain");
    for await(const bundles of sql`select encode(digest,'hex') as digest,'brotli-json-v1' as codec,
      decoded_bytes as "decodedBytes",content,row_count,
      array(select raw_listing_record_id::text from listing_gallery_sources s where s.listing_id=b.listing_id order by raw_listing_record_id) as sources
      from listing_gallery_bundles b order by listing_id`.cursor(250)) {
      for(const bundle of bundles) {
        const rows=unpackStorageValue(bundle as never) as GalleryAsset[];
        if(rows.length!==bundle.row_count)throw new Error("Gallery count mismatch");
        if(JSON.stringify([...new Set(rows.map(row=>row.last_raw_listing_record_id))].sort())!==JSON.stringify(bundle.sources))throw new Error("Gallery source references changed");
        rows.sort((a,b)=>a.id.localeCompare(b.id));
        for(const row of rows)hash.update(canonicalAsset(row)+"\n");count+=rows.length;
      }
      report({stage:"gallery_fingerprint",count});
    }
  }
  return {count,sha256:hash.digest("hex")};
}
async function fingerprints(packed: boolean) {
  // A complete evidence-table cursor can exceed the normal query limit on the VM.
  // This connection is read-only; keep the longer limit confined to full audits.
  await sql`set statement_timeout='15min'`;
  const result: Record<string,unknown>={};
  const [hashType]=await sql`select data_type from information_schema.columns where table_schema='public'
    and table_name='raw_listing_records' and column_name='source_payload_sha256'`;
  const binaryHashes=hashType?.data_type==='bytea';
  for(const table of ["listing_snapshots","listing_details"] as const)result[table]=await normalizedFingerprint(table);
  result.listing_image_assets=await galleryFingerprint(packed);
  const tables=await sql`select c.relname as name,string_agg(quote_ident(a.attname),',' order by k.n) as keys
    from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_index i on i.indrelid=c.oid and i.indisprimary
    cross join lateral unnest(i.indkey) with ordinality k(attnum,n) join pg_attribute a on a.attrelid=c.oid and a.attnum=k.attnum
    where n.nspname='public' group by c.relname order by c.relname`;
  const exclude=new Set(["listing_snapshots","listing_details","listing_image_assets","normalized_payloads",
    "listing_gallery_bundles","listing_gallery_sources","storage_migration_progress","storage_migration_exceptions"]);
  for(const table of tables) {
    if(exclude.has(table.name))continue;
    const hash=createHash("sha256");let count=0;
    const projection=binaryHashes && table.name==='raw_listing_records'
      ? "to_jsonb(t)||jsonb_build_object('source_payload_sha256',encode(t.source_payload_sha256,'hex'),'payload_digest',encode(t.payload_digest,'hex'))"
      : binaryHashes && table.name==='raw_listing_payloads'
        ? "to_jsonb(t)||jsonb_build_object('digest',encode(t.digest,'hex'))" : "to_jsonb(t)";
    for await(const rows of sql.unsafe(`select md5((${projection})::text) as digest from "${table.name}" t order by ${table.keys}`).cursor(2000)) {
      for(const row of rows)hash.update(row.digest+"\n");count+=rows.length;report({stage:"fingerprint",table:table.name,count});
    }
    result[table.name]={count,sha256:hash.digest("hex")};
  }
  await sql`set statement_timeout='120s'`;
  return result;
}
async function apiSamples(previous?: Array<{id:string;digest:string}>) {
  const ids=previous??await sql`(select listing_id as id from listing_details order by listing_id limit 100)
    union (select listing_id as id from listing_image_assets order by listing_id limit 1000)
    union (select listing_id as id from listing_hero_images order by listing_id limit 100)
    union (select id from listings where current_availability='active' order by id limit 100)`;
  const results=[];
  for(const sample of ids) {
    const response=await getPublicListingDetail(sql,sample.id);
    // Time-relative observation labels are excluded; durable product data is compared in full.
    const value=response?{listing:response.listing,history:response.history,imageMetadata:response.imageMetadata,vehicleDetails:response.vehicleDetails}:null;
    const digest=createHash("sha256").update(JSON.stringify(value)).digest("hex");
    if(previous && digest!==sample.digest)throw new Error(`Public listing changed: ${sample.id}`);
    results.push({id:sample.id,digest});report({stage:"api",count:results.length});
  }
  return results;
}
try {
  await sql`set statement_timeout='120s'`;await sql`set lock_timeout='5s'`;await sql`set max_parallel_workers_per_gather=0`;
  if(["baseline","api-baseline","verify","sizes","performance"].includes(action??"")) await sql`set default_transaction_read_only=on`;
  if(action==="migrate-additive" || action==="migrate") {
    const requireDb=createRequire(new URL('../packages/db/package.json',import.meta.url));
    const {migrate}=requireDb('drizzle-orm/postgres-js/migrator');
    let folder='packages/db/drizzle';
    if(action==='migrate-additive') {
      const journal=JSON.parse(await readFile(join(folder,'meta/_journal.json'),'utf8'));
      journal.entries=journal.entries.filter((entry:{idx:number})=>entry.idx<=17);
      const target=join(directory,'additive-migrations');await mkdir(join(target,'meta'),{recursive:true});
      for(const entry of journal.entries)await copyFile(join(folder,entry.tag+'.sql'),join(target,entry.tag+'.sql'));
      await writeFile(join(target,'meta/_journal.json'),JSON.stringify(journal));folder=target;
    }
    await sql`set statement_timeout='15min'`;
    await migrate(createDbClient(sql),{migrationsFolder:folder});
  } else if(action==="baseline") {
    const result=await fingerprints(false);await save("v2-baseline",result);await save("v2-sizes-before",await sizes());
    await save("v2-api-baseline",await apiSamples());
  } else if(action==="api-baseline") {
    await save("v2-api-baseline",await apiSamples());
  } else if(action==="verify") {
    const before=JSON.parse(await readFile(join(directory,"v2-baseline.json"),"utf8"));
    const after=await fingerprints(true);
    if(JSON.stringify(before)!==JSON.stringify(after)) {
      await save("v2-mismatch",after);throw new Error("Full preservation fingerprint mismatch");
    }
    await apiSamples(JSON.parse(await readFile(join(directory,"v2-api-baseline.json"),"utf8")));
    const [references]=await sql`select
      (select count(*) from listing_snapshots s left join normalized_payloads p on p.id=s.normalized_payload_id
        where p.id is null or s.normalized_payload_index>=p.record_count)::int as snapshots,
      (select count(*) from listing_details d left join normalized_payloads p on p.id=d.normalized_payload_id
        where p.id is null or d.normalized_payload_index>=p.record_count)::int as details`;
    if(references?.snapshots!==0 || references?.details!==0)throw new Error("Incomplete normalized references");
    await save(process.argv[3]==='post-reclaim'?"v2-verified-post-reclaim":"v2-verified",{tables:after,sizes:await sizes()});
  } else if(action==="snapshots" || action==="details") {
    const table=action==="snapshots"?"listing_snapshots":"listing_details";
    const key=action==="snapshots"?"id":"listing_id";
    let count=0;let cursor="00000000-0000-0000-0000-000000000000";
    for(;;) {
      const ids=await sql.unsafe<{id:string}[]>(`select ${key} as id from ${table} where normalized_payload_id is null and ${key}>$1::uuid order by ${key} limit 250`,[cursor]);
      if(!ids.length)break;
      await sql.begin(async tx=>{await compactNormalizedRows(tx,table,ids.map(row=>row.id));});
      count+=ids.length;cursor=ids.at(-1)!.id;report({stage:action,count});
    }
    report({stage:action,count},true);
  } else if(action==="galleries") {
    let count=0;
    for(;;) {
      const ids=await sql`select distinct listing_id as id from listing_image_assets order by listing_id limit 100`;
      if(!ids.length)break;
      await sql.begin(async tx=>{
        for(const row of ids) {
          await tx`select id from listings where id=${row.id} for update`;
          await storeGalleryAssets(tx,row.id,await readGalleryAssets(tx,row.id));
        }
      });
      count+=ids.length;report({stage:action,count});
    }
    report({stage:action,count},true);
  } else if(action==="canary") {
    const rollback=new Error('intentional storage canary rollback');
    const before=await sql`select (select count(*) from normalized_payloads)::int as normalized,
      (select count(*) from raw_listing_payloads)::int as raw`;
    try {
      await sql.begin(async tx=>{
        const [snapshot]=await tx`select id from listing_snapshots order by id limit 1 for update`;
        if(!snapshot)throw new Error('Canary requires a snapshot');
        const original=await readSnapshotNormalizedText(tx,snapshot.id);
        await tx`update listing_snapshots set normalized_data=${original}::text::jsonb,
          normalized_payload_id=null,normalized_payload_index=null where id=${snapshot.id}`;
        await compactNormalizedRows(tx,'listing_snapshots',[snapshot.id]);
        if(await readSnapshotNormalizedText(tx,snapshot.id)!==original)throw new Error('Normalized write canary mismatch');
        const [gallery]=await tx`select listing_id as id from listing_gallery_bundles order by listing_id limit 1`;
        if(!gallery)throw new Error('Canary requires a gallery');
        await tx`select id from listings where id=${gallery.id} for update`;
        const rows=await readGalleryAssets(tx,gallery.id);await storeGalleryAssets(tx,gallery.id,rows);
        if(JSON.stringify(await readGalleryAssets(tx,gallery.id))!==JSON.stringify(rows))throw new Error('Gallery write canary mismatch');
        const evidence: [string,string][]=[['{"precise":9007199254740993123456789,"probe":"storage-v2"}','<p>storage canary</p>']];
        const digest=await storeRawEvidence(tx,evidence);
        const [packed]=await tx`select encode(digest,'hex') as digest,codec,decoded_bytes as "decodedBytes",content
          from raw_listing_payloads where digest=decode(${digest},'hex')`;
        if(!packed || JSON.stringify(unpackRawEvidence(packed as never))!==JSON.stringify(evidence))throw new Error('Raw write canary mismatch');
        throw rollback;
      });
    } catch(error) {if(error!==rollback)throw error;}
    const after=await sql`select (select count(*) from normalized_payloads)::int as normalized,
      (select count(*) from raw_listing_payloads)::int as raw`;
    if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Canary rollback changed bundle counts');
  } else if(action==="sizes")console.log(JSON.stringify(await sizes()));
  else if(action==="performance") {
    for(const filters of [{},{make:"BMW",model:"530"},{make:"BMW",fuelType:"diesel",transmission:"automatic"}]) {
      const started=performance.now();const result=await searchListings(sql,listingSearchQuerySchema.parse(filters));
      report({filters,milliseconds:performance.now()-started,rows:result.items.length},true);
    }
    const started=performance.now();await getDatasetOverview(sql);
    report({overviewMilliseconds:performance.now()-started},true);
  } else throw new Error("Unknown action");
  report({stage:action,complete:true},true);
} finally {await sql.end({timeout:5});}
