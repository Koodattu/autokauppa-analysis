# Packet 03-ops: Docker and operations scaffold

## Objective
Check Docker Compose, Dockerfiles, Caddy, env example, migration, and healthcheck scaffold.

## Context
Docs require Caddy public edge, private app services, PostgreSQL health checks, explicit migrations, and production-safe env conventions.

## Sources
- `docker-compose.yml`
- `Caddyfile`
- `.env.example`
- `.dockerignore`
- `apps/*/Dockerfile`
- `docker/migrate.Dockerfile`
- `docs/operations-and-security.md`

## Ownership
Parent session, read-only.

## Do
- Inspect service dependency and build path consistency.
- Check for clean-checkout Docker build/runtime blockers.
- Cite file paths and line numbers.

## Do not
- Start containers.
- Edit Docker files.

## Expected output
Ops scaffold findings and risks.

## Verification
`docker compose config --quiet`; build review by inspection unless starting Docker is necessary.

## Handoff format
Result markdown with summary, evidence, risks, and recommended parent action.
