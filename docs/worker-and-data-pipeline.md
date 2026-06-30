# Worker and Data Pipeline

Status: planned design only. No implementation exists yet.

## Core Principle

The worker is the hardest part of the system. Treat crawling as a durable data
pipeline, not as an infinite loop that sleeps and scrapes.

Concrete first-version crawler notes are documented in
[Crawler Implementation Notes](crawler-implementation.md). Current source
behavior research is documented in
[Nettiauto Crawler Research](crawler-research.md).

## Runtime Choice

Decision: use Graphile Worker on Node.js for job execution.

The crawler code itself can still be TypeScript and share packages with the API.
The important distinction is:

- Graphile Worker provides durable job execution.
- The project provides source-specific crawling, parsing, normalization, and
  persistence logic.

Use a pure Bun worker only if the first version intentionally avoids Graphile
Worker and implements a simpler Postgres-backed job loop. That is lower
dependency surface, but also more custom reliability code.

## Worker Responsibilities

- Schedule crawl jobs.
- Enforce per-source rate limits.
- Fetch source pages or AJAX-style source responses.
- Parse Raw Listing Data.
- Validate parsed data.
- Write raw crawl artifacts or selected raw fields.
- Normalize listings into application tables.
- Maintain listing snapshots/history.
- Mark job success, failure, retry, or dead-letter states.
- Emit structured job logs.
- Expose enough state for admin/debug visibility.

Both Current Listings Crawl and Sold Listings Crawl are in the first
implementation scope. Current Listings Crawl has higher freshness priority; Sold
Listings Crawl may run on a slower cadence while still supporting observed sold
price trends. Detail Page Data enrichment is not part of the first crawler
implementation.

For Nettiauto, the first implementation should fetch Search Result Pages with
normal HTTP plus the Source's AJAX pagination header:

```text
Accept: */*
X-Requested-With: XMLHttpRequest
```

This returns JSON for current and sold search result pages, including page 1.
The primary payload is `ad_listing_data`, which contains listing-card HTML with
card-level `data-datalayer` JSON.

## Worker Non-Responsibilities

- Serving user-facing API requests.
- Rendering UI.
- Running database migrations.
- Managing TLS.
- Acting as a general cron script dumping untracked data into the database.

## Job Requirements

Every durable job should have:

```text
job id
task name
payload schema version
idempotency key
queue name
attempt count
max attempts
created timestamp
started timestamp
completed timestamp
last error
source identifier
structured log context
```

## Idempotency

All crawl writes must be safe to retry.

Examples:

- A listing source ID should be unique.
- A crawl run should have a unique ID.
- Snapshot inserts should avoid accidental duplicates.
- Normalization should be upsert-based where appropriate.
- Reprocessing the same raw artifact should produce the same normalized result.

If a job crashes after writing partial data, retrying it should not corrupt the
database.

## Rate Limiting and Backoff

The worker should support:

- Per-source concurrency.
- Global concurrency.
- Backoff after failures.
- Longer pause after block/rate-limit signals.
- Dead-letter handling for repeated failures.
- Separate behavior for transient network errors vs parse/schema errors.

The initial Crawl Politeness posture should be conservative rather than
aggressive. Exact concurrency, delay, retry, and cadence values should be worked
out during implementation against real source behavior, but the starting point
should favor slow sustainable collection over immediate completeness.

## Raw vs Normalized Data

Keep a separation between Raw Listing Data and Normalized Listing Data.

Raw Listing Data should be retained in PostgreSQL for every Listing observation
where the Source provides useful listing-level data. This is a deliberate
product choice: the project values the ability to reprocess source data, improve
parsers, audit historical observations, and recover missed fields later.

The production data model should not blindly store complete fetched HTML pages.
Store the relevant listing-level payload, structured metadata, JSON-LD object,
or HTML fragment that represents the Listing. During development, a local fetch
cache may be used to avoid repeatedly hitting Nettiauto, but that cache is
separate from product storage.

Recommended initial model:

```text
source_search_queries
  one row per Source Search Query, including current and sold default hashes

crawl_runs
  one row per crawl execution or batch

source_fetches
  metadata for each fetched page/response

raw_listing_records
  Raw Listing Data captured from the Source

listings
  stable normalized listing identity

listing_snapshots
  historical price, mileage, status, and observed attributes

listing_events
  optional derived events such as first_seen, price_changed, removed

listing_images
  image URL metadata only, not downloaded image binaries
```

The planned table-level structure is documented in
[Database Structure](database-structure.md). The exact schema can change during
implementation, but the separation matters. Raw Listing Data protects against
parser mistakes and lets old data be reprocessed. Normalized Listing Data should
be extracted into explicit typed columns for analytics and application queries.
Flexible JSON is acceptable for Raw Listing Data, but normalized analytics fields
should not stay trapped in JSON just because it is convenient. Frontend Data
should be curated API output, not a direct dump of raw or database rows.

For important fields, preserve a Source Label alongside the normalized value
when it helps parser quality and auditability. For example, normalize fuel type
to a stable enum while retaining the source text such as `Bensiini`, or store a
null numeric price while retaining a source label such as `Kysy hintaa`.

## Validation

Use Zod at these worker boundaries:

- Job payloads.
- Parsed source data before normalization.
- Environment/config.

Do not trust external source markup or payloads.

## Parser Versioning and Reprocessing

Parsing should be versioned. Normalized outputs should retain enough Parser
Version information to explain which logic produced them.

Reprocessing Runs should be supported so stored Raw Listing Data can be used to
regenerate Normalized Listing Data when parser logic improves. The system should
not silently mix materially different parser interpretations without visibility.

## Browser Automation

Do not start with browser automation unless required.

Preferred order:

1. HTTP fetch source pages or AJAX-style source responses.
2. Parse HTML/JSON without a browser.
3. Use Crawlee if crawling complexity grows.
4. Use Playwright only when JavaScript rendering or browser behavior is required.

Browser automation is operationally heavier and easier to block.

Current Nettiauto research shows browser automation is not required for Search
Result Data because AJAX-style HTTP requests return the needed page JSON.

## Observability

Worker logs must include:

```text
service=worker
jobId
task
source
crawlRunId
listingId, when known
attempt
durationMs
status
error type
```

The database should expose:

- Last successful crawl per source.
- Last failed crawl per source.
- Current queue depth.
- Failed job count.
- Dead-letter jobs.
- Last parse/schema error.

## Admin Visibility

The first version does not need a full admin console, but the architecture should
not hide worker state. At minimum, build API endpoints or internal pages later
that can answer:

- Is the worker running?
- What was the last successful crawl?
- What is failing?
- How many jobs are queued?
- Which sources are stale?
- Which listings changed recently?

## Legal and Ethical Crawling

Before implementation, confirm:

- Source terms of service.
- robots.txt expectations.
- Reasonable crawl frequency.
- Whether login/session-based scraping is allowed.
- Whether storing Raw Listing Data is acceptable.

Robots.txt is not a security boundary, but it is still operationally and
ethically relevant.

The crawler should not bypass access controls or rely on aggressive anti-bot
evasion by default.

## Failure Modes to Design For

- Source layout changes.
- Partial page fetch.
- Blocked/rate-limited requests.
- Duplicate listings.
- Listing removed and later reappears.
- Price changes during crawl.
- Database unavailable.
- Disk full.
- Bad migration.
- Worker crash during write.
- Retry storm after outage.

## Success Criteria

The worker architecture is acceptable when:

- Jobs are durable.
- Failed jobs are visible.
- Retries are safe.
- Writes are idempotent.
- Crawl freshness is measurable.
- Source-specific parsing is testable with fixtures.
- The system can pause or reduce crawling without stopping the web app.
