# Eval contract

## Goal

Ship a coherent first proof-of-concept vertical slice for Nettiauto Analytics
from fixture ingestion through public analytics/listing pages and admin crawler
status.

## Success criteria

- Config parsing validates service env and keeps live crawling disabled by
  default.
- Database schema and migration represent the first-version contract with UUID
  app-owned rows, enums, constraints, and seed source queries.
- Parser fixtures cover current, sold, and malformed Search Result Data without
  live network access.
- Persistence is retry-safe for a repeated parsed page.
- Product API validates inputs and returns curated data only.
- Admin auth rejects missing, malformed, expired, unsigned, and tampered
  cookies.
- Web pages are noindex, URL-filtered, and do not import database internals.

## Integration surfaces

- `packages/config`: environment contract consumed by API and worker.
- `packages/db`: Drizzle schema, migrations, database client utilities.
- `packages/schemas`: Zod contracts shared across API/web/worker.
- `packages/domain`: parser, normalization, persistence, analytics reads, auth.
- `apps/api`: Hono route contract and admin middleware.
- `apps/worker`: Graphile Worker task entry points and safe disabled behavior.
- `apps/web`: public and admin UI consuming API responses.
- Docker/Compose/Caddy only if required to keep runtime wiring coherent.

## Downstream consumers

- Web UI consumes public/admin API shapes.
- Worker consumes config, parser, persistence, and db surfaces.
- API consumes config, schemas, auth, db/domain query functions.
- Tests consume fixtures and domain functions.
- Compose/migrate consumes committed migration output.

## Required checks

- Focused fixture/parser and persistence tests.
- Auth route/session tests or equivalent direct cookie verification tests.
- `bun run typecheck:packages`.
- `bun run typecheck:api`.
- `bun run typecheck:worker`.
- `bun run typecheck:web`.
- `bun run build:api`.
- `bun run build:worker`.
- `bun run build:web`.

## Deliverables

- Working local code for the first slice.
- Reviewable fixture data and tests.
- Drizzle schema and committed migration.
- Public API endpoints and admin-authenticated status endpoint.
- Web analytics, listing detail, admin login, and admin status pages.
- Worker task shell that remains idle when crawling is disabled and can process
  fixture/source-query work through the shared pipeline.
- Final workflow report with verification evidence.

## Blocking conditions

- Required dependency is missing and cannot be installed or reasonably replaced
  with existing dependencies.
- Database verification requires an unavailable PostgreSQL instance; in that
  case, compile/tests must still cover pure logic and the skipped DB check must
  be reported.
- Live source behavior is required to continue; this is out of scope unless the
  user explicitly approves live probing.
