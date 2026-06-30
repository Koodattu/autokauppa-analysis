# Orchestration

## Parent critical path
Patch the scaffold findings, run targeted verification, then review the diff.

## Packets
- `01-worker-runtime`: parent-owned code/config edit.
- `02-compose-ops`: parent-owned Docker/Compose edit.
- `03-verification`: parent-owned command verification and final report.

## Delegation
No native agents.

## Agents
None.

## Delegation limits
Agent count 0, wave count 0.

## Wait points
None.

## Fallback
If a check fails, inspect and patch the smallest related scaffold surface.

## Verification order
Install first, typechecks second, builds third, lint and Compose config last.
