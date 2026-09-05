# autokauppa-analysis

Public analytics application for collecting, storing, and analyzing vehicle
listing data, with private admin-only crawler operations.

The repository contains a production-oriented modular monolith with fixture-tested
Nettiauto parsing, PostgreSQL persistence and migrations, public analytics and
listing routes, an admin-protected crawler dashboard, Graphile Worker jobs,
server-rendered Next.js pages, and Docker Compose deployment.

## Stack

- TypeScript monorepo
- Docker Compose on a single server
- Caddy reverse proxy
- Next.js + React web frontend, running on Node.js
- Bun + Hono backend API
- Bun + Graphile Worker background worker
- PostgreSQL
- Drizzle ORM and Drizzle Kit migrations
- Zod for runtime validation at system boundaries
- Structured JSON logging

## Architecture Docs

- [Architecture](docs/architecture.md)
- [First Implementation Plan](docs/first-implementation-plan.md)
- [Technology Stack Decisions](docs/technology-stack.md)
- [Worker and Data Pipeline](docs/worker-and-data-pipeline.md)
- [Database Structure](docs/database-structure.md)
- [Detail v4 and Compact Media Rollout](docs/storage-v4-rollout.md)
- [Crawler Implementation Notes](docs/crawler-implementation.md)
- [Crawler Research](docs/crawler-research.md)
- [Product Analytics Ideas](docs/product-analytics.md)
- [Operations and Security](docs/operations-and-security.md)
- [Testing and Quality](docs/testing-and-quality.md)
- [Far Future Ideas](docs/far-future-ideas.md)
- [Open Questions](docs/open-questions.md)

## Core Direction

The system should start as a modular monolith deployed as separate runtime
processes, not as unrelated applications. The API, worker, database schema,
validation schemas, config, and logging conventions should be shared where that
reduces duplication.

The initial deployment target is one server with Docker Compose. Analytics,
listing data, and public pages are intended to be public, while crawler state and
administration stay behind the Admin Password Gate.

## First Implementation Target

The public product now includes a dataset overview, historical price research with independent period/group comparisons, evidence drilldowns, richer listing details, and a browser-local shortlist and saved views. See [Product Analytics](docs/product-analytics.md#implemented-research-flow) for behavior and interpretation limits.

Implemented first slice:

- Public analytics page with URL filters and coverage metadata.
- Passenger car current and sold Search Result Data parser fixtures.
- Raw listing-card data retained through PostgreSQL persistence helpers.
- Explicit normalized columns for core analytics fields.
- Public Listing Pages with Source Attribution.
- Admin-password protected Crawler Status.
- Public pages marked `noindex` initially.
- Graphile Worker task entry points that stay idle unless live crawling is
  explicitly enabled.

Deferred:

- Image downloads.
- Saved Views/watchlists.
- General open data API.
- ClickHouse or TimescaleDB.
- Redis/BullMQ.
- Browser automation unless required.
- Full user auth/accounts.
- Precomputed Aggregate Views.
- Motorcycles.
- Broad detail-page crawling by default; enrichment is opt-in and capped per run.

## Scaffold Layout

```text
apps/
  web/       Next.js + React app, configured for standalone output
  api/       Bun + Hono API service
  worker/    Graphile task adapters and source-specific Crawl Execution

packages/
  config/    shared environment/config package shell
  db/        Drizzle schema and migration package shell
  domain/    server-only domain package shell
  logging/   shared logging package shell
  schemas/   shared Zod schema package shell
  ui/        shared React UI package shell

docker/
  migrate.Dockerfile

Caddyfile
docker-compose.yml
.env.example
```

## Local Commands

```bash
bun install --frozen-lockfile
bun run typecheck:packages
bun run typecheck:web
bun run typecheck:api
bun run typecheck:worker
bun --cwd apps/web lint
bun run build:web
bun run build:api
bun run build:worker
```

Tests:

```bash
bun run test
```

PostgreSQL integration tests require a migrated disposable database whose name
contains `test`:

```bash
TEST_DATABASE_URL=postgres://.../nettiauto_test bun run test:integration
```

Service-specific development commands:

```bash
bun run dev:web
bun run dev:api
bun run dev:worker
```

## Docker Compose

The scaffold includes services for Caddy, web, API, worker, migrate, and
PostgreSQL. Copy `.env.example` to `.env` before running Compose and replace the
placeholder secrets before using anything beyond local development.

Local development can use `SITE_ADDRESS=:80` or direct service ports. Production
should set `SITE_ADDRESS` to the real subdomain so Caddy can manage HTTPS; use a
small Compose override if local and production Caddy settings need to diverge.

On small VPS instances, avoid building all service images in parallel. Parallel
`bun install` steps can exhaust memory and fail with exit code 137. Use:

```bash
COMPOSE_PARALLEL_LIMIT=1 docker compose up -d --build
```

The Compose file uses the PostgreSQL 18 volume layout and mounts
`postgres_data` at `/var/lib/postgresql`. If an earlier failed first deploy
created a volume with the old `/var/lib/postgresql/data` layout and no real data
has been stored yet, remove that volume before retrying.
