# Packet 04-verification: checks and integration

## Objective
Run focused checks and consolidate audit evidence.

## Context
Prior scaffold verification ran successfully, but the audit should re-check the important commands when practical.

## Sources
- Command output from current run.
- Results from packets 01-03.

## Ownership
Parent session, read-only.

## Do
- Run non-destructive verification.
- Record pass/fail/skipped status.
- Integrate findings into final report.

## Do not
- Delete caches or generated build output.
- Start long-running services unless necessary.

## Expected output
Final verification evidence and remaining risks.

## Verification
Commands listed in `state.json`.

## Handoff format
Result markdown with summary, evidence, risks, and recommended parent action.
