# Packet 01-worker-runtime: worker runtime

## Objective
Make Graphile Worker runtime wiring compatible with future TypeScript task source.

## Context
The audit found worker scripts and Docker command pointing Graphile Worker at `src/tasks` while the build emitted no JavaScript and no TypeScript loader was configured.

## Sources
- `apps/worker/package.json`
- `apps/worker/tsconfig.json`
- `apps/worker/Dockerfile`

## Ownership
Parent session.

## Do
- Change worker build to emit JavaScript.
- Point production/start runtime at compiled task output.
- Keep dev workflow simple and scaffold-only.

## Do not
- Add actual worker tasks or crawler logic.
- Add broad new dependencies unless required.

## Expected output
Worker scaffold can typecheck, build, and run against compiled task directory.

## Verification
`bun run typecheck:worker` and `bun run build:worker`.

## Handoff format
Result markdown with changed files, verification, and risks.

## Write scope
- `apps/worker/package.json`
- `apps/worker/tsconfig.json`
- `apps/worker/Dockerfile`
- `apps/worker/src/tasks/.gitkeep`

## Coordination rule
You are not alone in the codebase. Do not revert edits made by others. Adapt to nearby changes.
