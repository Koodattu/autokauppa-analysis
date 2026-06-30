# First Version End To End

## Goal

Implement the first working proof-of-concept vertical slice described by the
repository docs: fixture-backed Nettiauto Search Result Data parsing, normalized
PostgreSQL model, idempotent persistence path, product API, public noindex web
pages, and admin-only crawler status.

## Success criteria

- Current and sold fixture data parse into normalized listing records.
- Re-running the same fixture persistence does not duplicate listings,
  sightings, snapshots, or images.
- Public API returns curated analytics, listing search, filter metadata, listing
  detail, and health responses.
- Admin API status is protected by the Admin Password Gate.
- Web first screen renders public analytics with URL filters, listing table,
  listing detail route, admin login, and crawler status.
- Live crawling remains disabled unless explicitly enabled.
- Relevant package/app typechecks, tests, and builds pass or are honestly
  reported.

## Current context

- The repository is a TypeScript/Bun/Next/Hono/Drizzle scaffold with minimal
  placeholder code.
- The working tree was clean at start using `git -c safe.directory=... status
  --short`.
- Baseline commit is `aa88e7a9601ef4a0ddcfdc0673765c7e9cce7015`.
- Primary implementation contract comes from `docs/first-implementation-plan.md`
  and `docs/database-structure.md`.

## Constraints

- Keep the first version scoped to Search Result Data. No detail-page crawling,
  image downloads, accounts, Redis, ClickHouse, TimescaleDB, or public bulk API.
- Do not make live Nettiauto requests during normal tests or local startup.
- Do not log secrets, cookies, raw pages, or admin credentials.
- Public API/UI must not expose raw listing records, parser errors, VIN, or
  crawler internals.
- Match existing package boundaries: web calls API, API/worker use db/domain,
  schemas own public contracts, config owns env parsing.

## Risk level

High. This touches database schema, migrations, auth, API contracts, worker
logic, parser behavior, and web UI.

## Approval gates

No destructive repository operations, production data changes, deployment,
publishing, or secret changes are approved. Continue with local code, fixtures,
tests, and non-destructive checks only.

## Mode

Delegated mode. The user explicitly invoked `$ultracode`, native Codex agents
are available, and independent read-only discovery packets can run while the
parent implements the critical path.

## Work packets

- `01-docs-risk-review`: read-only review of docs and ADRs for first-version
  scope and risks.
- `02-codebase-discovery`: read-only mapping of current package/app structure,
  scripts, and likely implementation files.
- `03-ui-api-contract-review`: read-only review of web/API surface expectations
  and verification checks.
- Parent session: implement all code changes, integrate packet findings, and
  run verification.

## Eval contract

Full contract in `eval-contract.md`.

## Integration policy

The parent session owns all edits and decisions. Subagents are read-only and
must cite evidence. Packet findings are accepted only when supported by repo
files/docs and reconciled against the eval contract.

## Verification plan

- Run parser/domain tests with fixtures.
- Run package/app typechecks for touched workspaces.
- Run API/worker/web builds where practical.
- Run `docker compose config` if Compose changes.
- Review final diff for unrelated changes and public/admin data leakage.

## Completion criteria

The run is complete when the implementation compiles, the focused tests pass,
the first web/API/worker slice is usable from local commands, workflow artifacts
are finalized, and remaining risks are documented.
