# Result 02-compose-ops: compose and ops scaffold

## Summary
Compose and Docker scaffold findings were tightened: required sensitive env vars, explicit empty-migration opt-in, worker healthcheck, and pinned app/Caddy image tags.

## Evidence
- Compose now uses required interpolation for `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, and `POSTGRES_PASSWORD`.
- `.env.example` includes `ALLOW_EMPTY_MIGRATIONS=true` with a scaffold-only note.
- `docker/migrate.Dockerfile` exits non-zero without migration metadata unless `ALLOW_EMPTY_MIGRATIONS=true`.
- Worker service has a Node/pg database healthcheck.
- App Dockerfiles use `oven/bun:1.3.9` and `node:24.4.1-slim`.
- Caddy image is pinned to `caddy:2.10.2-alpine`.

## Handoff
Handoff:
- Summary: The Compose/ops findings are fixed for scaffold use.
- Changed surfaces: Compose, env example, migrate Dockerfile, app Dockerfiles.
- Contracts satisfied: no schema, auth, or worker task behavior added.
- Assumptions: PostgreSQL remains pinned by major version per docs.
- Local checks: Compose config with `.env.example` passed; without env it failed on required `DATABASE_URL`.
- Integration evidence: required env interpolation and migration guard are visible in diff.
- Risks: image tag existence was not proven by pulling/building images.

## Files changed
- `.env.example`
- `apps/api/Dockerfile`
- `apps/web/Dockerfile`
- `apps/worker/Dockerfile`
- `docker-compose.yml`
- `docker/migrate.Dockerfile`

## Decisions
Left `postgres:18-alpine` as-is because repository docs specifically require a PostgreSQL major version pin.

## Risks
No Docker image build smoke was run.

## Verification run
- `docker compose --env-file .env.example config --quiet`: pass, with Docker sandbox config warning.
- `docker compose config --quiet`: intentionally fails because `DATABASE_URL` is required.
- `node -e "const { Client } = require('pg'); console.log(typeof Client)"` in `apps/worker`: pass.

## Open questions
None.
