# nettiauto-analytics

Private analytics application for collecting, storing, and analyzing Nettiauto
listing data.

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
- [Operations and Security](docs/operations-and-security.md)
- [Testing and Quality](docs/testing-and-quality.md)
- [Open Questions](docs/open-questions.md)

## Core Direction

The system should start as a modular monolith deployed as separate runtime
processes, not as unrelated applications. The API, worker, database schema,
validation schemas, config, and logging conventions should be shared where that
reduces duplication.

The initial deployment target is one private server with Docker Compose. The
architecture should still leave room for future public pages, SSR, SEO, and a
larger analytics surface without forcing an early rewrite.
