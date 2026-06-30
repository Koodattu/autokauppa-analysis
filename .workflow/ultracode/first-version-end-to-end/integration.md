# Integration

## Accepted

- Docs review scope: first proof-of-concept slice only.
- Codebase map: scaffold had no business logic and needed shared packages first.
- API/UI contract: compact public/admin route set with capped listing pagination.
- Public health should not expose crawler configuration; removed after review.

## Rejected

- Full future milestone implementation beyond the first useful demo.
- Live source probing or live crawler verification during normal checks.
- Public raw listing access, bulk export, or crawler internals.

## Conflicts

- Cheerio main import triggered a Bun test resolver issue through encoding
  dependencies. Resolved by using `cheerio/slim`, which still provides
  structured HTML parsing for fragments.

## Decisions

- Added Cheerio to `packages/domain` as a justified server-only parser
  dependency.
- Used postgres-js queries in the domain read/write layer while keeping Drizzle
  schema and migration as the database contract.
- Kept live worker tasks disabled unless `CRAWLER_ENABLED=true` and
  `CRAWLER_PAUSED=false`.
- Added Next rewrites for `/api/*` so direct local web development can proxy to
  Hono when the API service is running.

## Final changes

- Typed config, logging redaction, Zod API/source schemas.
- Drizzle schema and initial migration with seeded current/sold source queries.
- Nettiauto AJAX fixture parser, auth cookie helpers, idempotent persistence,
  product/admin SQL read models.
- Hono public/admin routes and admin middleware.
- Graphile Worker task files for scheduling, crawling, and finalization.
- Next analytics, listing detail, admin login, admin crawler status pages.
- README and env/Compose updates.

## Verification still needed

- Apply the migration against a real PostgreSQL instance and run an idempotent
  fixture persistence check there.
- Docker image build smoke for the full Compose stack.

## Remaining risks

- Source/legal posture and crawl cadence need explicit review before live
  crawling.
- Public analytics quality depends on crawl coverage.
- DB-backed behavior was compiled but not executed against a live database in
  this workspace.
