# Open Questions

Status: architecture questions to resolve before implementation or during early
scaffolding.

## Local Implementation Status

No unresolved local implementation blockers remain. The items below are either
resolved first-version choices or deployment prerequisites.

1. Admin Password Gate details.

   Resolved for the first version: use a stateless signed HTTP-only cookie
   rather than database-backed admin sessions, keep `ADMIN_PASSWORD` as a plain
   environment secret, and sign a small JSON payload with `SESSION_SECRET`.

2. Domain name and TLS setup.

   Not required for local implementation. Local development may use
   `SITE_ADDRESS=:80` or direct service ports. Before production deployment,
   configure the real subdomain, point DNS at the server, open ports 80 and 443,
   and let Caddy manage HTTPS for that hostname. Use environment files or a
   small Compose override if local and production Caddy settings diverge.

3. Crawl legality and source constraints.

   Current published source constraints are not clearly compatible with a public
   analytics product or redistributed dataset. The first implementation may
   still proceed as a risk-managed personal proof of concept: public pages stay
   `noindex`, no bulk export is exposed, crawling stays conservative, source
   access stops on block/rate-limit/challenge signals, and source permission is
   pursued in parallel.

4. Initial data model implementation details.

   Resolved for the first migration: use
   [Database Structure](database-structure.md) as the schema contract, including
   the suggested table and column names, unique constraints, and indexes. Minor
   Drizzle-specific naming adjustments are acceptable during implementation.

## Recommended Defaults

- Caddy instead of nginx plus certbot.
- Next.js on Node.js.
- Hono API on Bun.
- Graphile Worker on Node.js.
- PostgreSQL only at launch.
- Drizzle for database access and migrations.
- Zod for boundary validation.
- Pino-compatible JSON logs to stdout.
- Sentry for exception visibility.
- Same-origin `/api/*` routing through Caddy.
- Explicit migration service.
- No Redis at launch.
- No ClickHouse or TimescaleDB at launch.
- No browser automation unless required.
- Nettiauto Search Result Data should start with AJAX-style HTTP fetches using
  `X-Requested-With: XMLHttpRequest`; see
  [Crawler Implementation Notes](crawler-implementation.md).

## Resolved During Planning

- Graphile Worker runs on Node.js for the worker service. The scaffold builds
  TypeScript before runtime and runs Graphile Worker from the compiled task
  directory; do not move the worker runtime to Bun without proving compatibility
  first.
- Admin sessions are stateless for the first version. The Admin Password Gate
  should issue an HTTP-only signed cookie using `SESSION_SECRET`; no
  `admin_sessions` table is needed unless revocation, audit, or multi-user
  access becomes necessary. The cookie payload should stay small: version,
  issued-at, expiry, and fixed admin scope.
- `ADMIN_PASSWORD` stays a plain environment secret for the first version.
  Configure it as a long random password or passphrase, keep `SESSION_SECRET`
  separate, and never log either value.
- App-owned database records use UUID primary keys. External Source identity
  still uses explicit unique constraints, especially `(source,
  source_listing_id)` for Listings.
- Stable app-owned domain states use PostgreSQL enums. Source labels, failure
  classes, and other externally shaped or open-ended values stay as text.
- The first migration should follow the table names, column names, constraints,
  and indexes in [Database Structure](database-structure.md), adding only small
  implementation-driven indexes needed by the first Product API queries.
- Domain name and TLS setup are deployment prerequisites, not local
  implementation blockers. The base Compose/Caddy setup can be kept common, with
  local and production differences handled through environment values or a small
  Compose override.

## Safe to Defer

- Public API documentation.
- Mobile client support.
- ClickHouse/TimescaleDB.
- Redis/BullMQ.
- OpenTelemetry.
- Full admin console.
- Complex role-based access control.
- Advanced CDN/caching.
- Multi-server deployment.

## Revisit Triggers

Revisit the architecture if:

- Public traffic grows beyond light use.
- Multiple users or organizations are introduced.
- The crawler needs high throughput.
- PostgreSQL query performance becomes a measured problem.
- Browser automation becomes necessary.
- Data volume makes backups or restore too slow.
- API consumers other than the web app appear.
- The app needs near-real-time alerts or notifications.

## Known Risks

- The worker/crawler is the highest-risk subsystem.
- The current/sold default Nettiauto `haku` values may change or become invalid;
  they must be treated as Source Search Query seeds, not permanent API
  contracts.
- Nettiauto may change the AJAX response shape or listing-card `data-datalayer`
  fields without notice.
- Admin-only data can still leak if route protection and network exposure are
  casual.
- Migrations can break both API and worker at the same time.
- Untested backups are not backups.
- Same-origin proxying avoids CORS complexity, but proxy routing must be correct.
- Running Next on Bun may work in some cases, but Node.js is the safer initial
  production runtime.
- Graphile Worker simplifies infrastructure but still requires careful
  idempotency and task design.
