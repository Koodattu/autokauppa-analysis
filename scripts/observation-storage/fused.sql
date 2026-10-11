-- Optimistic fusion experiment. Caller must first prove one sighting per raw
-- record and matching fetch identities. A production census has NOT been run.
create schema fused;
create table fused.observations(like compact.raw_rows including all);
alter table fused.observations add column sighting_id uuid,
  add column listing_key bigint references compact.listing_keys(k),
  add column run_key integer references compact.run_keys(k),
  add column query_key integer references compact.query_keys(k),
  add column seen_at timestamptz,add column sighting_context_key bigint references compact.sighting_contexts(k),
  add column position integer;
alter table fused.observations add foreign key(source_key) references compact.source_keys(k),
  add foreign key(fetch_key) references compact.fetch_keys(k),
  add foreign key(context_key) references compact.raw_contexts(k),
  add foreign key(url_key) references compact.url_keys(k),
  add foreign key(payload_key) references compact.payload_keys(k),
  add check((sighting_id is null and num_nonnulls(listing_key,run_key,query_key,seen_at,sighting_context_key,position)=0)
    or(sighting_id is not null and num_nonnulls(listing_key,run_key,query_key,seen_at,sighting_context_key)=5));
create unique index fused_sighting_id on fused.observations(sighting_id) where sighting_id is not null;
create unique index fused_sighting_natural on fused.observations(run_key,listing_key,fetch_key) where sighting_id is not null;
create index fused_listing_time on fused.observations(listing_key,seen_at) where sighting_id is not null;
create index fused_time_listing on fused.observations(seen_at desc,listing_key) where sighting_id is not null;
create index fused_query_time on fused.observations(query_key,seen_at) where sighting_id is not null;
create index fused_query_listing_time on fused.observations(query_key,listing_key,seen_at desc) where sighting_id is not null;
insert into fused.observations select r.*,s.id,s.listing_key,s.run_key,s.query_key,s.seen_at,s.context_key,s.position
  from compact.raw_rows r left join compact.sighting_rows s on s.raw_listing_record_id=r.id;
create view fused.raw_listing_records as select
  r.id,s.source,s.source_listing_id,c.crawl_run_id,c.detail_backfill_run_id,f.id as source_fetch_id,
  r.record_kind,u.url as source_url,r.source_payload,r.source_html_fragment,p.digest as payload_digest,
  r.payload_index,r.source_payload_sha256,r.source_updated_date,parser.version as parser_version,
  c.parser_status,c.captured_at,r.parse_error
  from fused.observations r left join compact.source_keys s on s.k=r.source_key
  left join compact.fetch_keys f on f.k=r.fetch_key left join compact.raw_contexts c on c.k=r.context_key
  left join compact.parser_keys parser on parser.k=c.parser_key
  left join compact.url_keys u on u.k=r.url_key left join compact.payload_keys p on p.k=r.payload_key;
create view fused.listing_sightings as select
  s.sighting_id as id,l.id as listing_id,r.id as crawl_run_id,q.id as search_query_id,f.id as source_fetch_id,
  s.id as raw_listing_record_id,c.crawl_kind,s.seen_at,c.page_number,s.position,c.source_list_id,c.source_status_label
  from fused.observations s left join compact.listing_keys l on l.k=s.listing_key
  left join compact.run_keys r on r.k=s.run_key left join compact.query_keys q on q.k=s.query_key
  left join compact.fetch_keys f on f.k=s.fetch_key left join compact.sighting_contexts c on c.k=s.sighting_context_key
  where s.sighting_id is not null;
