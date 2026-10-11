-- Experimental, disposable-local schema only. Not a deployable migration.
-- Every dictionary and index below is charged to the candidate.
create schema compact;
create table compact.listing_keys(k bigint generated always as identity primary key,
  id uuid not null unique references public.listings(id));
create table compact.fetch_keys(k bigint generated always as identity primary key,
  id uuid not null unique references public.source_fetches(id));
create table compact.run_keys(k integer generated always as identity primary key,
  id uuid not null unique references public.crawl_runs(id));
create table compact.query_keys(k integer generated always as identity primary key,
  id uuid not null unique references public.source_search_queries(id));
create table compact.payload_keys(k bigint generated always as identity primary key,
  digest bytea not null unique references public.raw_listing_payloads(digest));
create table compact.source_keys(k bigint generated always as identity primary key,
  source source_code not null, source_listing_id text not null, unique(source,source_listing_id));
create table compact.url_keys(k bigint generated always as identity primary key,url text not null unique);
create table compact.parser_keys(k integer generated always as identity primary key,version text not null unique);
create table compact.raw_contexts(k bigint generated always as identity primary key,
  crawl_run_id uuid references public.crawl_runs(id),
  detail_backfill_run_id uuid references public.detail_backfill_runs(id),
  parser_key integer not null references compact.parser_keys(k),
  parser_status parser_status not null, captured_at timestamptz not null,
  check(num_nonnulls(crawl_run_id,detail_backfill_run_id)=1),
  unique nulls not distinct(crawl_run_id,detail_backfill_run_id,parser_key,parser_status,captured_at));
create index raw_context_run on compact.raw_contexts(crawl_run_id);
create index raw_context_backfill on compact.raw_contexts(detail_backfill_run_id);
create index raw_context_parser on compact.raw_contexts(parser_key,parser_status);
create index raw_context_time on compact.raw_contexts(captured_at desc,parser_key,parser_status);
create index raw_context_failed on compact.raw_contexts(captured_at desc) where parser_status='failed';
create table compact.raw_rows(
  id uuid primary key default gen_random_uuid(),
  source_key bigint not null references compact.source_keys(k),
  fetch_key bigint not null references compact.fetch_keys(k),
  record_kind raw_listing_record_kind not null,
  context_key bigint not null references compact.raw_contexts(k),
  url_key bigint references compact.url_keys(k),
  payload_key bigint references compact.payload_keys(k),payload_index integer,
  source_payload_sha256 bytea not null check(octet_length(source_payload_sha256)=32),
  source_updated_date date,parse_error text,source_payload jsonb,source_html_fragment text,
  unique(fetch_key,source_key,record_kind),
  check((source_payload is not null and payload_key is null and payload_index is null)
    or(source_payload is null and source_html_fragment is null and payload_key is not null and payload_index is not null and payload_index>=0)));
create index raw_source on compact.raw_rows(source_key);
create index raw_context on compact.raw_rows(context_key);
create index raw_payload on compact.raw_rows(payload_key) where payload_key is not null;
create table compact.sighting_contexts(k bigint generated always as identity primary key,
  crawl_kind crawl_kind not null,page_number integer,source_list_id text,source_status_label text,
  unique nulls not distinct(crawl_kind,page_number,source_list_id,source_status_label));
create table compact.sighting_rows(
  id uuid primary key default gen_random_uuid(),
  listing_key bigint not null references compact.listing_keys(k),
  run_key integer not null references compact.run_keys(k),
  query_key integer not null references compact.query_keys(k),
  fetch_key bigint not null references compact.fetch_keys(k),
  raw_listing_record_id uuid not null references compact.raw_rows(id),
  seen_at timestamptz not null,context_key bigint not null references compact.sighting_contexts(k),position integer,
  unique(run_key,listing_key,fetch_key));
create index sighting_listing_time on compact.sighting_rows(listing_key,seen_at);
create index sighting_time_listing on compact.sighting_rows(seen_at desc,listing_key);
create index sighting_query_time on compact.sighting_rows(query_key,seen_at);
create index sighting_query_listing_time on compact.sighting_rows(query_key,listing_key,seen_at desc);

insert into compact.listing_keys(id) select id from public.listings order by id;
insert into compact.fetch_keys(id) select id from public.source_fetches order by id;
insert into compact.run_keys(id) select id from public.crawl_runs order by id;
insert into compact.query_keys(id) select id from public.source_search_queries order by id;
insert into compact.payload_keys(digest) select digest from public.raw_listing_payloads order by digest;
insert into compact.source_keys(source,source_listing_id)
  select distinct source,source_listing_id from public.raw_listing_records order by source,source_listing_id;
insert into compact.url_keys(url) select distinct source_url from public.raw_listing_records where source_url is not null order by source_url;
insert into compact.parser_keys(version) select distinct parser_version from public.raw_listing_records order by parser_version;
insert into compact.raw_contexts(crawl_run_id,detail_backfill_run_id,parser_key,parser_status,captured_at)
  select distinct r.crawl_run_id,r.detail_backfill_run_id,p.k,r.parser_status,r.captured_at
  from public.raw_listing_records r join compact.parser_keys p on p.version=r.parser_version;
analyze compact.source_keys;
analyze compact.fetch_keys;
analyze compact.parser_keys;
analyze compact.raw_contexts;
analyze compact.url_keys;
analyze compact.payload_keys;
insert into compact.raw_rows
  select r.id,s.k,f.k,r.record_kind,c.k,u.k,p.k,r.payload_index,r.source_payload_sha256,
    r.source_updated_date,r.parse_error,r.source_payload,r.source_html_fragment
  from public.raw_listing_records r join compact.source_keys s using(source,source_listing_id)
  join compact.fetch_keys f on f.id=r.source_fetch_id
  join compact.parser_keys parser on parser.version=r.parser_version
  join compact.raw_contexts c on c.crawl_run_id is not distinct from r.crawl_run_id
    and c.detail_backfill_run_id is not distinct from r.detail_backfill_run_id
    and c.parser_key=parser.k and c.parser_status=r.parser_status and c.captured_at=r.captured_at
  left join compact.url_keys u on u.url=r.source_url left join compact.payload_keys p on p.digest=r.payload_digest;
insert into compact.sighting_contexts(crawl_kind,page_number,source_list_id,source_status_label)
  select distinct crawl_kind,page_number,source_list_id,source_status_label from public.listing_sightings;
analyze compact.sighting_contexts;
analyze compact.listing_keys;
analyze compact.run_keys;
analyze compact.query_keys;
insert into compact.sighting_rows
  select s.id,l.k,r.k,q.k,f.k,s.raw_listing_record_id,s.seen_at,c.k,s.position
  from public.listing_sightings s join compact.listing_keys l on l.id=s.listing_id
  join compact.run_keys r on r.id=s.crawl_run_id join compact.query_keys q on q.id=s.search_query_id
  join compact.fetch_keys f on f.id=s.source_fetch_id
  join compact.sighting_contexts c on c.crawl_kind=s.crawl_kind
    and coalesce(c.page_number,0)=coalesce(s.page_number,0) and c.page_number is not distinct from s.page_number
    and coalesce(c.source_list_id,'')=coalesce(s.source_list_id,'') and c.source_list_id is not distinct from s.source_list_id
    and coalesce(c.source_status_label,'')=coalesce(s.source_status_label,'') and c.source_status_label is not distinct from s.source_status_label;

create view compact.raw_listing_records as select
  r.id,s.source,s.source_listing_id,c.crawl_run_id,c.detail_backfill_run_id,f.id as source_fetch_id,
  r.record_kind,u.url as source_url,r.source_payload,r.source_html_fragment,p.digest as payload_digest,
  r.payload_index,r.source_payload_sha256,r.source_updated_date,parser.version as parser_version,
  c.parser_status,c.captured_at,r.parse_error
  from compact.raw_rows r left join compact.source_keys s on s.k=r.source_key
  left join compact.fetch_keys f on f.k=r.fetch_key left join compact.raw_contexts c on c.k=r.context_key
  left join compact.parser_keys parser on parser.k=c.parser_key
  left join compact.url_keys u on u.k=r.url_key left join compact.payload_keys p on p.k=r.payload_key;
create view compact.listing_sightings as select
  s.id,l.id as listing_id,r.id as crawl_run_id,q.id as search_query_id,f.id as source_fetch_id,
  s.raw_listing_record_id,c.crawl_kind,s.seen_at,c.page_number,s.position,c.source_list_id,c.source_status_label
  from compact.sighting_rows s left join compact.listing_keys l on l.k=s.listing_key
  left join compact.run_keys r on r.k=s.run_key left join compact.query_keys q on q.k=s.query_key
  left join compact.fetch_keys f on f.k=s.fetch_key left join compact.sighting_contexts c on c.k=s.context_key;
