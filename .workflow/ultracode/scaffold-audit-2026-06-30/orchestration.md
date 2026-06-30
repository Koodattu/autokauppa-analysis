# Orchestration

## Parent critical path
Read scaffold files, identify concrete risks, verify findings with local commands when practical, and produce a review-style final answer.

## Packets
- `01-structure`: parent, read-only.
- `02-runtime`: parent, read-only.
- `03-ops`: parent, read-only.
- `04-verification`: parent, read-only.

## Delegation
No native agents.

## Agents
None.

## Delegation limits
Agent count 0, wave count 0.

## Wait points
None.

## Fallback
If a command cannot run, record the blocker and continue with static file review.

## Verification order
Static review first, command verification second, final integration last.
