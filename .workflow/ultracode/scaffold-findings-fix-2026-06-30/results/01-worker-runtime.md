# Result 01-worker-runtime: worker runtime

## Summary
Worker runtime now uses a build-to-JavaScript path for future TypeScript task files.

## Evidence
- `apps/worker/package.json` now builds with `tsc` and ensures `dist/tasks` exists.
- `apps/worker/package.json` start/dev scripts point Graphile Worker at `./dist/tasks`.
- `apps/worker/tsconfig.json` emits to `dist`.
- `apps/worker/Dockerfile` runs the worker build before the runtime stage and starts Graphile Worker from `./dist/tasks`.

## Handoff
Handoff:
- Summary: The TS task loading finding is fixed by compiling source tasks before runtime.
- Changed surfaces: worker scripts, worker tsconfig, worker Dockerfile.
- Contracts satisfied: no actual worker tasks or crawler behavior added.
- Assumptions: future task files will live under `apps/worker/src/tasks`.
- Local checks: worker typecheck and build passed.
- Integration evidence: Graphile Worker no longer points at raw source tasks.
- Risks: dev watch watches compiled output, so future task edits need rebuild unless a richer dev watcher is added later.

## Files changed
- `apps/worker/package.json`
- `apps/worker/tsconfig.json`
- `apps/worker/Dockerfile`

## Decisions
Used compile-to-JS instead of adding a TypeScript loader dependency.

## Risks
No live Graphile Worker startup was run because that requires database/job table runtime state.

## Verification run
- `bun run typecheck:worker`: pass.
- `bun run build:worker`: pass.

## Open questions
None.
