# Technology Stack Decisions

Status: planned decisions only. No implementation exists yet.

## Final Baseline Stack

```text
Language:       TypeScript
Repo:           monorepo
Deployment:     Docker Compose on one server
Reverse proxy:  Caddy
Web:            Next.js + React on Node.js
API:            Hono on Bun
Worker:         Graphile Worker on Node.js
Database:       PostgreSQL
ORM:            Drizzle ORM
Validation:     Zod
Frontend data:  TanStack Query, Table, Virtual
Logging:        Pino-compatible structured JSON logs
Errors:         Sentry
```

## Caddy vs nginx plus certbot

Decision: use Caddy.

nginx plus certbot works, but it adds moving parts:

- nginx container.
- nginx config.
- certbot container or host certbot.
- certificate volume mounts.
- webroot or DNS challenge wiring.
- renewal scheduling.
- nginx reload after renewal.
- permissions between certbot and nginx.

Caddy removes most of that lifecycle. It can automatically provision, renew,
store, and reload certificates when DNS and ports are configured correctly.

Use nginx only if one of these becomes true:

- Existing operational preference strongly favors nginx.
- Advanced nginx-specific caching or tuning is required.
- OpenResty/Lua or nginx-specific modules are required.
- Caddy cannot satisfy a concrete production requirement.

Operational requirement for Caddy:

- Its data directory must be persisted in a Docker volume so certificates
  survive container recreation.

Reference: https://caddyserver.com/docs/automatic-https

## Next.js

Decision: use Next.js for the web frontend and run it on Node.js.

Why:

- Supports public analytics and Listing pages.
- Keeps the path open for SSR and SEO.
- Gives React routing, server rendering, metadata, and app-level conventions.
- Works well behind a reverse proxy in a self-hosted deployment.

Constraints:

- Do not turn Next into a second backend API.
- Do not duplicate Hono data endpoints in Next route handlers.
- Do not run production Next on Bun unless a production-like test proves the
  exact app works correctly.
- Use Next standalone output when containerizing.

Reference: https://nextjs.org/docs/app/guides/self-hosting

## React

Decision: use React through Next.js.

The UI will likely be an analytics dashboard with filters, tables, charts,
pagination, and saved views. React is a good fit for that interaction model.

## Hono

Decision: use Hono for the backend API.

Why:

- Small and explicit.
- TypeScript-friendly.
- Good fit for Bun.
- Easy to expose same-origin `/api/*` through Caddy.
- Keeps a clean API boundary independent of Next.js.

Constraints:

- Hono is intentionally minimal.
- The project must define its own structure for services, auth, validation,
  errors, request IDs, logging, and rate limiting.
- CORS should be avoided for normal browser traffic by using same-origin proxy
  routing through Caddy.

Reference: https://hono.dev/docs

## Bun

Decision: use Bun for the Hono API runtime and package management/scripts where
it is compatible.

Why:

- Fast package installs.
- Good TypeScript ergonomics.
- Good fit for lightweight HTTP services.
- Good developer experience.

Constraints:

- Do not assume Bun is a universal Node.js replacement for every package.
- Run Next.js on Node.js initially.
- Run Graphile Worker on Node.js initially.
- Prove compatibility before moving more production runtime pieces to Bun.

Reference: https://bun.sh/docs/runtime/nodejs-apis

## Graphile Worker

Decision: use Graphile Worker for durable background jobs and crawling
orchestration.

Why:

- Uses PostgreSQL, avoiding Redis at launch.
- Provides a real job model instead of raw sleep loops.
- Supports durable jobs, retries, backoff, task handlers, and recurring work.
- Fits a single-server Postgres-first architecture.

Constraints:

- Treat it as Node.js runtime unless Bun compatibility is proven.
- It is not a crawler by itself. It schedules and runs tasks.
- Crawler logic still needs careful idempotency, parsing, and rate limiting.

Reference: https://worker.graphile.org/docs

## PostgreSQL

Decision: use PostgreSQL as the only database at launch.

Why:

- Strong default for relational data.
- Supports JSONB when useful.
- Supports indexing, transactions, full-text search, and materialized views.
- Can hold Graphile Worker jobs.
- Keeps operational surface small.

Constraints:

- Backups and restore tests are mandatory.
- Disk monitoring is mandatory.
- The database must not be exposed publicly.
- Major version should be pinned.
- Migrations must be explicit and committed.

Reference: https://hub.docker.com/_/postgres

## Drizzle ORM

Decision: use Drizzle ORM and Drizzle Kit.

Why:

- TypeScript-first.
- SQL-like and low abstraction.
- Good fit for developers comfortable with SQL.
- Drizzle schema can be the source of truth for generated migrations.

Where it lives:

- `packages/db`

Used by:

- `apps/api`
- `apps/worker`
- the one-shot migration service or equivalent migration command

Avoid:

- Ordinary web frontend imports from database internals.

Reference: https://orm.drizzle.team/docs/migrations

## Zod

Decision: use Zod 4 for runtime validation.

Use Zod for:

- Environment/config parsing.
- Hono route params, query strings, and bodies.
- API response contracts where useful.
- Worker job payloads.
- Crawler parsed output before persistence.
- Forms.

Do not use Zod for:

- Every internal object by habit.
- Replacing database constraints.
- Replacing Drizzle schema.

Reference: https://zod.dev/

## TanStack Query

Decision: use TanStack Query for client-owned server state.

Use it for:

- Dashboard data.
- Filtered listing searches.
- Pagination.
- Polling.
- Refetching.
- Cache invalidation.
- Optimistic mutations, if needed.

Do not use it for:

- Data already fully handled by server rendering.
- Local UI state.

Reference: https://tanstack.com/query/latest/docs/framework/react/overview

## TanStack Table and Virtual

Decision: use TanStack Table and TanStack Virtual for analytics-heavy tables.

Why:

- Listing data will likely require sorting, filtering, column visibility,
  pagination, and large-table rendering.
- Table state should be explicit and URL/shareable where useful.
- Virtualization should be available before table size becomes painful.

## Logging

Decision: use Pino-compatible structured JSON logging.

Why:

- Fast JSON logs.
- Good child logger model.
- Works well with container stdout.
- Easy to attach request and job context.

Required fields:

```text
service
env
requestId
jobId
source
listingId
durationMs
status
error.code
error.message
```

Reference: https://getpino.io/

## Sentry

Decision: use Sentry for exceptions and basic performance/error visibility.

Sentry should be wired separately for:

- Next.js web.
- Hono API.
- Worker tasks.

Sentry is not a substitute for structured logs.

## OpenTelemetry

Decision: defer OpenTelemetry.

Add it when distributed tracing or metrics become necessary. For a single-server
first version, structured logs plus Sentry plus uptime/disk/backup alerts are
enough.

## ClickHouse and TimescaleDB

Decision: defer both.

Use PostgreSQL first. Reconsider only when:

- Historical snapshot volume becomes large.
- Aggregations are too slow after indexes/materialized views.
- Retention policy requires time-series compression.
- Analytical workloads interfere with ingestion or API latency.

## Redis and BullMQ

Decision: defer Redis and BullMQ.

Graphile Worker is the better first queue because PostgreSQL already exists.

Add Redis/BullMQ later only if:

- Queue throughput exceeds what Graphile Worker/Postgres should handle.
- Redis is needed for other reasons.
- Advanced queue features justify another stateful service.

## Auth

Decision: use a deliberately minimal Admin Password Gate for the first version.

The analytics and Listing UI are public. Crawler state, admin actions, and
admin-only API routes are private.

First-version rules:

- One admin password.
- HTTPS only.
- HTTP-only secure session cookie.
- No public registration.
- No user accounts.
- No roles.
- No unauthenticated admin access.

Candidate future replacements:

- Better Auth for a modern TypeScript auth stack that can work with Hono and
  Next.js.
- Auth.js if Next integration and established ecosystem matter more.
- Managed auth if security ownership should be minimized.

Full auth should be introduced before public user accounts, multi-user access,
or roles.
