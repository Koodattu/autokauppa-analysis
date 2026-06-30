# Database Structure

Status: planned database structure only. No migrations or Drizzle schema have
been implemented yet.

This document turns the architecture decisions into the first relational model
for Nettiauto Search Result Data ingestion. The table names, column names,
constraints, and indexes below are the first migration contract. Minor
Drizzle-specific naming adjustments are acceptable during implementation, but
the boundaries, identities, and uniqueness rules should stay stable unless an
ADR changes them.

## Design Principles

- PostgreSQL is the only application database at launch.
- Source Listing identity is `(source, source_listing_id)`.
- App-owned tables use UUID primary keys.
- The first implementation collects current and sold Search Result Data only.
- Detail Page Data is deferred until the Search Result Data pipeline is stable.
- Raw Listing Data is retained for parser reprocessing and auditability.
- Normalized analytics fields use explicit typed columns.
- Listing Sightings record crawl coverage; Listing Snapshots record changed
  Listing state.
- Sold is Source-confirmed. Missing from a Current Listings Crawl is not sold.
- Raw source payloads, parser errors, VIN, crawler internals, and admin state are
  not part of public API responses.

## Initial Enums

Use PostgreSQL enums for stable app-owned domain state. Keep source labels,
failure classes, and other externally shaped or open-ended values as text so
source drift does not require enum migrations.

```text
source_code
  nettiauto

vehicle_category
  passenger_car

crawl_kind
  current
  sold

listing_availability
  active
  sold
  stale
  removed
  unknown

crawl_run_status
  planned
  running
  completed
  partial
  failed
  cancelled

fetch_kind
  search_result_page
  detail_page

fetch_body_shape
  ajax_json
  html_document
  html_fragment
  redirect
  blocked
  unknown

raw_listing_record_kind
  search_result_card
  search_result_json_ld
  detail_page

parser_status
  parsed
  failed
  skipped
```

## Core Tables

### source_search_queries

One row per Source Search Query used by the crawler.

Initial seed rows should include the current and sold passenger-car defaults
identified during crawler research:

```text
nettiauto current passenger_car /vaihtoautot    haku=P2236304442
nettiauto sold    passenger_car /hakutulokset  haku=P82984997
```

Suggested columns:

```text
id uuid primary key
source source_code not null
vehicle_category vehicle_category not null
crawl_kind crawl_kind not null
entry_path text not null
source_search_hash text not null
query_params jsonb not null default '{}'
enabled boolean not null default true
priority integer not null default 100
target_cadence_interval interval null
last_complete_crawl_run_id uuid null
last_success_at timestamptz null
last_failure_at timestamptz null
created_at timestamptz not null
updated_at timestamptz not null
notes text null
```

Constraints and indexes:

```text
unique (source, vehicle_category, crawl_kind, source_search_hash)
index (enabled, priority)
index (source, crawl_kind, enabled)
```

Treat `source_search_hash` as an opaque Source value. Do not try to decode or
locally derive `haku=P...`.

### crawl_runs

One row per crawler attempt to cover a Search Query or a bounded page batch.

Suggested columns:

```text
id uuid primary key
source source_code not null
search_query_id uuid not null references source_search_queries(id)
crawl_kind crawl_kind not null
vehicle_category vehicle_category not null
status crawl_run_status not null
started_at timestamptz null
finished_at timestamptz null
expected_page_count integer null
fetched_page_count integer not null default 0
parsed_listing_count integer not null default 0
source_total_ads integer null
is_complete boolean not null default false
failure_reason text null
created_at timestamptz not null
updated_at timestamptz not null
```

Constraints and indexes:

```text
index (search_query_id, created_at desc)
index (source, crawl_kind, status, created_at desc)
```

A Complete Crawl Run means every expected Search Result Page for the Search
Query was fetched and parsed successfully.

### source_fetches

One row per HTTP response or failed fetch attempt.

Suggested columns:

```text
id uuid primary key
crawl_run_id uuid not null references crawl_runs(id)
search_query_id uuid not null references source_search_queries(id)
source source_code not null
fetch_kind fetch_kind not null
page_number integer null
source_url text not null
request_headers jsonb not null
response_status integer null
response_content_type text null
response_body_shape fetch_body_shape not null
response_body_sha256 text null
response_bytes integer null
fetched_at timestamptz not null
duration_ms integer null
error_type text null
error_message text null
```

Constraints and indexes:

```text
unique (crawl_run_id, fetch_kind, page_number)
index (search_query_id, page_number)
index (response_status)
index (response_body_shape)
```

Store only safe request headers needed for auditability. Do not store cookies,
secrets, Cloudflare clearance tokens, or full browser session headers.

The production database should not store complete response bodies by default.
During development, a local fetch cache may store whole responses outside
product storage.

### raw_listing_records

Raw Listing Data captured from a Source response.

For Search Result Data this should usually be the relevant listing-card fragment
plus the parsed `data-datalayer` source payload. It should not be an entire HTML
document.

Suggested columns:

```text
id uuid primary key
source source_code not null
source_listing_id text not null
crawl_run_id uuid not null references crawl_runs(id)
source_fetch_id uuid not null references source_fetches(id)
record_kind raw_listing_record_kind not null
source_url text null
source_payload jsonb not null
source_html_fragment text null
source_payload_sha256 text not null
parser_version text not null
parser_status parser_status not null
captured_at timestamptz not null
parse_error text null
```

Constraints and indexes:

```text
unique (source_fetch_id, source_listing_id, record_kind)
index (source, source_listing_id)
index (crawl_run_id)
index (parser_version, parser_status)
```

`source_payload` may contain raw source labels such as `Myynnissä`, `Myyty`,
`Bensiini`, or `Private seller`. Keep normalized values in downstream tables.

### listings

Stable normalized Listing identity.

Suggested columns:

```text
id uuid primary key
source source_code not null
source_listing_id text not null
vehicle_category vehicle_category not null
canonical_source_url text null
current_availability listing_availability not null default 'unknown'
availability_last_confirmed_at timestamptz null
first_seen_at timestamptz not null
last_seen_at timestamptz not null
last_raw_listing_record_id uuid null references raw_listing_records(id)
created_at timestamptz not null
updated_at timestamptz not null
```

Constraints and indexes:

```text
unique (source, source_listing_id)
index (current_availability, last_seen_at desc)
index (vehicle_category, current_availability)
```

The Listing row should be upserted whenever a Source Listing ID is observed.

### listing_sightings

Proof that a Listing was seen during a Crawl Run.

Suggested columns:

```text
id uuid primary key
listing_id uuid not null references listings(id)
crawl_run_id uuid not null references crawl_runs(id)
search_query_id uuid not null references source_search_queries(id)
source_fetch_id uuid not null references source_fetches(id)
raw_listing_record_id uuid not null references raw_listing_records(id)
crawl_kind crawl_kind not null
seen_at timestamptz not null
page_number integer null
position integer null
source_list_id text null
source_status_label text null
```

Constraints and indexes:

```text
unique (crawl_run_id, listing_id, source_fetch_id)
index (listing_id, seen_at desc)
index (search_query_id, seen_at desc)
```

Sightings are about coverage and freshness. They should be inserted or upserted
even when the Listing Snapshot does not change.

### listing_snapshots

Changed normalized state for a Listing.

Suggested columns:

```text
id uuid primary key
listing_id uuid not null references listings(id)
raw_listing_record_id uuid not null references raw_listing_records(id)
parser_version text not null
observed_at timestamptz not null
availability listing_availability not null
source_status_label text null
asking_price_eur integer null
observed_sold_price_eur integer null
price_source_label text null
mileage_km integer null
mileage_source_label text null
year_model integer null
make_source_label text null
model_source_label text null
fuel_type_source_label text null
transmission_source_label text null
body_type_source_label text null
color_source_label text null
seller_source_label text null
seller_type_source_label text null
normalized_data jsonb not null default '{}'
change_hash text not null
created_at timestamptz not null
```

Constraints and indexes:

```text
unique (listing_id, change_hash)
index (listing_id, observed_at desc)
index (availability, observed_at desc)
index (make_source_label, model_source_label)
index (asking_price_eur)
index (observed_sold_price_eur)
index (mileage_km)
index (year_model)
```

Use `asking_price_eur` for active Listings. Use `observed_sold_price_eur` for
Source-confirmed Sold Listings. Do not call the observed sold value an actual
transaction price.

### listing_images

Image metadata only. Do not download image binaries in the first version.

Suggested columns:

```text
id uuid primary key
listing_id uuid not null references listings(id)
source source_code not null
image_url text not null
image_role text null
position integer null
width integer null
height integer null
first_seen_at timestamptz not null
last_seen_at timestamptz not null
last_raw_listing_record_id uuid null references raw_listing_records(id)
```

Constraints and indexes:

```text
unique (listing_id, image_url)
index (listing_id, position)
```

### listing_events

Optional derived events for UI and audit trails.

Suggested columns:

```text
id uuid primary key
listing_id uuid not null references listings(id)
event_type text not null
event_at timestamptz not null
source_crawl_run_id uuid null references crawl_runs(id)
source_snapshot_id uuid null references listing_snapshots(id)
metadata jsonb not null default '{}'
created_at timestamptz not null
```

Initial event types can include:

```text
first_seen
availability_changed
price_changed
mileage_changed
marked_sold
marked_stale
marked_removed
```

### reprocessing_runs

Tracks reprocessing of stored Raw Listing Data with a newer parser.

Suggested columns:

```text
id uuid primary key
parser_version_from text null
parser_version_to text not null
status text not null
started_at timestamptz null
finished_at timestamptz null
raw_record_count integer not null default 0
success_count integer not null default 0
failure_count integer not null default 0
notes text null
created_at timestamptz not null
updated_at timestamptz not null
```

## Write Flow

For each fetched Search Result Page:

1. Insert or update `source_fetches`.
2. Parse card-level Raw Listing Data from `ad_listing_data`.
3. Insert `raw_listing_records`.
4. Upsert `listings` by `(source, source_listing_id)`.
5. Insert or upsert `listing_sightings`.
6. Build normalized fields from the raw payload.
7. Insert `listing_snapshots` only if `change_hash` is new for the Listing.
8. Update `listings.current_availability`, `last_seen_at`, and
   `last_raw_listing_record_id`.
9. Upsert `listing_images` from card image metadata.
10. Optionally derive `listing_events`.

All writes should be inside a transaction per Source Fetch or per parsed page.
Retries must not create duplicate Listings, Sightings, or Snapshots.

## Public vs Admin Data

Public Product API data may read from `listings`, `listing_snapshots`, curated
image metadata, and derived aggregates.

Admin-only data includes:

- `source_fetches` internals.
- `raw_listing_records`.
- parser errors.
- crawl run failure details.
- reprocessing runs.
- VIN, if captured in raw source data.

## Deferred Database Work

- Detail Page Data fields beyond search result cards.
- Registration-number based Specific-Car Lookup.
- Saved Views and watchlists.
- Precomputed Aggregate Views.
- Image binary storage.
- ClickHouse, TimescaleDB, or Redis.
