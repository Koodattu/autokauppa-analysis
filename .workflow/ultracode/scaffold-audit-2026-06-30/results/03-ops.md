# Result 03-ops: Docker and operations scaffold

## Summary
Compose renders successfully. Ops risks are around production-secret defaults, a migration no-op gate, missing worker healthcheck, and unpinned base image patch versions.

## Evidence
- Compose defaults API and database secrets to `change-me`: `docker-compose.yml:48-50`, `docker-compose.yml:96`.
- Docs require secrets and fail-fast production config: `docs/operations-and-security.md:86-102`.
- The migrate container exits successfully without migration metadata: `docker/migrate.Dockerfile:19`.
- API/worker depend on `migrate` success: `docker-compose.yml:55-56`, `docker-compose.yml:76-77`.
- Docs say the migrate service should apply committed migrations before services roll forward: `docs/architecture.md:201-202`.
- Worker service has no healthcheck block: `docker-compose.yml:63-77`.
- Docs expect a worker health signal that can reach PostgreSQL/job tables: `docs/operations-and-security.md:168-176`.
- Base images are major-only tags: `apps/web/Dockerfile:1`, `apps/web/Dockerfile:22`, `apps/api/Dockerfile:1`, `apps/worker/Dockerfile:1`, `apps/worker/Dockerfile:18`.

## Handoff
Handoff:
- Summary: Compose syntax passes, but production safety guardrails need tightening before this scaffold is used beyond local dev.
- Changed surfaces: none.
- Contracts satisfied: Caddy, Postgres volume, and service ordering are present.
- Assumptions: current no-op migration is only for the empty schema scaffold.
- Local checks: `docker compose config --quiet` passed with Docker sandbox config warnings.
- Integration evidence: findings raised.
- Risks: accidental deploy with placeholder secrets; app services starting after skipped migrations; worker failure not visible to Compose.

## Files changed
None.

## Decisions
Keep image tag pinning as a lower-severity risk because the user requested latest scaffolding, but production docs still require intentional pins.

## Risks
No container image build was run; Dockerfile runtime issues beyond static review are not fully excluded.

## Verification run
- `docker compose config --quiet`: pass; Docker warned it could not read `C:\Users\Juha\.docker\config.json` in the sandbox.

## Open questions
Whether to split local and production Compose files now or keep one Compose file with required env vars.
