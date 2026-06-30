# Packet 02-runtime: runtime and package wiring

## Objective
Check workspace package, script, TypeScript, dependency, and lockfile wiring.

## Context
The scaffold should support Next.js on Node, Hono on Bun, Graphile Worker on Node, Drizzle, Zod, Pino, Sentry, and TanStack packages.

## Sources
- `package.json`
- `bun.lock`
- `tsconfig*.json`
- `apps/*/package.json`
- `packages/*/package.json`
- app and package tsconfig files

## Ownership
Parent session, read-only.

## Do
- Inspect scripts and workspace dependencies.
- Look for commands that will fail in clean checkout or Docker.
- Cite file paths and line numbers.

## Do not
- Add dependencies.
- Edit manifests.

## Expected output
Runtime/package findings and recommended checks.

## Verification
Focused package-manager and TypeScript/build commands where practical.

## Handoff format
Result markdown with summary, evidence, risks, and recommended parent action.
