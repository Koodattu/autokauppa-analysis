# Open Questions

Status: architecture questions to resolve before implementation or during early
scaffolding.

## Blocking Before Implementation

1. Admin Password Gate details.

   Decide the exact session cookie behavior, password secret shape, and admin
   route protection mechanism.

2. Domain name and TLS setup.

   Caddy automatic HTTPS requires correct DNS and public access to ports 80 and
   443.

3. Crawl legality and source constraints.

   Confirm terms, robots.txt expectations, acceptable rate, and whether raw data
   storage is acceptable.

4. Initial data model implementation details.

   A proposed structure now exists in
   [Database Structure](database-structure.md). Before writing migrations,
   decide exact column names, enum implementation, indexes, and whether UUIDs or
   generated identity columns are preferred.

5. Worker runtime confirmation.

   Default is Node.js for Graphile Worker. If Bun is desired for the worker,
   compatibility must be proven before choosing it.

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
