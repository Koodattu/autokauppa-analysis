# Operations and Security

Status: planned operational guidance only. No implementation exists yet.

## Deployment Target

Initial deployment target:

```text
single Linux server
Docker Compose
public ports: 80, 443
private Docker network for all app services
PostgreSQL volume
Caddy data volume
backup destination outside the app volume
```

Local implementation does not require the production domain or public TLS. The
base Compose setup may be used with `SITE_ADDRESS=:80` or direct service ports.
Production deployment must supply the real subdomain through environment values
or a small Compose override if Caddy settings diverge from local development.

## Public Edge

Use Caddy as the only public edge.

Public:

- `80/tcp`
- `443/tcp`

Private:

- Next.js internal port.
- Hono API internal port.
- PostgreSQL port.
- Worker process.
- Migration process.
- Metrics or admin endpoints.

## TLS

Caddy should manage certificates automatically.

Requirements:

- DNS points to the server.
- Ports 80 and 443 are reachable.
- Caddy data volume is persisted.
- The Caddyfile is versioned.

Avoid certbot unless Caddy is rejected for a concrete reason.

Domain and TLS setup are deployment prerequisites, not blockers for local
implementation or tests. Before production deployment, DNS must point the chosen
subdomain to the server and ports 80 and 443 must be reachable so Caddy can
complete automatic HTTPS.

## Compose Startup

Compose service ordering must use health checks where readiness matters.

Important dependency expectations:

- `postgres` must be healthy before `migrate`.
- `migrate` must complete successfully before `api` and `worker` are considered
  deployable.
- `api` must be healthy before Caddy routes traffic to it.
- `web` must be healthy before Caddy routes traffic to it.

Plain startup order is not enough when a service takes time to become ready.

On small VPS instances, run Compose builds serially:

```bash
COMPOSE_PARALLEL_LIMIT=1 docker compose up -d --build
```

The service Dockerfiles currently install workspace dependencies during each
image build. Building `api`, `worker`, `web`, and `migrate` in parallel can
exhaust memory and produce exit code 137 during `bun install`.

PostgreSQL 18 Docker images expect the persistent volume at
`/var/lib/postgresql`, not `/var/lib/postgresql/data`. If a first deploy created
a broken volume using the old mount path and migrations never ran, it can be
removed and recreated. Do not remove this volume after real data exists unless a
backup and restore plan is in place.

Reference: https://docs.docker.com/compose/how-tos/startup-order/

## Migrations

Use one explicit migration path:

```text
build image
start postgres
run migrate service
start or restart api/web/worker
verify health
```

Rules:

- Migrations are generated from Drizzle schema changes.
- Generated SQL migrations are committed.
- API and worker do not run migrations implicitly on startup.
- Migrations should be tested against a real PostgreSQL instance before deploy.
- Destructive migrations require backups and explicit review.

## Secrets

Do not commit secrets.

Use environment variables or Docker secrets for:

- Database password.
- Session/auth secrets.
- Sentry DSN.
- Caddy/DNS challenge credentials, if ever needed.
- API tokens.

Required practice:

- Keep `.env.example` safe and non-secret.
- Validate required env vars at startup with Zod.
- Fail fast on missing or malformed production config.

## Database Operations

PostgreSQL requirements:

- Pin major version.
- Use a named persistent volume.
- Do not expose the port publicly.
- Enable health checks.
- Monitor disk usage.
- Have a backup and restore process before launch.

Backups:

- Schedule regular `pg_dump` or stronger backup strategy.
- Store backups outside the application database volume.
- Prefer off-server backup storage.
- Alert on backup failure.
- Test restore on a clean database.

Restore testing is a release requirement, not a nice-to-have.

## Logging

All services should log structured JSON to stdout.

Required conventions:

```text
service
env
version or git sha
requestId
jobId
durationMs
status
error.name
error.message
error.stack, server-side only
```

Development may use pretty logs. Production should emit JSON.

## Request IDs and Job IDs

Every inbound request should get a request ID.

Every worker job should get a job ID.

When an API request enqueues a job, logs should make the relationship visible:

```text
requestId -> jobId
```

## Error Reporting

Use Sentry for:

- Unhandled web errors.
- API exceptions.
- Worker task failures that exceed expected retry behavior.

Do not send secrets or full raw scraped pages to Sentry.

## Health Checks

Each long-running service should have a health signal.

Expected checks:

- `web`: process up and serving.
- `api`: process up and can reach required dependencies.
- `worker`: process up and can reach PostgreSQL/job tables.
- `postgres`: database readiness.

For API health, separate:

- Liveness: process is alive.
- Readiness: dependencies are reachable.

## Security Defaults

Baseline rules:

- Run containers as non-root where practical.
- Do not mount the Docker socket into app containers.
- Do not expose PostgreSQL publicly.
- Do not expose Drizzle Studio or admin tools publicly.
- Use least-privilege database users where practical.
- Keep images patched.
- Pin base image versions intentionally.
- Avoid `latest` tags in production.
- Configure security headers at the proxy or app layer.
- Keep CORS closed by default.

## CORS

Normal browser traffic should not need cross-origin CORS.

Use:

```text
https://app.example.com/      -> web
https://app.example.com/api/* -> api
```

Only configure CORS if a real separate origin exists.

Rules if CORS is needed:

- No wildcard origins with credentials.
- Use explicit allowed origins.
- Keep allowed methods and headers narrow.
- Test preflight behavior.

## Authentication and Authorization

The analytics and Listing UI are public. Admin and crawler operations are
private.

The first implementation will use a deliberately minimal Admin Password Gate for
admin access. It should use HTTPS, one admin password from the `ADMIN_PASSWORD`
environment secret, an HTTP-only secure stateless session cookie signed with
`SESSION_SECRET`, and no public registration, roles, user accounts, or
database-backed admin session table.

The cookie format should stay simple: a base64url-encoded JSON payload plus an
HMAC-SHA256 signature, with no sensitive values in the payload. The payload
should contain only a version, issued-at timestamp, expiry timestamp, and fixed
admin scope. Cookie attributes should be `HttpOnly`, `SameSite=Lax`, `Path=/`,
`Secure` in production, and a first-version lifetime of about seven days.

The Admin Password Gate protects:

- Admin Panel routes.
- Crawler Status.
- Crawl controls, if any.
- Parser/reprocessing controls, if any.
- Admin-only API routes.
- Raw Listing Data.
- Parser errors.

Every sensitive API endpoint must enforce authorization in the API layer.

Full auth must replace the Admin Password Gate before public user accounts,
multi-user access, or roles.

Database-backed admin sessions may be introduced later if logout revocation,
session audit, multiple admins, or stronger operational controls become
necessary.

A hashed admin password secret may be introduced later if operational handling
of plain environment secrets becomes uncomfortable. For the first version,
`ADMIN_PASSWORD` and `SESSION_SECRET` must remain separate high-entropy secrets
and must not be logged.

Public analytics and Listing endpoints may expose curated Public Listing Data.
Registration Number is public by default when visible in the Source. VIN, Raw
Listing Data, crawler internals, parser errors, and admin operations remain
admin-only.

The public Product API is not a general open data API. Bulk export, unbounded
listing dumps, Raw Listing Data access, and crawler/admin operations are out of
scope for unauthenticated public access.

## Rate Limiting

Public analytics endpoints should have conservative request controls if traffic
or abuse becomes a concern. The architecture should leave room for:

- Login rate limits.
- API mutation rate limits.
- Worker source rate limits.
- Caddy-level request controls.

## Rollback

Rollback must consider both code and database state.

Minimum expectations:

- Image tags or git SHAs identify deployed versions.
- Backups exist before destructive migrations.
- Migrations are reviewed for rollback risk.
- Deploy notes include migration impact.

## Monitoring

Minimum monitoring before serious use:

- HTTP uptime check.
- Disk usage alert.
- Backup success/failure alert.
- PostgreSQL container health.
- Worker freshness/staleness.
- Sentry alerting.

Defer heavy observability stacks until needed.
