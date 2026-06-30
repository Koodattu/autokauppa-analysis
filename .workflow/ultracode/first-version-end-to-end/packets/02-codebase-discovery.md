# Packet 02-codebase-discovery: Codebase Discovery

## Objective

Map the current scaffold, package dependencies, build scripts, and likely files
that the parent session must edit for the first implementation.

## Context

The repository currently has placeholder package exports and minimal app code.
The parent needs a concise implementation map without vendor noise.

## Sources

- `package.json`
- `apps/*/package.json`
- `packages/*/package.json`
- `apps/*/src/**`
- `packages/*/src/**`
- `docker-compose.yml`
- `Caddyfile`
- `docker/migrate.Dockerfile`
- `scripts/**`

## Ownership

Read-only codebase review.

## Do

- Use `rg --files` and ignore `node_modules`.
- Identify current dependencies already available.
- Identify scripts and TypeScript constraints.
- Note package boundary risks.

## Do not

- Edit files.
- Run broad builds or installs.
- Read vendor files.

## Expected output

- Summary
- Evidence
- Risks
- Recommended parent action

## Verification

Read-only evidence review.

## Handoff format

Use `results/02-codebase-discovery.md` shape from the packet schema.
