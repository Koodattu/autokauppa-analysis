# Result 02-runtime: runtime and package wiring

## Summary
Core typecheck/build scripts pass. The main runtime concern is the Graphile Worker scaffold: it points to TypeScript task source without either compiling tasks or configuring Graphile Worker to load TypeScript.

## Evidence
- Worker scripts run `graphile-worker --task-directory ./src/tasks`: `apps/worker/package.json:6-7`.
- Worker build is `tsc --noEmit`, so it does not produce JavaScript task files: `apps/worker/package.json:8-9`.
- Worker Docker command also points at `./src/tasks`: `apps/worker/Dockerfile:26`.
- No local `ts-node`, `NODE_OPTIONS`, `fileExtensions`, or Graphile config was found in the scaffold.
- Graphile Worker current docs require a TypeScript loader and `.ts` file extension configuration for direct TypeScript task loading, or compiled JavaScript task files.

## Handoff
Handoff:
- Summary: Worker runtime script is not ready for future TypeScript task files.
- Changed surfaces: none.
- Contracts satisfied: package graph otherwise verified.
- Assumptions: future worker tasks will be TypeScript based on the repo stack.
- Local checks: typechecks/builds pass because there are no task files yet.
- Integration evidence: finding raised.
- Risks: first real worker task can fail to load or be ignored at runtime.

## Files changed
None.

## Decisions
Classify this as a scaffold-level P2 because it affects the first worker implementation, not current empty source.

## Risks
Future worker implementation may appear to compile while runtime task discovery is broken.

## Verification run
- `bun install --frozen-lockfile`: pass.
- `bun run typecheck:packages`: pass.
- `bun run typecheck:web`: pass.
- `bun run typecheck:api`: pass.
- `bun run typecheck:worker`: pass.
- `bun run build:api`: pass.
- `bun run build:worker`: pass.
- `bun run build:web`: pass.
- `bun --cwd apps/web lint`: pass.

## Open questions
Choose whether worker tasks should be compiled to `dist/tasks` or loaded directly with a TypeScript loader.
