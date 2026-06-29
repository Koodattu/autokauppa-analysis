# Testing and Quality

Status: planned quality strategy only. No implementation exists yet.

## Quality Bar

The system should be boring to change:

- Small changes.
- Typed boundaries.
- Explicit migrations.
- Reproducible tests.
- Real database checks where database behavior matters.
- Fixture-based crawler tests.

## Test Types

### Unit Tests

Use for:

- Pure domain logic.
- Price/mileage parsing.
- Normalization helpers.
- Zod schema behavior.
- URL/source helpers.

### API Integration Tests

Use a real PostgreSQL database for meaningful API tests.

Cover:

- Request validation.
- Auth/authorization.
- Error format.
- Pagination/filtering/sorting.
- Database writes.
- Job enqueue behavior.

### Worker Tests

Worker tests are high priority.

Cover:

- Job payload validation.
- Idempotent writes.
- Retry-safe behavior.
- Parser fixtures.
- Source layout changes.
- Duplicate source listings.
- Removed/reappeared listings.
- Snapshot creation.

### Migration Tests

Every migration should be runnable against a real PostgreSQL instance.

Test:

- Fresh database migration.
- Existing database migration.
- Basic query compatibility after migration.

### Frontend Tests

Use browser tests for critical flows:

- Dashboard loads.
- Filters update data.
- Table sorting/pagination works.
- Empty state is understandable.
- Loading state is stable.
- Error state is actionable.

### End-to-End Smoke Tests

At minimum:

```text
web is reachable through Caddy
api health works through Caddy
api can reach PostgreSQL
worker can reach PostgreSQL
migrations applied
```

## Recommended Tools

Likely tools:

- Vitest for TypeScript unit/integration tests.
- Playwright for browser/e2e tests.
- Docker Compose or testcontainers-style setup for PostgreSQL integration tests.
- TypeScript strict mode.
- ESLint and formatter.

Exact tooling can be finalized during scaffolding.

## Static Checks

Expected CI checks:

```text
format
lint
typecheck
unit tests
integration tests
build web
build api
build worker
```

For documentation-only changes, lighter checks are acceptable.

## Contract Discipline

The API must not rely on untyped JSON assumptions.

Use one of:

- Hono RPC-style typing.
- OpenAPI generated from route schemas.
- Shared Zod schemas plus typed API client wrappers.

Do not scatter handwritten `fetch` calls with ad hoc response shapes across the
frontend.

## Database Quality

Database changes should include:

- Drizzle schema update.
- Generated migration.
- Index review.
- Constraint review.
- Integration test or migration verification.

Prefer database constraints for invariants that must survive bugs and retries.

## Crawler Fixture Policy

Crawler parsers should be tested against saved fixtures.

Fixtures should be:

- Small enough to review.
- Sanitized if needed.
- Versioned when source layouts change.
- Paired with expected parsed output.

Do not let live network behavior be the only parser test.

## Performance Checks

Initial performance work should be pragmatic:

- Add indexes for known filters and joins.
- Avoid N+1 queries.
- Use pagination.
- Use virtualized tables.
- Add materialized views or aggregate tables only when needed.

Do not add ClickHouse/TimescaleDB before PostgreSQL has been measured and tuned.

## Definition of Done for Implementation Changes

For future implementation work, a change is done when:

- It is scoped to the requested behavior.
- It preserves architecture boundaries.
- It has the smallest relevant tests/checks.
- It does not introduce unrelated refactors.
- It does not expose secrets.
- It does not make migrations implicit.
- It updates docs if architecture or operations changed.
