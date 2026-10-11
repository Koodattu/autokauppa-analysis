-- A further lossless cold-field block experiment; never an application migration.
-- Indexed/filterable fields stay relational. Each block contains <=128 records.
create schema blocked;
create table blocked.cold_blocks(k bigint primary key,entries jsonb not null
  check(jsonb_typeof(entries)='array' and jsonb_array_length(entries) between 1 and 128));
create table blocked.raw_rows(like compact.raw_rows including all);
alter table blocked.raw_rows drop column source_payload_sha256,drop column source_updated_date,
  drop column parse_error,drop column source_payload,drop column source_html_fragment,
  drop column url_key,drop column payload_index;
alter table blocked.raw_rows add column block_key bigint not null references blocked.cold_blocks(k),
  add column slot smallint not null check(slot between 0 and 127);
create unique index block_slot on blocked.raw_rows(block_key,slot);
alter table blocked.raw_rows add foreign key(source_key) references compact.source_keys(k),
  add foreign key(fetch_key) references compact.fetch_keys(k),
  add foreign key(context_key) references compact.raw_contexts(k),
  add foreign key(payload_key) references compact.payload_keys(k);
create temporary table block_input as select r.*,u.url,
  ((row_number() over(order by source_key,id)-1)/128)::bigint as block_key,
  ((row_number() over(order by source_key,id)-1)%128)::smallint as slot
  from compact.raw_rows r left join compact.url_keys u on u.k=r.url_key;
insert into blocked.cold_blocks
  select block_key,jsonb_agg(jsonb_build_array(encode(source_payload_sha256,'hex'),source_updated_date,
    parse_error,source_payload::text,source_html_fragment,url,payload_index) order by slot)
  from block_input group by block_key;
insert into blocked.raw_rows(id,source_key,fetch_key,record_kind,context_key,payload_key,block_key,slot)
  select id,source_key,fetch_key,record_kind,context_key,payload_key,block_key,slot from block_input;
drop table block_input;
create view blocked.raw_listing_records as select
  r.id,s.source,s.source_listing_id,c.crawl_run_id,c.detail_backfill_run_id,f.id as source_fetch_id,
  r.record_kind,e.fields->>5 as source_url,(e.fields->>3)::jsonb as source_payload,
  e.fields->>4 as source_html_fragment,p.digest as payload_digest,
  (e.fields->>6)::integer as payload_index,decode(e.fields->>0,'hex') as source_payload_sha256,
  (e.fields->>1)::date as source_updated_date,parser.version as parser_version,
  c.parser_status,c.captured_at,e.fields->>2 as parse_error
  from blocked.raw_rows r join compact.source_keys s on s.k=r.source_key
  join compact.fetch_keys f on f.k=r.fetch_key join compact.raw_contexts c on c.k=r.context_key
  join compact.parser_keys parser on parser.k=c.parser_key
  join blocked.cold_blocks b on b.k=r.block_key left join compact.payload_keys p on p.k=r.payload_key
  cross join lateral(select b.entries->r.slot as fields offset 0) e;
