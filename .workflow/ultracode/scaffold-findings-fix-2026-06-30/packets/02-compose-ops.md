# Packet 02-compose-ops: compose and ops scaffold

## Objective
Fix Compose and Docker scaffold findings around secrets, migration guard, worker health, and image tag drift.

## Context
The audit found placeholder secret defaults, no-op migrations, missing worker healthcheck, and major-only base image tags.

## Sources
- `docker-compose.yml`
- `docker/migrate.Dockerfile`
- `.env.example`
- app Dockerfiles
- `package.json`

## Ownership
Parent session.

## Do
- Require sensitive env vars in Compose instead of defaulting to known placeholders.
- Keep `.env.example` as example-only.
- Make migration no-op explicit only when allowed by env.
- Add a worker healthcheck command that is meaningful for the scaffold.
- Pin base images to current scaffold tool versions.

## Do not
- Start services.
- Implement auth, migration schema, or worker tasks.

## Expected output
Compose config remains valid and safer for production-like use.

## Verification
`docker compose config --quiet`.

## Handoff format
Result markdown with changed files, verification, and risks.

## Write scope
- `docker-compose.yml`
- `docker/migrate.Dockerfile`
- `.env.example`
- `apps/api/Dockerfile`
- `apps/web/Dockerfile`
- `apps/worker/Dockerfile`

## Coordination rule
You are not alone in the codebase. Do not revert edits made by others. Adapt to nearby changes.
