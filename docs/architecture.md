# Architecture

Status: planned architecture only. No implementation exists yet.

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
- Admin session data, if needed for the Admin Password Gate.

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
