# Scaffold findings fix

## Goal
Fix the scaffold-level findings from the prior audit without adding business logic, crawler behavior, data models, or UI.

## Success criteria
- Worker Graphile runtime can use future TypeScript task source through an explicit build-to-JS path.
- Compose no longer supplies known production-sensitive placeholder secrets by default.
- Migration scaffold fails closed in production-like runs when expected migration metadata is missing.
- Worker service has a health signal.
- Docker base image tags are intentionally pinned to current major/minor/patch tags used by the scaffold.
- Existing install, typecheck, build, lint, and Compose config checks pass.

## Current context
- Working tree was clean before this fix pass.
- The scaffold targets a TypeScript/Bun workspace with Next.js web, Bun/Hono API, Node/Graphile Worker, Drizzle, PostgreSQL, Caddy, and Docker Compose.

## Constraints
- Keep changes surgical and scaffold-only.
- Do not implement product UI, business logic, data models, auth, crawler logic, or real worker tasks.
- Do not commit, push, deploy, or start long-running services.

## Risk level
Medium. Changes affect package scripts and container runtime wiring, but no production data or product behavior exists.

## Approval gates
No approval required for local non-destructive scaffold edits and verification commands.

## Mode
Workflow mode. Native subagents were not used because this host's delegation policy requires explicit subagent/delegation wording beyond invoking `$ultracode`.

## Work packets
- `01-worker-runtime`: compile worker TypeScript to JavaScript and point Graphile Worker at compiled task output.
- `02-compose-ops`: tighten Compose env, migration guard, worker healthcheck, and image tags.
- `03-verification`: run focused checks and summarize.

## Eval contract
- Outcome: previous audit findings are fixed or intentionally documented with residual risk.
- Shared surfaces: worker scripts/tsconfig/Dockerfile, Compose env and healthchecks, migration Dockerfile, image tags.
- Required checks: frozen install, typechecks, builds, web lint, Compose config render.
- Blocking conditions: package graph breakage, TypeScript failure, Docker Compose config failure.
- Handoff evidence: file diffs and command output.

## Integration policy
Parent session owns all edits and verification. Do not accept changes that expand beyond scaffold/runtime wiring.

## Verification plan
- `bun install --frozen-lockfile`
- `bun run typecheck:packages`
- `bun run typecheck:web`
- `bun run typecheck:api`
- `bun run typecheck:worker`
- `bun run build:api`
- `bun run build:worker`
- `bun run build:web`
- `bun --cwd apps/web lint`
- `docker compose config --quiet`

## Completion criteria
- All required checks pass or are explicitly reported.
- Workflow final report is written.
- Final response states what was fixed and any remaining risk.
