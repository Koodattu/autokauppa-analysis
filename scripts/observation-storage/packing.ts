// Lossless temporal packing, not evidence deduplication. Zero exact repeats in
// this controlled corpus; every original JSON text and HTML byte is retained.
import { strict as assert } from "node:assert";
import { packStorageValue, unpackRawEvidence, type RawEvidenceEntry } from "../../packages/domain/src/storage-codec";
import { sql,observations,hash,chunks,insert,size,total,now,elapsed } from "./structure-fixture";

export async function packingExperiment(stableEntropy:boolean) {
  const corpus=observations.slice(0,20000).map(o=>({id:o.raw.id,sourceId:o.raw.source_listing_id,at:o.raw.captured_at,
    pair:[o.pair[0],`${o.pair[1]??''}<!-- observation ${hash(o.raw.id)}
      ${Array.from({length:10},(_,i)=>hash(`${stableEntropy?o.raw.source_listing_id:o.raw.id}:${i}`)).join('').slice(0,320)} -->`] as RawEvidenceEntry}));
  assert.equal(new Set(corpus.map(o=>hash(JSON.stringify(o.pair)))).size,corpus.length);
  const expected=new Map(corpus.map(o=>[o.id,o.pair]));
  const layouts={uuid:[...corpus].sort((a,b)=>a.id.localeCompare(b.id)),
    temporal:[...corpus].sort((a,b)=>a.sourceId.localeCompare(b.sourceId)||a.at.localeCompare(b.at)||a.id.localeCompare(b.id))};
  const result:any={observations:corpus.length,exactRepeats:0,
    stableEntropy,
    warning:"Controlled synthetic similarity, not a production compression estimate. Complete evidence stays in existing-size 250-record bundles; no dictionary and no records omitted."};
  for(const [name,rows] of Object.entries(layouts)) {
    const schema=`packing_${stableEntropy?'stable':'independent'}_${name}`;
    await sql.unsafe(`create schema ${schema};
      create table ${schema}.payloads(digest bytea primary key,codec text not null,decoded_bytes integer not null,
        record_count integer not null,content bytea not null);
      alter table ${schema}.payloads alter column content set storage external;
      create table ${schema}.locators(id uuid primary key,digest bytea not null references ${schema}.payloads(digest),ordinal integer not null);
      create index locator_payload on ${schema}.locators(digest)`);
    const payloads:any[]=[],locators:any[]=[];
    const start=now();
    for(const group of chunks(rows,250)) {
      const packed=packStorageValue(group.map(o=>o.pair));
      payloads.push({digest:Buffer.from(packed.digest,'hex'),codec:packed.codec,decoded_bytes:packed.decodedBytes,
        record_count:group.length,content:packed.content});
      group.forEach((o,ordinal)=>locators.push({id:o.id,digest:Buffer.from(packed.digest,'hex'),ordinal}));
    }
    const packingMs=elapsed(start),loadStart=now();
    await insert(`${schema}.payloads`,payloads);
    // Same locator insertion order prevents an index-fill advantage from sorting.
    await insert(`${schema}.locators`,locators.sort((a,b)=>a.id.localeCompare(b.id)));
    const loadMs=elapsed(loadStart),tables=await size(schema);
    let verified=0;
    for(const payload of payloads) {
      const [stored]=await sql.unsafe(`select encode(digest,'hex') as digest,codec,decoded_bytes as "decodedBytes",content from ${schema}.payloads where digest=$1`,[payload.digest]);
      const decoded=unpackRawEvidence(stored);
      const refs=await sql.unsafe(`select id,ordinal from ${schema}.locators where digest=$1`,[payload.digest]);
      for(const ref of refs) {assert.deepEqual(decoded[ref.ordinal],expected.get(ref.id));verified++;}
    }
    assert.equal(verified,corpus.length);
    const recovery=[];
    for(let i=0;i<8;i++) {
      const probeStart=now();
      const [row]=await sql.unsafe(`select l.ordinal,encode(p.digest,'hex') as digest,p.codec,p.decoded_bytes as "decodedBytes",p.content
        from ${schema}.locators l join ${schema}.payloads p on p.digest=l.digest where l.id=$1`,[corpus[997]!.id]);
      assert.deepEqual(unpackRawEvidence(row)[row.ordinal],corpus[997]!.pair);
      if(i) recovery.push(elapsed(probeStart));
    }
    result[name]={tables,totalBytes:total(tables),packingMs,loadMs,verified,
      decodedBytes:payloads.reduce((n,p)=>n+p.decoded_bytes,0),compressedBytes:payloads.reduce((n,p)=>n+p.content.length,0),
      recoverySamplesMs:recovery};
  }
  return result;
}
