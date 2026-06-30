# Orchestration

## Parent critical path

Read implementation contracts, create workflow artifacts, implement code
changes, integrate findings, run checks, and finalize reports.

## Packets

- `01-docs-risk-review`: docs and ADR scope/risk review.
- `02-codebase-discovery`: current code/package/script map.
- `03-ui-api-contract-review`: public/admin API and UI contract review.

## Delegation

Use read-only explorer agents only. No write-capable agents are planned because
the implementation crosses shared contracts and the scaffold is small enough
for parent-owned integration.

## Agents

Three explorer agents, one wave, all read-only.

## Delegation limits

Maximum 3 agents for this run unless the user approves more. No broad
implementation wave.

## Wait points

Parent continues implementation discovery while agents run. Wait before
finalizing contracts or starting edits that conflict with packet findings.

## Fallback

If agents are unavailable or blocked, execute packet reviews in the parent
session and record the reason in `state.json`.

## Verification order

1. Focused tests.
2. Package/app typechecks.
3. API/worker/web builds.
4. Compose/config smoke if touched.
5. Diff and workflow final audit.
