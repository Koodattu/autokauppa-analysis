# Packet 01-structure: scaffold structure

## Objective
Check whether the created repository structure matches the documented stack boundaries.

## Context
Docs describe `apps/web`, `apps/api`, `apps/worker`, and shared packages under `packages`.

## Sources
- `README.md`
- `docs/architecture.md`
- `package.json`
- `apps/**`
- `packages/**`

## Ownership
Parent session, read-only.

## Do
- Inspect layout and package names.
- Identify missing or misleading scaffold structure.
- Cite file paths and line numbers.

## Do not
- Flag missing business logic, data models, crawler tasks, or UI.
- Edit files.

## Expected output
Evidence-backed structure findings and risks.

## Verification
Static file review.

## Handoff format
Result markdown with summary, evidence, risks, and recommended parent action.
