# Packet 03-ui-api-contract-review: UI API Contract Review

## Objective

Identify the smallest coherent public/admin API and web UI contract that
satisfies the first-version docs without exposing admin/raw data.

## Context

The parent session will implement Hono API endpoints and Next pages. The web UI
should be usable immediately, noindex, and URL-filtered.

## Sources

- `docs/product-analytics.md`
- `docs/architecture.md`
- `docs/operations-and-security.md`
- `docs/first-implementation-plan.md`
- `apps/api/src/index.ts`
- `apps/web/src/app/**`
- `packages/schemas/src/index.ts`

## Ownership

Read-only API/UI contract review.

## Do

- Propose endpoint names, query params, and response shape categories.
- Identify admin-only surfaces and public-safe surfaces.
- Identify web routes/pages needed for the first slice.
- Recommend focused checks for auth and UI integration.

## Do not

- Edit files.
- Add new product features.
- Recommend raw listing access from public endpoints.

## Expected output

- Summary
- Evidence
- Risks
- Recommended parent action

## Verification

Read-only evidence review.

## Handoff format

Use `results/03-ui-api-contract-review.md` shape from the packet schema.
