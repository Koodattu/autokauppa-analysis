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

## Compose Startup

Compose service ordering must use health checks where readiness matters.

Important dependency expectations:

- `postgres` must be healthy before `migrate`.
- `migrate` must complete successfully before `api` and `worker` are considered
  deployable.
- `api` must be healthy before Caddy routes traffic to it.
- `web` must be healthy before Caddy routes traffic to it.

Plain startup order is not enough when a service takes time to become ready.

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

Do not build custom auth.

Private first does not mean auth can be ignored. Pick an auth solution before
implementation because it affects:

- Session storage.
- Cookies.
- CSRF posture.
- API authorization.
- Admin roles.
- Database schema.
- SSR behavior.

Every sensitive API endpoint must enforce authorization in the API layer.

## Rate Limiting

Internal private use may not need aggressive rate limiting at launch, but the
architecture should leave room for:

- Login rate limits.
- API mutation rate limits.
- Worker source rate limits.
- Caddy-level request controls if public exposure grows.

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
