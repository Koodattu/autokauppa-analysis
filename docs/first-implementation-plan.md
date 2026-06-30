# First Implementation Plan

Status: build plan for the first proof-of-concept implementation.

This plan turns the architecture docs and resolved planning decisions into an
ordered implementation path. The goal is a working vertical slice from
Nettiauto Search Result Data ingestion through PostgreSQL, Product API, public
noindex analytics/listing pages, and admin-only crawler status.

## First-Version Scope

Build:

- Public analytics page with URL Filters and `noindex`.
- Public Listing Pages with Source Attribution and `noindex`.
- Current and sold passenger-car Search Result Data ingestion.
- Raw Listing Data retained as listing-card payloads/fragments, not whole pages.
- Normalized Listing data in explicit typed PostgreSQL columns.
- Graphile Worker crawler jobs running on Node.js.
- Admin Password Gate for crawler/admin routes.
- Admin-only Crawler Status.
- Conservative live crawling with an explicit enable switch and pause path.

Do not build yet:

- Detail Page Data enrichment.
- Saved Views, watchlists, alerts, or user accounts.
- Bulk export or general open data API.
- Image downloads.
- Precomputed Aggregate Views.
- Motorcycles.
- Browser automation unless HTTP fetching stops being viable.
- ClickHouse, TimescaleDB, Redis, BullMQ, or multi-server deployment.

## Operating Decisions

- This is a risk-managed personal proof of concept. Source permission should be
  pursued in parallel, and crawling must stop or back off on block, rate-limit,
  challenge, redirect-loop, or unusual response signals.
- Public pages are accessible by URL but marked `noindex`; obscurity is not a
  security boundary.
- Admin sessions are stateless signed cookies. `ADMIN_PASSWORD` is a plain
  environment secret for the first version, and `SESSION_SECRET` signs the
  cookie payload.
- App-owned database records use UUID primary keys.
- Stable app-owned states use PostgreSQL enums. Source labels and open-ended
  failure classes stay as text.
- `docs/database-structure.md` is the first migration contract.
- Domain and TLS setup are deployment prerequisites, not local implementation
  blockers.

## Milestone 1: Configuration And Guardrails

Implement typed config parsing for all services.

Include:

- `APP_ENV`, `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`.
- `CRAWLER_ENABLED`, defaulting to disabled for live source requests.
- Initial crawler knobs such as delay between page fetches and max pages per
  run.
- Safe logging defaults that never print secrets, cookies, or raw page bodies.

Acceptance checks:

- Missing required production config fails fast.
- Local development can run without live crawling enabled.
- Package typechecks pass.

## Milestone 2: Database Schema And Migration

Implement the first Drizzle schema and migration from
`docs/database-structure.md`.

Include:

- PostgreSQL enums for stable app-owned states.
- UUID primary keys for app-owned records.
- Tables and constraints for source queries, crawl runs, fetches, raw records,
  listings, sightings, snapshots, images, optional listing events, and
  reprocessing runs.
- Seed data or a repeatable seed path for the current and sold Nettiauto
  passenger-car Source Search Queries.

Acceptance checks:

- Fresh database migration succeeds.
- The migration service no longer needs `ALLOW_EMPTY_MIGRATIONS=true`.
- Typecheck for `packages/db` passes.
- Constraints cover retry safety for listings, raw records, sightings,
  snapshots, and images.

## Milestone 3: Admin Password Gate

Implement the first admin auth boundary.

Include:

- Login endpoint comparing against `ADMIN_PASSWORD`.
- Stateless signed JSON session cookie using `SESSION_SECRET`.
- Cookie payload with only version, issued-at, expiry, and admin scope.
- Admin middleware in the API layer.
- Logout by clearing the cookie.
- Minimal admin login/status UI when the web app needs it.

Acceptance checks:

- Tampered, expired, malformed, and unsigned cookies are rejected.
- Admin-only API routes reject unauthenticated requests.
- Public Product API routes do not expose raw/admin data.

## Milestone 4: Fixtures, Source Schemas, And Parser

Build the parser before the live crawler.

Include:

- Fixture files for current AJAX JSON, sold AJAX JSON, first-load HTML/JSON-LD,
  and malformed or unexpected body shapes.
- Zod schemas for Nettiauto AJAX response metadata and card-level
  `data-datalayer` payloads.
- Structured HTML parsing for `ad_listing_data`.
- Normalization for source listing ID, source URL, availability, price, mileage,
  make, model, year, seller labels, page number, position, and image metadata.

Acceptance checks:

- Current and sold fixtures parse deterministically.
- Missing Source Listing ID prevents producing a Listing.
- Sold availability is produced only from explicit sold crawl/source labels.
- Parser tests do not depend on live network access.

## Milestone 5: Idempotent Page Persistence

Persist one parsed Search Result Page safely.

Include:

- One transaction per fetched page.
- `source_fetches` metadata.
- `raw_listing_records` per listing card.
- Upserted `listings`.
- Upserted `listing_sightings`.
- Change-hash based `listing_snapshots`.
- Upserted image metadata.
- Crawl-run counters and partial/failure state updates.

Acceptance checks:

- Persisting the same page twice does not duplicate Listings, Sightings,
  Snapshots, or Images.
- Parser errors and fetch failures are visible without aggressive retry loops.
- Public data can be read from normalized tables without raw payload exposure.

## Milestone 6: Worker Jobs And Crawl Controls

Implement the first Graphile Worker crawl path.

Include:

- `schedule_nettiauto_crawl`.
- `crawl_nettiauto_search_query`, initially allowed to process pages
  sequentially.
- Optional page-level job split only if needed for clarity or retries.
- `finalize_nettiauto_crawl_run`.
- One Nettiauto request at a time.
- Delay between page fetches.
- Stop/backoff behavior for 403, 429, challenges, redirects, and unknown body
  shapes.
- Operator-visible pause/disable path that does not stop the web app.

Acceptance checks:

- Live crawling does nothing unless explicitly enabled.
- A partial crawl is marked partial, not complete.
- Worker logs include job ID, crawl run ID, source query, page, parser version,
  duration, status, and failure class.
- Current Listings Crawl can be fresher than Sold Listings Crawl.

## Milestone 7: Product API

Expose the first product-facing API endpoints.

Include:

- Health endpoint.
- Filter metadata endpoint.
- Analytics summary/trend endpoint for URL Filters.
- Listing table/search endpoint with pagination and sorting.
- Public Listing Page data endpoint.
- Admin Crawler Status endpoint behind the Admin Password Gate.

Acceptance checks:

- API validates query params and response shapes at boundaries.
- Public endpoints return curated Frontend Data only.
- Admin endpoint shows recent runs, freshness, failures, queue/backlog signal,
  and crawler enabled/paused state.
- API integration checks cover validation, auth, and representative database
  reads.

## Milestone 8: Web UI

Build the first usable web experience.

Include:

- Public analytics page as the first screen.
- URL-backed filters.
- Basic chart or trend summary for counts/prices.
- Listing table with core columns.
- Public Listing Pages with Source Attribution.
- Coverage Metadata display: freshness, Sample Size, crawl completeness, and
  whether data includes current, sold, or both.
- Admin login and Crawler Status page.
- `noindex` metadata on public pages.

Acceptance checks:

- Filters update the URL and data.
- Empty, loading, and error states are stable.
- Listing pages do not expose Raw Listing Data, VIN, parser errors, or crawler
  internals.
- Web typecheck and build pass.

## Milestone 9: Local Compose And Deployment Smoke

Prove the integrated app locally before production deployment.

Include:

- Docker image build smoke.
- Compose startup with PostgreSQL, migrate, API, worker, web, and Caddy.
- Local health checks through Caddy.
- Documented production environment values for `SITE_ADDRESS`, secrets, and
  crawler enablement.
- Backup/restore plan before serious use.

Acceptance checks:

- `docker compose config` passes.
- Fresh Compose stack migrates and starts.
- Web and API health checks pass through Caddy.
- Worker can reach PostgreSQL and remains idle when crawling is disabled.
- Production deployment checklist names DNS, ports 80/443, Caddy data volume,
  secrets, backups, and crawler risk controls.

## First Useful Demo

The first demo is complete when:

- A current fixture and sold fixture parse into normalized rows.
- A crawl run can persist Search Result Data idempotently.
- The public analytics page can show basic counts/prices from PostgreSQL.
- A public Listing Page renders curated data with Source Attribution.
- Admin Crawler Status shows freshness and failures.
- Live crawling can be enabled, paused, and disabled without stopping the app.

## Implementation Rules

- Finish one milestone with its acceptance checks before widening scope.
- Prefer fixture tests before live source probes.
- Do not add Detail Page Data until the Search Result Data pipeline is stable.
- Do not add public bulk export.
- Do not expose admin-only data through public API or UI surfaces.
- Revisit docs only when an implementation decision changes architecture,
  boundaries, or risk posture.
