# Scaffold audit

## Goal
Audit the tech stack scaffold for structural, package, runtime, Docker, and verification risks. Do not judge missing business logic or UI as defects.

## Success criteria
- Identify scaffold issues that would block or mislead future implementation.
- Cite exact files and lines for findings.
- Verify with focused commands where practical.
- Avoid editing product scaffold during the audit.

## Current context
- Repository is transitioning from docs-only to an initialized scaffold.
- The intended stack is TypeScript monorepo, Bun workspace, Next.js web, Bun/Hono API, Node/Graphile Worker, PostgreSQL, Drizzle, Caddy, and Docker Compose.
- Working tree contains uncommitted scaffold files and ignored build/cache artifacts from prior verification.

## Constraints
- Audit tech stack scaffold only.
- No business logic, data model, crawler behavior, or UI implementation expected.
- Do not commit, push, deploy, or make destructive changes.

## Risk level
Medium. The scaffold spans several runtime boundaries and Docker build paths, but no production data or public behavior exists yet.

## Approval gates
No approval needed for read-only review and non-destructive verification. Approval would be required before deleting generated caches or changing scaffold files.

## Mode
Workflow mode. Native delegation was not used because the host delegation tool requires explicit subagent/delegation wording; the `$ultracode` skill invocation alone is handled here through workflow artifacts and parent-session packet passes.

## Work packets
- `01-structure`: inspect monorepo/package/source layout against docs.
- `02-runtime`: inspect package scripts, TypeScript, dependency, and lockfile wiring.
- `03-ops`: inspect Docker Compose, Dockerfiles, Caddy, env, and migration scaffold.
- `04-verification`: run or trust focused checks and consolidate evidence.

## Eval contract
- Outcome: scaffold audit with actionable findings only.
- Shared surfaces: workspace package graph, Docker build/runtime config, env/migration conventions.
- Required checks: file review, package graph review, TypeScript/build/config verification where practical.
- Blocking conditions: inability to read scaffold files or run basic local commands.
- Handoff evidence: file path/line evidence and command results.

## Integration policy
Parent session integrates all packet results. Findings require source evidence and must exclude missing product behavior.

## Verification plan
- Review key scaffold files with line numbers.
- Run `bun install --frozen-lockfile` if useful.
- Run typechecks/builds/config validation if prior evidence is stale or suspect.
- Report skipped checks explicitly.

## Completion criteria
- Results are integrated into `final-report.md`.
- Final answer leads with findings ordered by severity.
