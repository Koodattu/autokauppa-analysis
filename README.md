# nettiauto-analytics

Public analytics application for collecting, storing, and analyzing Nettiauto
listing data, with private admin-only crawler operations.

This repository is intentionally in the architecture/documentation phase. There
is no implementation scaffold yet.

## Planned Stack

- TypeScript monorepo
- Docker Compose on a single server
- Caddy reverse proxy
- Next.js + React web frontend, running on Node.js
- Bun + Hono backend API
- Node.js + Graphile Worker background worker
- PostgreSQL
- Drizzle ORM and Drizzle Kit migrations
- Zod for runtime validation at system boundaries
- TanStack Query, Table, and Virtual for interactive analytics UI
- Pino-compatible structured JSON logging
- Sentry for error reporting

## Architecture Docs

- [Architecture](docs/architecture.md)
- [Technology Stack Decisions](docs/technology-stack.md)
- [Worker and Data Pipeline](docs/worker-and-data-pipeline.md)
- [Product Analytics Ideas](docs/product-analytics.md)
- [Operations and Security](docs/operations-and-security.md)
- [Testing and Quality](docs/testing-and-quality.md)
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

- Public analytics page with URL filters.
- Passenger car current and sold Listing ingestion.
- Search Result Data ingestion first.
- Raw Listing Data retained in PostgreSQL.
- Explicit normalized columns for core analytics fields.
- Public Listing Pages with Source Attribution.
- Admin-password protected Crawler Status.
- Public pages marked `noindex` initially.

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
