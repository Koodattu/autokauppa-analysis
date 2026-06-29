# Worker and Data Pipeline

Status: planned design only. No implementation exists yet.

## Core Principle

The worker is the hardest part of the system. Treat crawling as a durable data
pipeline, not as an infinite loop that sleeps and scrapes.

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
- Fetch source pages or source API responses.
- Parse raw source data.
- Validate parsed data.
- Write raw crawl artifacts or selected raw fields.
- Normalize listings into application tables.
- Maintain listing snapshots/history.
- Mark job success, failure, retry, or dead-letter states.
- Emit structured job logs.
- Expose enough state for admin/debug visibility.

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

## Raw vs Normalized Data

Keep a separation between raw source data and normalized application data.

Recommended initial model:

```text
crawl_runs
  one row per crawl execution or batch

source_fetches
  metadata for each fetched page/response

raw_listings
  source-specific captured listing payload or selected raw fields

listings
  stable normalized listing identity

listing_snapshots
  historical price, mileage, status, and observed attributes

listing_events
  optional derived events such as first_seen, price_changed, removed
```

The exact schema can change during implementation, but the separation matters.
It protects against parser mistakes and lets old raw data be reprocessed.

## Validation

Use Zod at these worker boundaries:

- Job payloads.
- Parsed source data before normalization.
- Environment/config.

Do not trust external source markup or payloads.

## Browser Automation

Do not start with browser automation unless required.

Preferred order:

1. HTTP fetch static source pages or APIs.
2. Parse HTML/JSON without a browser.
3. Use Crawlee if crawling complexity grows.
4. Use Playwright only when JavaScript rendering or browser behavior is required.

Browser automation is operationally heavier and easier to block.

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
- Whether storing raw source data is acceptable.

Robots.txt is not a security boundary, but it is still operationally and
ethically relevant.

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
