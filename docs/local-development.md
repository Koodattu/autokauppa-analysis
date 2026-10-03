# Local development and disposable fixtures

Run from the repository root with the Bun version in `package.json`, Node.js,
and Docker available. Install locked dependencies with
`bun install --frozen-lockfile`. The examples below use PowerShell and explicit
synthetic configuration; do not copy an existing deployment connection string.

## Create isolated PostgreSQL databases

The container has a unique name, localhost-only dynamic port, resource limits,
and temporary storage. Save `$fixtureContainer` and `$fixturePort` in this shell
for cleanup. Stop if a command fails.

```powershell
$fixtureContainer = 'nettiauto-fixtures-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
docker run --detach --rm --name $fixtureContainer --memory=768m --cpus=2 --publish 127.0.0.1::5432 --mount type=tmpfs,destination=/var/lib/postgresql --env POSTGRES_DB=nettiauto_storage_fixture_test --env POSTGRES_USER=goal_test --env POSTGRES_PASSWORD=local-goal-test postgres:18
$fixturePort = (docker port $fixtureContainer 5432/tcp).Split(':')[-1]
docker exec $fixtureContainer pg_isready -U goal_test -d nettiauto_storage_fixture_test
```

Wait for `pg_isready` to report accepting connections, then create the separate
preview database and migrate both. Integration tests truncate tables, so never
point them at a database containing work you want to retain.

```powershell
docker exec $fixtureContainer createdb -U goal_test nettiauto_preview_test
$env:TEST_DATABASE_URL = "postgres://goal_test:local-goal-test@127.0.0.1:$fixturePort/nettiauto_storage_fixture_test"
$env:DATABASE_URL = $env:TEST_DATABASE_URL
bun --no-env-file --cwd packages/db migrate
$env:DATABASE_URL = "postgres://goal_test:local-goal-test@127.0.0.1:$fixturePort/nettiauto_preview_test"
bun --no-env-file --cwd packages/db migrate
```

## Seed and run the public preview

The checked-in seed creates 60 synthetic listings, including 48 current and 12
sold listings, two observation dates, and completed crawl coverage. It refuses
non-local targets, any database other than `nettiauto_preview_test`, and a
nonempty listing table. Source links use `example.invalid`; it fetches no data
or images. Dates are fixed in September/October 2026 for repeatable history.
Three listings have no usable latest price: `9000001` (zero), `9000002`
(missing), and sold listing `9000048` (zero). Their historical/source evidence
remains available; they should sort after real prices and stay outside budget
filters. Lookup `9000001` to check that a missing latest price is not a reduction.

```powershell
$integrationDatabase = $env:TEST_DATABASE_URL
$env:TEST_DATABASE_URL = $env:DATABASE_URL
bun --no-env-file work/goal-improvement/seed-preview.ts
$env:TEST_DATABASE_URL = $integrationDatabase
$env:APP_ENV = 'test'
$env:ADMIN_PASSWORD = 'goal-local-admin'
$env:SESSION_SECRET = 'goal-local-session-for-disposable-testing'
$env:CRAWLER_ENABLED = 'false'
$env:CRAWLER_PAUSED = 'true'
$env:CRAWLER_DETAIL_ENABLED = 'false'
$env:HERO_IMAGE_ARCHIVE_ENABLED = 'false'
$env:PORT = '3101'
bun --no-env-file apps/api/src/index.ts
```

In a second PowerShell terminal at the repository root:

```powershell
$env:INTERNAL_API_BASE_URL = 'http://127.0.0.1:3101'
$env:NEXT_PUBLIC_API_BASE_PATH = '/api'
$env:NEXT_TELEMETRY_DISABLED = '1'
bun --no-env-file --cwd apps/web dev --hostname 127.0.0.1 --port 3100
```

Open [the preview](http://127.0.0.1:3100). The API's
[/health](http://127.0.0.1:3101/health) and
[/ready](http://127.0.0.1:3101/ready) expose process and database readiness.
No worker is needed. The test admin password above permits inspection of the
local dashboard; leave crawler controls disabled.

Useful manual checks:

- Listings → Current + sold → Recently observed: 60 results; page and saved-view
  links retain both choices.
- Analyze → add comparison → page comparison evidence: the primary page stays
  unchanged. Use September 2026 for historical fixture observations.
- Open each group's cars/dates editor, compare September with October 2026,
  swap the groups and reset one side. The other scope remains intact. Follow
  a listing from evidence page 2 and use Back to price research: both scopes,
  page and table position are restored. July 2026 explains the missing history.
- Lookup `not-a-listing`, then correct to `9000000`: input survives validation
  and the listing shows two observations and a €1,000 reduction.
- Save five cars, choose two for comparison, then clear selection: all five saved cars remain. Reopen Saved & compare to inspect stored price, availability and observation dates; Refresh evidence retrieves the latest stored values.
- Compare two cars, choose a reference and differences only. Save a named research view and reopen it.
- Download a historical evidence page and an independent comparison page: each CSV contains exactly the displayed rows, its own filters/dates, and the correct price basis.
- At a narrow viewport, scroll a selected listing to its final source details;
  the comparison tray leaves them reachable.
- Stop only the local API, retry an open filtered route, restart the API, and
  retry again: the view recovers with the same URL context.

## Verification

In a third terminal, set `TEST_DATABASE_URL` to the **fixture** database URL
created above (substitute the recorded port). It must be localhost and named
exactly `nettiauto_storage_fixture_test` for the complete integration command.

```powershell
$env:TEST_DATABASE_URL = "postgres://goal_test:local-goal-test@127.0.0.1:<port>/nettiauto_storage_fixture_test"
bun run --no-env-file test:integration
bun run --no-env-file test
bun run --no-env-file typecheck:packages
bun run --no-env-file typecheck:web
bun run --no-env-file typecheck:api
bun run --no-env-file typecheck:worker
bun --no-env-file --cwd apps/web lint
bun --no-env-file --cwd apps/api build
bun --no-env-file --cwd apps/worker build
```

`test:integration` selects all six domain/API/worker database suites, runs them
serially, and fails early for an absent or unsuitable target. Full `test` also
runs those suites when the same variable is set; with it unset, database suites
are skipped. Crawler integration tests use fixture transports, not live crawls.

Stop the web dev server before `bun --no-env-file --cwd apps/web build`, using
the same explicit web environment and running local API. They share `.next`.
Do not run tests against the preview while browsing it.

## Cleanup

Stop the API and web processes with Ctrl+C in their terminals. Then, in the
original setup shell, stop only the container created above:

```powershell
docker stop $fixtureContainer
```

Its temporary databases disappear with the container. No named volume or
unrelated container needs removal. Saved views/selections are browser-local to
the preview origin; manage them through Saved & compare.
