# Goal improvement state

## Scope and starting state

- Goal: complete evidence-backed local improvements to existing journeys, reliability, data handling, and performance. One agent; no commits, publication, deployment, production access, or policy changes.
- Started 2026-10-03 (Europe/Helsinki), branch `main`, revision `af64374b2169dfb0ec11391045e6a8391ea08407`.
- Initial staged/unstaged/untracked work: none. Git needs per-command `-c safe.directory=C:/Users/Juha/Desktop/Projektit/nettiauto-analytics` under the sandbox account.
- No repository or ancestor AGENTS.md found; user-supplied global instructions apply.
- Existing `.workflow/ultracode` records are historical task-specific orchestration artifacts. This goal uses the requested `work/goal-improvement` convention.

## Product and verification plan

Public Finnish vehicle analytics: overview → filtered price research → period/group comparison → evidence → listing history; listing search/sort/pagination; listing lookup; browser-local shortlist/saved views. Private crawler administration is also assessed using test data only.

Desktop/mobile web, English UI only (no maintained i18n catalog found). Retain the existing restrained teal design, semantic controls, visible sample/coverage context, and URL-based navigation. Product docs' fuel-type deferral appears stale compared with the current homepage; verify implementation before correcting documentation.

Plan: establish baseline and rank findings; implement bounded batches with red/green regression tests; verify affected browser journeys and combined checks; self-review all changes.

## Environment / safety

- Existing dependencies installed. Bun 1.3.9 (manifest requests 1.3.14); Node 24.4.1. Do not upgrade host tools.
- Never load the existing root `.env` for task commands. Use `bun --no-env-file` and explicit synthetic environment values.
- Docker available through standard escalation. Existing unrelated `my-postgres-db` on port 5433 stays untouched.
- Task container: `nettiauto-goal-test-20261003`, **PostgreSQL 18.6**, localhost port **58516**, ephemeral tmpfs, 768 MB / 2 CPU limit. Port 55432 was occupied; dynamic port used without touching its owner. Stop only this container at completion.
- Databases: `nettiauto_goal_test` (initial baseline), `nettiauto_storage_fixture_test` (all integration tests; exact name required by storage suite), `nettiauto_preview_test` (browser fixtures, isolated from test truncation).
- Final preview API session 11375 (port 3101, disabled crawler, explicit test environment); compiled web session 84539 (127.0.0.1:3100, API at 127.0.0.1:3101). Dev session 98289 and previous API sessions were stopped. Bun API package-symlink resolution fails inside sandbox but works via standard escalation. `bun install --frozen-lockfile` confirmed declared dependencies with no lockfile change.
- No live worker, source crawl, external image fetch, production records, or outbound integration work.

## Baseline

- `bun run --no-env-file test` with empty `TEST_DATABASE_URL`: 185 tests passed, 6 DB suites skipped, 22.04 s.
- `bun run --no-env-file typecheck:packages`, `typecheck:web`, `typecheck:api`, `typecheck:worker`; `bun --no-env-file --cwd apps/web lint`: passed.
- `DATABASE_URL=<task DB> bun --no-env-file --cwd packages/db migrate`: all 19 migrations applied successfully to each fresh database.
- Full tests with `TEST_DATABASE_URL` ending `/nettiauto_goal_test`: 213 passed, one suite refused target (storage requires exact `/nettiauto_storage_fixture_test`). This is a reproduced setup/documentation limitation, not a failed application test.
- Full tests with exact fixture DB: **35 files, 220 tests passed**, 22.24 s.
- Preview seed: `TEST_DATABASE_URL=<localhost /nettiauto_preview_test> bun --no-env-file work/goal-improvement/seed-preview.ts`: 60 synthetic listings (48 current / 12 sold), 108 snapshots, 3 complete runs. Refuses wrong targets and nonempty databases; no cleanup or real source requests.

## Ranked working backlog (provisional until reproduction)

| Rank | Candidate / evidence | Acceptance | Confidence / effort / risk |
| --- | --- | --- | --- |
| 1 | Availability/sort defaults and comparison paging lose selected scope | Preserve selected scope through submit/page/save/compare | Resolved batch 1 |
| 2 | Simultaneous cache completions evade capacity; cached homepage reads have no deadline | Retain at most configured completed entries; all SSR reads time out without visitor-specific cache keys | Resolved batch 2 |
| 3 | Listing errors offer only reset; detail retry drops returnTo; lookup failure removes input form | Retry exact view; keep lookup input and correction action; preserve detail return context | Resolved batch 3 |
| 2 | Zero-price target receives a misleading cheapest-price rank | No percentile/price-position claim without a positive price; preserve comparable evidence | Resolved batch 4 |
| 2 | Integration command selects only domain tests, omitting five API/worker suites | One documented command runs all integration suites against the disposable DB | Resolved batch 5 |
| 3 | Setup docs contain scaffolding defaults and wrong API port; product docs disagree with capabilities | Reproducible safe local instructions match actual scripts | Resolved batch 5 |
| 2 | Research point titles render empty on the server and cause hydration failures | Complete SSR labels; no hydration error; keyboard selection works | Resolved batch 6 |
| 4 | Assess SQL/caches/worker persistence, cancellation and performance | Fix only reproduced correctness/reliability issues or measured bottlenecks | Assessed; no additional optimization justified |

## Decisions and skills

- Applying diagnosing-bugs and tdd: tests exercise exported Product API/domain/schema/navigation interfaces and real browser flows; independently derived synthetic expectations. Routine seam decisions are delegated by the user.
- Applying improve-codebase-architecture + codebase-design sequentially; findings remain in this backlog. Avoid speculative abstractions.
- Applying end-user-ui-ux and impeccable `audit` to the existing product. Context script run from repository with `--target apps/web`; audit/product references read. No new aesthetic direction, interviews, global skill updates, or agents.

## Completed batches

### Batch 1 — preserve research scope and comparison context

- Reproduced in browser: choose Current + sold → Show listings yielded `?sort=firstSeenDesc`, 48 current results instead of 60, while control still displayed Current + sold. API formatter elides `all`, but pages default to `current`; similarly `lastSeenDesc` was elided while listing pages default to `firstSeenDesc`.
- Hypotheses checked: URL default mismatch (confirmed), API data omission (disproved: explicit all returns 60), stale client state (secondary symptom of unchanged canonical query).
- Web-owned `formatPageFilters` preserves availability/sort in form submissions, page/return links and saved views. Product API formatting/default contracts unchanged.
- Comparison cloning clears old comparison filters/dates/page; comparison form retains explicit all. Comparison evidence pagination updates `comparePage` while retaining primary filters/page and both groups.
- Regression loop: navigation tests first failed on omitted availability and stale comparison page; new comparison paging test failed on unchanged comparePage. After fixes: 19 tests across both navigation suites pass; web typecheck passes.
- Real browser: 60 results after all+recently-observed submit; next page retains both values; saved view created; Analyze retains all; comparison next page gives primary 1/3 + comparison 2/3. Desktop and 390×844 mobile inspected, no horizontal overflow or console errors. Screenshot: `evidence/listings-mobile.jpg`.
- Acceptance met for scope round trips and independent comparison paging. Further saved/empty/error scenarios are covered in the final journey pass.

### Batch 2 — bounded cache retention and request deadlines

- Deterministic cache repro: six simultaneously completed loads remained hits in a cache with capacity four. Sequential eviction was already supported. Hypotheses: wrong key isolation (disproved), prune-before-promise-settlement (confirmed), stale TTL bookkeeping (disproved).
- Move pruning to promise settlement, after releasing the in-flight marker. Public shared-query key scope, five-minute TTL, on-demand stale refresh/failure behavior and deduplication unchanged. No new cache or invalidation policy. Pending work is retained until settled; completed entries obey the existing capacity.
- Cached homepage requests had no abort deadline. A mocked stalled HTTP transport remained pending after the deadline and hit Vitest's 5 s limit. All SSR requests now use the existing 45 s timeout and combine caller cancellation; cached requests still omit visitor headers.
- `bun run --no-env-file test apps/api/src/analytics-cache.test.ts apps/web/src/lib/server-api.test.ts`: 11 passed. API/web typechecks passed.
- Evidence supports a retention/reliability improvement, not a claimed production latency or storage saving.

## UI audit and next scoped design pass

Impeccable audit (self-review, not conformance certification): accessibility 3/4, performance 3/4, responsiveness 3/4, theming 3/4, anti-patterns 3/4 = 15/20. Existing semantic labels, teal tokens, reduced motion, table/card adaptation and chart data views are useful. No broad redesign justified.

- P1 task loss: omitted URL defaults / detached comparison paging (resolved).
- P2 recovery: temporary listing failures only offer reset, lookup correction requires returning home, detail retry drops return context. Use `harden` (reference read) and a restrained `polish` pass.
- P2 mobile: selected comparison tray can overlap final page controls; verify with a selection before deciding a fix.
- P3: research-note accent stripe and a few local colors diverge from DESIGN.md; only adjust if touching the affected recovery/research surface.
- Scoped design read: buyers/analysts need to resume the same investigation after a transient failure. Hierarchy is error explanation → retry/correct input → alternative navigation. Reuse buttons/fields/tokens; no new visual direction. Accept desktop/mobile, keyboard submission, retained filters/input, empty and outage recovery. English is the sole maintained locale.

## Blocked / deferred

Windows standalone runtime packaging is unverified: `next build` succeeds, but `node apps/web/.next/standalone/apps/web/server.js` fails with EPERM for a traced React symlink, including after standard escalation. The generated link has file attributes (`Archive, ReparsePoint`), while the installed working React link has `Directory, ReparsePoint`. No source/deployment configuration change or host permission change made. The repository's `next start` script can run the compiled application locally but warns that standalone deployment should use the generated server. Linux Docker deployment and production-scale performance remain outside this local verification.

### Batch 3 — recover investigations and keep controls reachable

- Invalid lookup previously removed its input; corrected lookup now retains the submitted value and a labeled form on validation, not-collected and unavailable states. Shared form with overview removes duplicated markup. Native validation and Enter submission retained.
- Shared `RetryButton` refreshes the current route; listing errors preserve filters/page, detail errors preserve returnTo, analysis errors preserve both groups. No error state changes authentication or hides a failure.
- Browser: entered invalid text, corrected to synthetic ID 9000000 and reached listing details; desktop and 390×844 screenshots saved. Stopped task API to produce a real outage, restarted it, then clicked Try again: original Toyota/all/recent-sort/page query survived and results recovered.
- That outage journey exposed a stale-page case (15 matches but page 2 empty). Listings now redirect to the last available page retaining scope; browser confirmed page 1 with 15 results. Research has a first-evidence-page recovery link when its independent page becomes unavailable.
- Fixed comparison tray overlapped final source evidence on 390×844 viewport (tray top 728.7, final evidence bottom 782). Changed it to sticky in normal document flow and restored 44 px mobile control height. After: source panel bottom 650, tray top 712 at maximum scroll; no horizontal overflow. Screenshot: `evidence/comparison-tray-mobile.jpg`.
- Initial recovery changes: web typecheck and lint passed. Later stale-page/CSS additions are included in final checks.

### Batch 4 — avoid a misleading price ranking

- A PostgreSQL test with a zero-price target and six €20,000 peers reproduced a false cheapest-price percentile (0). Existing aggregates already excluded non-positive prices; target ranking did not.
- Market context now returns a null percentile for non-positive target prices while retaining the six comparable cars and their €20,000 median. Detail UI explains that no usable price is recorded rather than ranking it.
- Red/green: `bun run --no-env-file test packages/domain/src/product.integration.test.ts` with explicit disposable fixture DB: new regression failed before fix, all 17 tests passed after fix (1.49 s). Package/web typechecks passed.
- Synthetic local HTTP workload (60 listings, six sequential requests each): research-all 118.3 ms first observed, 1.4–5.5 ms repeats; historical 8.2 ms first observed, 1.2–1.6 ms repeats; listings by reduction 8.1 ms first observed, 5.3–13.5 ms repeats. Payloads 23,350 / 21,225 / 13,151 bytes. First samples are not proven cold. No query/index optimization justified by this bounded evidence; no production gain claimed. Raw measurements: `evidence/local-timings.json`.

### Batch 5 — reproducible local setup and complete integration selection

- Replaced the single-file integration script with a config selecting all `*.integration.test.ts` suites, retaining serial execution. It fails early for an absent/non-local/wrong-name database instead of silently reporting skipped integration tests. Errors do not echo connection strings.
- `TEST_DATABASE_URL='' bun run --no-env-file test:integration`: expected exit 1 with the disposable-target requirement. With the designated migrated fixture DB: **6 files / 36 tests passed**, 8.57 s.
- Added `docs/local-development.md` with isolated Docker setup, migrations, separate synthetic preview, explicit disabled-crawler environment, checks and scoped cleanup. Corrected scaffold READMEs, stale fuel/saved-view deferrals, and the historical database document's status. No runtime/deployment configuration changes or new dependencies.

### Batch 6 — reliable server rendering and admin row identity

- Browser console showed research-chart hydration errors on full current/historical page loads. Competing hypotheses: locale mismatch (formatters already pin en-FI), changing data (fixed fixture), invalid server title children (confirmed). The unchanged chart rendered a five-child JSX array inside SVG `<title>`; installed React 19.2.8 explicitly requires one text value.
- Added actual component SSR regression coverage, using existing React/Vitest dependencies and a web alias in Vitest. Before: two empty titles and React warnings. After a template-string fix: both complete titles, including unknown model year; test passes.
- Fresh development and compiled browser loads produced no hydration error; Enter on a chart point displayed its exact recorded price/mileage/year and detail link.
- Admin smoke exposed duplicate `current`/`sold` React keys when the preview adds search queries. Stateless freshness rows now include their position in the key, preserving all rows without changing the API's identity contract. Compiled dashboard shows all four rows and no console warnings; crawl/backfill actions remain disabled.

## Final coverage and verification

| Area | Assessed / verified outcome |
| --- | --- |
| Core journeys | Overview → research → evidence → detail; all/current scope, sort and paging; saved-view restoration; two-car comparison, reference changes and differences-only; lookup invalid → correction → detail and not-collected recovery. |
| Historical / partial evidence | September vs October current samples: 48 prices each, medians €23,000 / €22,000. Independent pages and comparison promotion preserve periods. Empty listing scope (year 1900) is genuine empty; stale evidence page offers recovery without losing the other group. Existing integration tests cover partial/missing collections and historical semantics. |
| Recovery / validation | Actual stopped-API outage and retry preserves the URL; invalid date order retains input, identifies the end date and focuses it; dependent Honda → Civic options load. Loading placeholders observed. Zero-price UI explanation verified with one temporary synthetic update, then restored to €10,000. |
| Responsive / accessibility | Visual desktop 1280×900, mobile 390×844 and 320×780. Labels, Tab focus ring, Enter submission/point selection and 44 px tray controls checked. Reduced-motion and OS text-scale 2 emulation accepted during 320 px inspection, then reset; this is not proof of platform-wide 200% text resizing or formal accessibility conformance. No motion was changed. |
| Backend / security boundaries | Real PostgreSQL, API validation/readiness, parameterized SQL and bounded result access reviewed; public contract/raw-data separation and admin gate retained. Signed-in local dashboard checked read-only, then signed out. API health and readiness both HTTP 200. No auth/policy change. |
| Worker / storage | All fixture integration suites exercise persistence, retries, queue-lock recovery, detail backfill and compression compatibility. Existing compaction retains fields needed by product queries. No live worker/source request required; no extra retention/index/migration change justified. |
| Performance / storage | Bounded caches and SSR deadlines fixed with deterministic evidence. Small fixture SQL plan uses a hash join and 25 kB sort, 11 shared-buffer hits, 0.064 ms execution; sequential scans are reasonable for 60 listings / 108 snapshots. Largest fixture relations including indexes: snapshots 240 kB, raw records 184 kB, listings 168 kB. These are local observations, not production capacity/storage claims. |
| Developer experience | All 19 existing migrations installed on fresh disposable PostgreSQL 18.6 databases; explicit integration command covers six suites; setup and synthetic fixtures are reproducible. |

Final commands (from repository root, explicit synthetic environment; fixture DB is localhost port 58516):

```powershell
$env:TEST_DATABASE_URL='postgres://goal_test:local-goal-test@127.0.0.1:58516/nettiauto_storage_fixture_test'
bun run --no-env-file test
bun run --no-env-file typecheck:packages
bun run --no-env-file typecheck:web
bun run --no-env-file typecheck:api
bun run --no-env-file typecheck:worker
bun --no-env-file --cwd apps/web lint
bun --no-env-file --cwd apps/web build
bun --no-env-file --cwd apps/api build
bun --no-env-file --cwd apps/worker build
git -c safe.directory=C:/Users/Juha/Desktop/Projektit/nettiauto-analytics diff --check
```

- **36 test files / 227 tests passed**, 16.44 s; all package/app typechecks, lint and all three builds passed. Final admin key-only fix followed by another web build/typecheck and lint, both passed. No unchanged full-suite repetition.
- Compiled-app smoke via the repository's `next start` script: overview data, chart keyboard selection, lookup validation and read-only admin dashboard passed; new browser tab console had no errors/warnings. This does not establish standalone deployment portability; see the Windows limitation above.
- Evidence directory contains before/after lookup screenshots, mobile scope/compare/tray states, and bounded HTTP measurements. Latest `lookup-after-mobile.jpg` is the compiled app with visible keyboard focus.

## Final self-review

- **Standards:** reviewed tracked diff against starting SHA and all new source/config/docs/fixtures; no open high-priority finding. Small shared web helpers remove conflicting URL/default and form/retry implementations. No new production dependency, broad formatting, policy/deployment edit, schema/API shape change, or user-work overwrite. Index-based disambiguation is limited to stateless admin rows whose response has no query ID.
- **Spec:** all feasible high-priority backlog items resolved with regression or browser evidence. Healthy worker/storage areas were assessed without manufactured edits. Windows standalone launch, Linux deployment, real-device accessibility and production-scale load remain explicit verification limits. No production gain inferred from tiny fixtures.
- Reviews were sequential self-reviews using the requested code-review skill and the goal/batch acceptance criteria; no subagents or tracker work.

## Completion and cleanup

- Previous goal turn made concrete progress: completed six improvement batches, real browser scenarios, regression loops, combined tests/builds, and sequential self-review. This continuation finished resource cleanup and the current-state completion audit.
- No preview listeners remain on ports 3100/3101; process handles ended with the prior goal turn. Stopped the verified `nettiauto-goal-test-20261003` container; its `--rm` temporary databases are gone. The unrelated PostgreSQL container was untouched.
- Removed only the two Next-generated `apps/web/AGENTS.md` / `CLAUDE.md` stubs, which were absent at the initial baseline. Browser inventory is empty and viewport reset succeeded; test selections/view and admin login had already been cleared through the UI.
- Final deliverables: reviewable local source/tests/docs, guarded synthetic seed, screenshots/measurements, and this record. No commit, push, PR, publication, deployment, added migration, dependency update, or production-data access.
- Completion audit: each applicable area has the evidence/limitations above; all feasible high-priority findings are resolved, required local checks passed, and no implementation work remains. Standalone portability and production/real-device checks remain explicit environment/scope limits, not claimed successes.
- To run: follow `docs/local-development.md` (creates fresh resources with a new dynamic port). To review: `git diff af64374b2169dfb0ec11391045e6a8391ea08407` plus the untracked files listed by `git status --short`.
