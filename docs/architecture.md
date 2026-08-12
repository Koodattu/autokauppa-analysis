# Architecture

Status: implemented baseline with some forward-looking design notes below.

## Implemented Application Boundaries

The architecture uses contracts at boundaries where data or execution ownership actually changes.
It deliberately does not wrap every database query, parser, configuration value, logger, or clock in
an interface; those abstractions would add indirection without isolating a meaningful failure mode.

- `packages/schemas` owns the canonical Analysis Query URL parser/formatter, exhaustive Analysis
  Query-to-Listing View projections, and strict runtime Product API and Admin Panel response
  schemas. Route paths, comparison state, and safe return navigation remain web-owned.
- `apps/api/src/api-app.ts` is the import-safe HTTP application boundary. The Bun entry point owns
  environment parsing, database creation, prewarming, and timers. Crawler Control coordinates
  status and operator commands, while historical diagnostics remain an adjacent read boundary.
- `packages/domain` owns PostgreSQL-backed product queries and the `completeCrawlRun` command. Crawl
  callers supply a semantic completion cause; persisted page and sighting evidence determines the
  final status and whether missing-listing reconciliation is safe.
- `NettiautoCrawlExecution` owns scheduling, Search Result Page collection, optional Detail Page
  Data enrichment, completion ordering, and retry policy. Stable Graphile task files are thin
  compatibility adapters over that module. Nettiauto HTTP and Graphile work queues remain explicit
  external adapters; PostgreSQL is intentionally not hidden behind a generic repository port.
- Raw Listing Data remains the provenance/reprocessing store. Every normalized Detail Page Data
  output has an exhaustive internal promotion decision for snapshot JSON, typed columns, or raw-only
  retention. Product API exposure remains a separate, narrower strict allowlist. See ADR 0039.

The preferred next step is to keep these boundaries small and testable rather than introducing a
generic service container. A transactional outbox should be considered only if measured failures
between database commits and Graphile job insertion show that queue idempotency and stale-run
recovery are insufficient. The legacy `crawl_nettiauto_search_query` and
`finalize_nettiauto_crawl_run` handlers remain deployment-compatible until existing queued jobs have
drained; remove them only after checking the production Graphile queue.

## Goals

- Run the complete application on a single server with Docker Compose.
- Make analytics and Listing views public from the first version.
- Keep crawler state and administration private.
- Preserve a clean path to SSR and SEO.
- Keep the crawler reliable and observable from the beginning.
- Use PostgreSQL as the initial source of truth.
- Avoid Redis, ClickHouse, TimescaleDB, Kubernetes, and multi-server operations
  until there is a proven need.
- Keep the stack modern without adding avoidable operational complexity.

## Non-Goals

- No Kubernetes.
- No third-party public API unless product requirements change.
- No separate cache, search, analytics, or queue database at launch.
- No custom authentication framework.
- No nginx plus certbot lifecycle unless Caddy proves insufficient.
- No browser automation for crawling unless the target pages require it.

## High-Level Shape

```text
internet
  |
  v
caddy
  |-- /      -> web: Next.js + React on Node.js
  |-- /api/* -> api: Bun + Hono

api
  |-- reads/writes PostgreSQL through packages/db
  |-- validates request boundaries with packages/schemas
  |-- enqueues durable jobs through PostgreSQL/Graphile Worker

worker
  |-- runs Graphile Worker task handlers
  |-- crawls/parses external data sources
  |-- writes raw and normalized data through packages/db

migrate
  |-- one-shot service
  |-- applies Drizzle migrations before app services roll forward

postgres
  |-- app data
  |-- job queue data
  |-- migration metadata
```

## Planned Runtime Services

| Service | Runtime | Public | Responsibility |
| --- | --- | --- | --- |
| `caddy` | Caddy | Yes, ports 80/443 | TLS, redirects, reverse proxy, public edge |
| `web` | Node.js | No direct public port | Next.js app, React UI, SSR, SEO-ready pages |
| `api` | Bun | No direct public port | Hono API, public analytics endpoints, admin-only endpoints |
| `worker` | Node.js | No | Graphile Worker task execution and crawling |
| `migrate` | Node.js or Bun | No | Apply Drizzle migrations explicitly |
| `postgres` | PostgreSQL | No | Primary database and job queue storage |
| `backup` | Postgres tools or host job | No | Scheduled backups and restore support |

## Request Flow

### Browser UI

```text
browser -> caddy -> web
```

The web app serves React pages and may server-render pages with data. For
server-rendered data, the web container should call the internal API over the
Docker network rather than reaching into the database directly.

### API Data

```text
browser -> caddy -> api
web SSR -> api
api -> postgres
```

The API should be the canonical data boundary. Browser requests should use the
same origin path `/api/*`, with Caddy routing those requests to the API
container. This avoids routine CORS complexity.

### Background Work

```text
api -> postgres job table
worker -> postgres job table
worker -> external source
worker -> postgres app tables
```

The worker should not be a raw infinite loop. It should process durable jobs,
use retries and backoff, and make progress visible in database-backed state.

## Monorepo Layout

Planned layout:

```text
apps/
  web/       Next.js + React application
  api/       Hono API service
  worker/    Graphile Worker task handlers and crawler orchestration

packages/
  config/    environment parsing and typed config
  db/        Drizzle schema, database client, migrations
  domain/    server-side business logic shared by API and worker
  schemas/   Zod schemas for external boundaries
  logging/   shared logger, request/job ID conventions
  ui/        shared frontend components, if useful
```

Rules:

- `packages/db` is the database source of truth.
- `packages/domain` must stay server-only.
- `packages/schemas` can be shared by web, API, and worker when schemas are safe
  to ship to the browser.
- `apps/web` should not import database internals for public analytics or
  Listing data.
- `apps/api` owns HTTP data endpoints.
- `apps/worker` owns crawling and background execution.

## API Boundary

Use Hono as the canonical backend API from the start.

Why:

- The web app needs Product API endpoints for analytics/listing views and
  private admin-only endpoints.
- It keeps a clean separation between web rendering and backend data behavior.
- It keeps the future open for mobile clients or a public API.
- It avoids tying all server behavior to Next.js conventions.

Tradeoff:

- There is an extra service and one more network hop during SSR.
- Auth, errors, validation, and logging must be implemented consistently.

Mitigation:

- Keep shared server logic in `packages/domain`.
- Keep shared schemas in `packages/schemas`.
- Use one logging convention everywhere.
- Use same-origin `/api/*` routing through Caddy.

The public API boundary is product-facing only. It should support analytics
charts, listing search/table data, individual Public Listing Pages, and filter
metadata. It should not become a general open data API, bulk export API, raw data
API, or high-volume machine API in the first version.

## SSR and Future SEO

Use Next.js now because analytics and Listing views are public and should have a
clean path to SSR and SEO.

Rules:

- Public/SEO pages can be rendered by Next.
- Next server code may fetch API data over the internal Docker network.
- Keep route handlers/server actions thin if used at all.
- Do not duplicate Hono API behavior inside Next route handlers.
- Do not put crawler or ingestion logic into Next.
- Keep admin routes behind the Admin Password Gate.
- Fetch public SSR data through the internal Hono Product API rather than
  importing Drizzle/database access into Next.

## Database Boundary

PostgreSQL is the only database at launch.

Initial data classes:

- Source/crawl metadata.
- Raw fetched artifacts or selected raw fields.
- Normalized listings.
- Listing snapshots/history.
- Derived aggregates.
- Worker job data.

The planned first database shape is documented in
[Database Structure](database-structure.md). The important initial separation is:

- `source_search_queries`, `crawl_runs`, and `source_fetches` describe source
  coverage and operational state.
- `raw_listing_records` stores relevant Source-provided Listing fragments and
  payloads for reprocessing.
- `listings`, `listing_sightings`, and `listing_snapshots` support identity,
  crawl coverage, and change-based history.
- curated Product API responses are derived from normalized tables, not from raw
  source payloads.

Do not add ClickHouse or TimescaleDB at launch. Reconsider when query volume,
history size, retention policy, or analytical latency proves PostgreSQL is the
wrong storage engine.

## Migration Boundary

Migrations must be explicit.

The API and worker should not auto-migrate on startup. A one-shot `migrate`
service should apply committed Drizzle migrations before the serving services
roll forward.

## Caddy Boundary

Caddy is the default public edge.

Responsibilities:

- Terminate TLS.
- Issue and renew certificates.
- Redirect HTTP to HTTPS.
- Route `/` to the web container.
- Route `/api/*` to the API container.
- Keep API, database, worker, migration, and internal admin ports private.

## Design Principle

Start as a modular monolith with separate runtime processes. Do not split the
product into unrelated applications. Separate processes are justified by runtime
behavior: web requests, API requests, background jobs, migrations, and database
storage all fail and scale differently.
