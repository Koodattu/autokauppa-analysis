# Goal improvement state

## Pass 4 — evidence-first research, 2026-10-03

- Request: `3e764bdc-a9a7-4b62-942d-51c57d1fa374/pasted-text-1.txt`, read in full. Single agent; routine product/design/test choices delegated. Commit, normal main push and established production release authorized.
- Start: clean `main`, `5eec8f55b690101f037411b1b473e1196b4eae73`, no staged/unstaged/untracked work. Remote `https://github.com/Koodattu/autokauppa-analysis.git`. GitHub identity/repo verified with Git/gh. Server app and deploy state both match this SHA; deployment configuration remains `490c83851e69b7b3ba77ff2cf5980ef2bf6acdbd`. Existing timer active; use the existing deployment lock before pushing, required exact-SHA CI, scoped compose build/up, retained rollback images and live health checks. Do not run the multi-project deployment script.
- Brief: English desktop/mobile analytics for Finnish used-car buyers, enthusiasts and analysts. The principal job is to explore comparable observed prices, inspect underlying listings and revisit a scoped investigation. Preserve current price/sold distinctions, sample/coverage disclosure, shareable URLs, browser-local saved work and the restrained teal design. Expected benefit is a product hypothesis, not user-research or conversion evidence.
- Safe resources: `nettiauto-goal4-test-20261003`, ID `d4562be4e536f566d6cf819b35d556224a98d1dcc32b9bbdb25284c4452745af`, PostgreSQL 18 on localhost 54898, tmpfs, 768 MB/2 CPU. Fixture and preview DBs migrated from empty; existing seed creates 60 synthetic listings, 108 snapshots and 3 complete collections. API 92874 and dev web 95361; crawler/archive disabled; no worker. Other containers untouched.
- Baseline: used overview → research. At 1265×720 the first summary starts at y=990; at 390×844, y=2633, below the entire advanced form. Screenshots `evidence/pass4-before-research-{desktop,mobile}.png`. Research axis repeats 22.9K/23K labels for distinct values. Listing evidence links omit research return context. Comparison duplicates the primary form and places comparison editing beneath both summaries. These are observed/code-confirmed issues.

### Research, design and ranked program

Sources accessed 2026-10-03; first-party documentation/public extracted content unless otherwise noted.

| Source / task | Evidence and application |
| --- | --- |
| [Google Trends comparison help](https://support.google.com/trends/answer/4359550?hl=en) | Documents independent per-group date/location editing beside each term. Keep each car group's controls and scope with its result. Our two-group model stays bounded. |
| [CarGurus price trends](https://www.cargurus.com/research/price-trends) | Presents time-scoped price comparisons and an explicit date update action. Preserve observation windows and avoid claiming same-car depreciation from changing cohorts. |
| [Our World in Data explorer](https://ourworldindata.org/grapher/life-expectancy?time=latest) | Keeps units, date extent, sources and interpretation with analytical evidence; separates full/displayed export. Preserve our existing bounded export and visible analytical context while simplifying control chrome. |
| [Datawrapper line-chart guidance](https://www.datawrapper.de/academy/customizing-your-line-chart) | Documents scale, ticks and number precision as independent communication choices. Use enough precision to distinguish nearby price ticks rather than repeated compact labels. |

| Priority / job | Limitation, confidence, cost | Acceptance |
| --- | --- | --- |
| 1 / Trust price history | SQL time-series medians/sample counts include nonpositive prices unlike research summaries; reproduce against real PostgreSQL. Small query fix, no migration. | Positive-price medians/counts for current and sold, filtered and broad queries; total inventory counts unchanged; no-price periods remain missing. |
| 1 / Read and edit research | 2633px of controls before mobile evidence; independent comparison results lack nearby scope/editing. Strong baseline, moderate UI work. | Summary in first mobile viewport; each group's scope/dates and edit control together; all filters available; Apply/reset retain the other group; keyboard, validation, empty and narrow states. |
| 2 / Inspect and continue | Evidence/scatter links lack return context; primary reset discards comparison. Strong local evidence, small navigation change. | Listing detail returns to exact primary/comparison evidence page, dates and filters; unsafe return URLs rejected; swaps preserve both complete groups. |
| 2 / Decode charts | Distinct nearby y-values have identical labels. Observed in browser. | Distinct readable price ticks on real historical/listing charts; exact accessible values and gaps preserved. |
| Deferred | Accounts/alerts/valuations, extra renderers, general cache/index/refactor work have no stronger evidence for this pass. | No speculative expansion, stack change or production configuration change. |

- Design: Impeccable is the primary discipline, Operate mode; Interface Design inspected as supporting task/density guidance. Selected result-first group panels with native inline disclosure editors. Rejected a permanent desktop sidebar (poor phone fit) and modal wizard (unnecessary interruption). Reuse current tokens, semantic controls and market form. One primary summary, adjacent comparison, compact section links, then chart → feature exploration → evidence. No new motion or generated concepts needed for this established visual system.
- Applied guidance: end-user-ui-ux complete journeys/states; Impeccable context/shape/critique/craft floor; research (performed locally, user single-agent rule); visualization router and strategy, statistical/missingness, accessibility and testing specialists; TDD and diagnosis for data/navigation regressions; architecture/design guidance to keep URL composition at its existing seam and reuse forms instead of parallel implementations. No human approval or independent review claimed.
- Agent-selected test seams: real domain queries over the fixture PostgreSQL database; rendered React forms/download/link outputs and safe URL parsing; browser task journeys and measurements for layout/keyboard. No artificial styling unit tests. Read relevant ADRs and test conventions before each batch.
- Next: authorized commit, normal main push, exact-SHA CI and scoped established deployment. Local implementation and verification are complete; final release receipt below records the eventual release outcome.

### Pass 4 completed batches and review

- Historical correctness: reproduced median 5,000/sample 4 for `[-100, 0, 10000, 20000]`; expected median 15,000/sample 2. Both asking and observed-sold time-series queries now include only positive price evidence. Broad and make/model-filtered PostgreSQL plans pass; inventory counts stay 4 and a later zero-only period stays median null/sample 0. No schema or stored-observation change.
- Research workflow: results and applied scope precede native per-group disclosure editors. Dates remain visible inside each editor, with other advanced choices disclosed separately. Compact section links expose history, factors and evidence; save/share stays reachable before the charts. Reused the existing form and extracted its label formatting for consistent server/client scope. No dependency or duplicate form implementation.
- Navigation: primary Reset previously removed comparison; a rendered regression failed first, then passed. Apply/reset retain the other scope, Swap exchanges complete filters and independent pages. Evidence/scatter links carry an allowlisted research return URL; detail returns to the correct evidence table. Browser review found pagination jumping 2,840px above its table; rendered primary/comparison regressions failed and now pass with anchored links. Existing current/historical link behavior and CSV export are preserved.
- States: current no-results initially showed only dash values, and unobserved periods rendered a dash date range. A failing rendered summary test drove explicit no-priced-match guidance, a single missing range marker and omission of unknown observation dates. Historical no-observation context still gives available collection dates. Native year validation rejected 1980 against the fixture's 2015 minimum; correcting input allowed submission (a test-input issue, not an app failure).
- Visual/data clarity: price axes now use full currency with integer ticks, so 22,800 / 22,850 / 22,900 / 22,950 / 23,000 remain distinct. No new motion. Desktop 1280-wide first result y=261 versus baseline 990; mobile 390×844 y=381 versus 2,633. No horizontal page overflow at 320, 390 or 768 widths. These measure information placement, not speed or conversion gains.
- Browser verification: Toyota September median 20,600 versus October 19,600; difference 1,000 (4.9%) lower, reversed correctly by Swap. Primary Reset preserves Toyota September comparison. Page-2 listing → detail → Back to price research retains both scopes and page. Keyboard disclosure/apply, native validation, July missing observations, valid zero-match recovery, advanced filters at 320px and save/share access exercised. Compiled chart exact table shows 48 September and 46 October positive prices, with missing weeks kept as gaps.
- Overview discrepancy investigated: direct preview API returned 22,800/46 while the first compiled homepage showed prior fixture values from Next's persisted 300-second cache. Subsequent normal navigation after revalidation returned 22,800/46. No data/query defect or cache-policy change warranted.
- Checks: full PostgreSQL-enabled `bun run --no-env-file test` passed **259 tests / 40 files**, 39.64 s. The final empty-state addition then passed its affected six-test suite; final CI will run all **260 tests**. Package/web/API/worker typechecks, web lint, all three production builds and `node scripts/verify-crawler-http.mjs` passed. Web typecheck/lint reran after the final component change. `git diff --check` clean. API/worker builds used standard escalation for Windows workspace links. `next start` warns about standalone output on Windows; real compiled rendering was verified, with Linux container packaging checked at release.
- Impeccable sequential self-review: product-specific hierarchy and nearby scope/edit controls address the observed task; native controls preserve keyboard access. The required one-time CLI scan of changed markup returned `[]` (exit 0). Browser evaluation is read-only, so live detector injection was skipped; real screenshots and DOM/layout checks supply browser evidence. No independent-agent review claimed. Mechanical scan preceded the final small empty-state copy correction; its rendered regression and browser result were checked afterward.
- Code-review standards axis: shared URL/label seams, existing stack/tokens and unchanged public contracts; no unresolved finding. Acceptance axis: selected priorities complete, including safe returns and missing/zero semantics; review found and resolved evidence scrolling and empty-state explanations. Reviewed tracked and new files against starting SHA; no unrelated config, policy, worker behavior or production data edits. Speculative accounts/alerts/valuations and generic performance refactors remain deferred for lack of stronger evidence.
- Evidence: `evidence/pass4-before-research-{desktop,mobile}.png`, `pass4-after-comparison-desktop.png`, `pass4-after-research-mobile.png`, `pass4-compiled-chart-mobile.png`. Synthetic records only. Local reproduction: `docs/local-development.md`; review against `5eec8f55b690101f037411b1b473e1196b4eae73`.
- Final mobile review found the evidence anchor's inherited 90px offset could fall under the 135px header; raised it to the same 150px used by the other research targets. Rebuilt web and confirmed the compiled empty evidence heading clears the header at 320px. Compiled listing history has distinct 10,000 / 10,250 / 10,500 / 10,750 / 11,000 euro ticks, no page overflow or console warnings/errors. No further material finding remains.
- Cleanup complete: original API 92874 was stopped after the SQL fix; final API 15752, dev web 95361 and compiled previews 45725/25922 stopped. Task database container identity matched the recorded full ID before stop/automatic removal; unrelated containers untouched. Next-generated AGENTS/CLAUDE stubs absent at baseline removed. Browser viewport reset and compiled tabs closed; prior connection-error tabs are left to normal temporary-tab cleanup. No browser storage changes or downloads were made this pass.
- The release receipt is written after deployment so it can contain the final commit without changing that verified revision: [Pass 4 release receipt](C:/Users/Juha/.codex/visualizations/2026/10/03/01a100dd-4d2e-75b3-bfb5-1ea42fa6b95f/pass4-release.json). It records commit/remote/main, exact-SHA CI, image IDs, service health, live checks and resource cleanup. Pre-release statements above are not a claim that deployment already succeeded.

## Pass 3 archive

## Pass 3 — shortlist and reusable research, 2026-10-03

- User request: attachment `a68efb47-e571-4aa3-a6f8-198c853ab0b7/Pasted text.txt`, read in full; explicitly authorizes a researched product pass, commit, normal push to main and established production deployment. Single agent; all design and test-boundary choices below are agent-selected.
- Baseline: clean `main` at `bbaaffc75a33c75e757e9b82ad5917a8dd898b0f`, remote `https://github.com/Koodattu/autokauppa-analysis.git`. No staged, unstaged or untracked work. This exact revision passed [CI 37131937993](https://github.com/Koodattu/autokauppa-analysis/actions/runs/37131937993): 239 tests / 39 files, required typechecks, lint, builds and crawler HTTP checks. It was deployed and verified healthy just before this pass; pass 2's release-pending wording below is historical.
- Product brief: English desktop/mobile analytics for Finnish used-car buyers, enthusiasts and analysts. The documented promise is transparent observed listing evidence, not valuations or transaction prices. Existing strengths: shareable filters, historical groups, distributions, individual history and peer evidence. Observation: the saved/compare workflow conflates a reusable shortlist with the four-column comparison. A fifth car is disabled; Clear selection erases the saved collection; revisiting prices requires opening every title. Product-value hypothesis: separating those tasks and keeping evidence portable reduces repeated work; no usage or customer-research claim.
- Resources: task-only `nettiauto-goal3-test-20261003`, ID `e2c112fe6edde441886e2baa011866af695ad44ff18106585707de085e12c95b`, PostgreSQL 18, localhost 54507, tmpfs, 768 MB / 2 CPU. Both fixture and preview DBs migrated from empty; 60 synthetic listings / 108 snapshots / 3 completed collections seeded. API session 58382, web dev 4767; no worker or live collection. Other projects' containers are untouched.
- Release workflow verified in preceding release: server `vaarattu-server`, app `/srv/projects/nettiauto-analytics`, existing deployment override, public `https://autokauppa.koodattu.dev`. Timer watches main; hold existing `/run/lock/koodattu-auto-deploy.lock` before push, await exact-SHA CI, then scoped compose build/up and safe health checks. Retain previous images. Do not run the multi-project auto-deploy script or its broad prune. Recheck server/config revision before release.

### Research and prioritization

Accessed 2026-10-03. These are first-party documentation or extracted public page content, not account-based end-to-end verification.

| Alternative / source | Evidence and tradeoff | Project inference |
| --- | --- | --- |
| [Autotrader UK compare help](https://help.autotrader.co.uk/hc/en-gb/articles/9881022015261-How-do-I-compare-cars-on-Autotrader) | Documents saving adverts, then ticking a subset from Saved to compare. | Separate long-lived shortlist and temporary comparison; retain direct Compare for quick research. |
| [Nettiauto search](https://www.nettiauto.com/hakutulokset?haku=0+auto) | Public page exposes favorites, saved searches and comparison separately; account prompts for persistence. Search-index content may be older. | Familiar distinction is useful; do not copy account/alert commitments or marketplace selling flows. |
| [AutoUncle Finland valuation](https://www.autouncle.fi/fi/auton-hinta-arvio) | Describes comparable evidence, history and downloadable reports. Valuation statements are vendor claims, not tested accuracy. | Retain supporting dates and evidence outside the app; don't infer valuations from our smaller sample or copy estimated sale/trade-in prices. |
| [CarGurus price trends](https://www.cargurus.com/research/price-trends) | Public page includes time-range inputs, comparison table and Export control with usage terms. No export executed. | Bound our download to already displayed evidence and explicitly retain price basis, scope and observation date; don't add unrestricted bulk API access. |

| Priority / user job | Evidence, benefit and cost | Acceptance / decision |
| --- | --- | --- |
| 1 / Return to candidate cars | Browser confirmed 4-car storage ceiling and destructive coupling; strong local evidence, moderate work across browser persistence and a bounded public summary query. | Save 20 independently from comparison; old selections/views survive; changing/clearing comparison preserves shortlist; current stored price/availability/date in one read; missing/error/loading/storage-full recovery. |
| 2 / Reuse research evidence | Existing 25-row evidence page has no download; manual copy loses units/dates. Moderate hypothesis supported by alternatives, low cost using current response. | Download exactly the visible primary or comparison evidence as UTF-8 CSV, include research context and price basis, neutralize spreadsheet formulas, preserve historical values, explicitly label page-only scope. No bulk endpoint or new dependency. |
| 3 / Notes, synced lists, alerts, automatic valuations | Possible convenience but no direct user evidence; accounts, policies and external effects add cost. | Defer; first establish reliable browser-local research. |
| 4 / General architecture, database caching/performance, chart cosmetics | Baseline checks pass; no measured problem in selected paths. | Keep existing stack/cache/indexes. One bounded batch query avoids per-car detail waterfalls; no speculative refactor. |

### Agent-selected design and engineering brief

- Retain restrained teal, white surfaces, system sans and current tokens. Scene: a buyer reviewing candidates at a daylight desktop, then reopening them on a phone. Anchors: existing product's evidence tables, Autotrader's saved/subset workflow, CarGurus's explicit time scope. Production-ready connected workflow, not a branding redesign.
- Considered: simply raising comparison to 20 (unreadable table); separate saved page plus navigation item (unnecessary fragmentation); selected existing Saved & compare workspace with independent shortlist and four-car selection. Use compact rows, clear count and selection feedback, stacked mobile actions. Keep comparison URLs independently shareable.
- Entry: Save and Compare on listings, detail peers and current research evidence. Return via existing navigation/overview. Show latest stored facts with observation labels, not cached prices presented as current. Empty workspace links to finding cars; missing entries remain removable; fetch failure retains saved links and offers Retry. Avoid modal workflows and automatic account sync.
- Architecture: keep storage behavior behind the existing saved-workspace seam, preserve legacy reads, validate persisted state. One bounded summary query behind the public product API returns only existing public fields; no per-car detail/history/peer query. Existing comparison max 4 and URL contract remain.
- Tests: React DOM + browser storage through real rendered actions; public API/domain query against the disposable PostgreSQL fixture; generated CSV through its download content boundary; real browser desktop/mobile, keyboard, long names, limits, partial missing and network failure. These seams are delegated by the user.
- Skills applied: end-user-ui-ux; impeccable context/product/shape/craft/layout/typeset/Codex guidance; research; TDD plus tests/mocking; improve-codebase-architecture and codebase-design. Single-context assessments; no subagents. Existing visual direction and structural choices suffice, so no palette/mock generation under the user's adjustment. Functional and visual QA remain separate.
- Next: implement shortlist persistence as a vertical red/green slice, then batched latest evidence and portable research; reassess against acceptance before release.

### Pass 3 completed batches and review

- Batch 1: independent 20-car shortlist and four-car comparison, integrated into listing rows/cards, detail/peer actions and current research. Legacy v1 cars become both saved and selected; views retain names. New writes use v2 without deleting v1. Saving/comparing are explicit independent actions; selecting a comparison car does not automatically bookmark it. One validated, existing-rate-limited `/listings/summaries?ids=…` read (1–20 UUIDs) returns nine existing public fields with no per-car detail/history/peer queries. No migration, index, cache or dependency changes.
- Red → green: rendered fifth-save/clear-comparison test failed for missing Save control; DB test lacked the summary query; request failure test lacked retry; each now passes. Additional tests cover 20-slot limit, write failure/retry, legacy preservation, cross-tab replacement and cancelled late responses. API tests reject absent/invalid/21-ID requests. Real PostgreSQL verifies latest snapshot, sold/nonpositive price, missing IDs, duplicate IDs and the exact public field allowlist.
- Related retention fix: thirteenth named view silently replaced the oldest. Regression reproduced that loss; new views are now blocked at 12 with Manage saved views, while existing views remain editable. No automatic eviction.
- Batch 2: download exactly the displayed research evidence as BOM-prefixed UTF-8 CSV. Server-generated download data uses the same rendered response, so no refetch race or extra export endpoint. Primary/comparison scope, pagination, observation dates, prices/units, coverage/counts, source and interpretation travel with every row. Relative paths reopen research or latest listing details. Empty evidence has no download. Current data and historical data keep their distinct price semantics.
- CSV tests failed before the control existed, then passed for historical/comparison scope, quoted commas/quotes, missing prices, formula-like labels and empty states. Consulted [MDN download](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a) and [OWASP CSV injection](https://community.owasp.org/attacks/CSV_Injection), accessed 2026-10-03. Formula-like text gets a visible `Text: ` prefix rather than relying only on an apostrophe that spreadsheet save/reopen can strip. No claim of verification in every spreadsheet application.
- Browser: 5 saved / 2 compared; clear leaves saves; keyboard Space toggles comparison; reload retains storage; reference change yields independently expected -€6,400; differences-only remains functional. Filled all 20 saved slots through listing controls, observed disabled twenty-first Save and 20 rendered latest summaries. Simulated API outage by stopping only our local API: saved links/actions remain, Retry recovers after restart. A 116-character saved research name wraps without page overflow. 390×844 and 768×1024 checks pass; desktop and mobile screenshots inspected. Screenshot files `evidence/pass3-*.jpg` are synthetic only; full-page mobile capture positions sticky navigation at its captured scroll position, so the viewport screenshots are the better narrow-screen evidence.
- Actual browser downloads parsed independently with PowerShell `Import-Csv`: September primary page 1 = 25 of 48, first price 11000 and observed September 1; page 2 = 23 rows, first source ID 9000025 and page=2 URL; October Toyota comparison = 12 Toyota rows, first price 10000, own October filters/date. The IAB download-event APIs timed out although the file was saved in Downloads; filesystem evidence disproved an app failure. Original download artifacts are synthetic and will be cleaned up after verification. No CSV row dump is committed.
- Sequential code-review skill self-review (standards and acceptance): caught missing individual removal for a compared-but-unsaved candidate. Added a failing rendered test then explicit comparison links/removal controls; browser verified removing a saved entry leaves comparison intact, then removing that comparison independently. No claim of independent reviewers. Existing result summaries remain public, price evidence is not an estimate, and retained v1 storage supports reverting app code without deleting the newer key.
- Layout/type assessment: existing 15px/system-sans product baseline retained; new controls use existing 44px targets, new labels use 0.8125rem and group headings/prices 1.125rem. Row layout groups title/facts/date and separates actions; mobile stacks, tablet/desktop align. No new motion; inherited focus/pressed/reduced-motion rules remain. Impeccable layout/type detector reports `[]` before and after on changed TSX; manual CSS/screenshot review catches responsive structure beyond detector coverage. No broad typography redesign warranted.
- Verification so far: full suite **250 tests / 40 files**, 27.34 s, with localhost fixture DB; all package/API/web/worker typechecks and web lint passed. Review then added one comparison-removal regression: the resulting 10-test saved-workspace suite, web typecheck and lint pass. Final production builds and crawler HTTP checks next; full final suite will include 251 tests.
- Reassessment: the two highest-priority product outcomes are delivered; notes/accounts/alerts/valuations remain unsupported hypotheses or separate commitments. No production performance or conversion claim. Next: finish builds, final diff/cleanup, commit/push main under deployment lock, exact-SHA CI, scoped web/API deployment and live verification.

### Pass 3 release candidate

- Final local verification: **251 tests / 40 files passed**, 25.80 s, with all PostgreSQL suites. Package, API, web and worker typechecks, web lint, web/API/worker production builds and `git diff --check` passed. `node scripts/verify-crawler-http.mjs` passed (robots 200, GPTBot/forbidden variant 403, crawler budget 429 + Retry-After, browser HTML/RSC 200). No required check bypassed.
- Compiled preview: saved workspace loads real synthetic summaries; keyboard selection works; actual measured viewport 320px with 305px document width (scrollbar), no horizontal overflow or console errors/warnings. 768px and desktop layouts also inspected. Screenshots are in `evidence/pass3-*.jpg`; the desktop image includes the final individual comparison-removal controls. Local Next start reports the known standalone-packaging advisory; production uses its established Docker packaging, verified separately during release.
- Final standards self-review: scoped schema/query/UI/docs changes, parameterized UUID query, bounded public allowlist, no new dependencies or sensitive fields, preserved old storage, no global configuration changes. Acceptance self-review: independent saving/comparing, retrieval, full/error/empty states, named view retention and historical/independent/paginated export all have observed evidence. Impeccable scans of the changed TSX and public CSS return no layout/type findings. No unresolved material finding. Real-user benefit, production-scale performance, physical devices and spreadsheet-app-specific import behavior remain unmeasured; the actual CSVs parsed successfully with an independent parser.
- Cleanup: synthetic browser shortlist, comparison and named view removed through their own controls; compiled empty state verified. Only the three verified synthetic CSV downloads and the Next-generated instruction stubs absent at baseline were removed. Task API sessions 58382/81307/10426, dev 4767 and compiled preview 95063 stopped; task-owned PostgreSQL container identity checked before stop/automatic removal. Existing containers untouched. Browser viewport reset was attempted; a stale prior connection-error tab can cause the browser tool to reject its internal data URL during cleanup, so remaining temporary tabs use normal end-of-turn cleanup.
- Release metadata cannot include its own future commit hash. The post-release receipt linked here records the final commit, remote/branch, exact-SHA CI URL/result, deployment image identities/revision and live checks without changing the verified source commit: [Pass 3 release receipt](C:/Users/Juha/.codex/visualizations/2026/10/03/01a100dd-4d2e-75b3-bfb5-1ea42fa6b95f/pass3-release.json). Read that receipt for the final release outcome; the candidate statements above describe local verification.

## Pass 2 archive

## Pass 2 — verified and prepared for release, 2026-10-03

- New goal attachment `071e3ef2-877d-4bb2-b816-fb9c3cc53ea6/pasted-text-1.txt` read in full. Initially local implementation only. The later user instructions “commit push proceed” and “is it merged with main and deployed? if not it should be” authorize this release. One agent; no policy/config changes or live collection for testing.
- Start: `main`, `010e332e75fd3aa8a166f7909c7cc811ad168f2a`; staged, unstaged and untracked work all empty. Earlier pass below is historical.
- Re-read product/design, local setup, architecture/domain vocabulary, schemas, public routes, data queries and nearby tests. English desktop/mobile web; preserve existing teal/neutral visual direction. No pre-existing repository/ancestor AGENTS; Next dev subsequently generated its own two instruction stubs, to remove at cleanup.
- Skills: end-user-ui-ux; impeccable context + audit/product/harden references; diagnosing-bugs; tdd + tests/mocking; improve-codebase-architecture + codebase-design. Sequential self-assessment, with ordinary workflow choices delegated by the goal. Observable seams: React forms and browser storage, Product API/domain queries over real PostgreSQL, real browser journeys.
- Baseline: `bun run --no-env-file test` without DB: **191 passed, 6 DB suites skipped, 19.99 s**. `bun run --no-env-file test:integration` with fixture URL: **36 passed / 6 files, 9.05 s**. Both disposable databases migrated successfully; preview seed: 60 listings / 108 snapshots / 3 complete runs.
- Resources used and cleaned up: container `nettiauto-goal2-test-20261003`, postgres:18, localhost **50251**, tmpfs, 768 MB / 2 CPU. DBs `nettiauto_storage_fixture_test` and `nettiauto_preview_test`, synthetic `goal_test` credentials from local-development guide. Existing PostgreSQL and twitch-tracker containers untouched. API sessions 25610/80195, web dev 81512 and compiled preview 17282 stopped; task container stopped and automatically removed. No worker.
- Test tooling: existing suite has no DOM environment; add only pinned `jsdom` dev dependency for meaningful form/hydration regression tests, using existing React `act` and Vitest. Next's installed Vitest/client guides and [React act documentation](https://react.dev/reference/react/act) consulted. No production dependency or stack upgrade.

### Ranked backlog and acceptance

| Priority | Evidence / problem | Acceptance / decision |
| --- | --- | --- |
| 1 | Named view saved as “Family hybrids under €20k” reopens with “Car search”; Update silently overwrites the name (real browser) | Restore stored name after hydration/navigation; preserve typed draft on failure; announce successful save; regression test actual form/storage |
| 2 | Zero prices are excluded from research statistics but listing queries still expose/sort raw zero values | Resolved batch 2; raw observations and contracts preserved |
| 3 | Saved/comparison UI under long text and partial failures; model metadata cancellation/deadlines | Resolved batches 1/3; desktop/mobile recovery verified |
| 2 | Selected research point retains values from the previous period or filtered sample | Resolved batch 4; current response is authoritative |
| 4 | SQL/cache/worker/architecture/performance follow-up | Assessed; no additional optimization or general refactor justified |

- Next action: authorized commit/push to main, scoped web/API deployment, CI and production readiness verification. Local implementation and verification complete.

### Pass 2 completed batch 1 — saved-view naming and feedback

- Hypotheses: form state ignores saved name (confirmed); browser storage lost the record (disproved: saved-workspace link retained it); URL mismatch (disproved: Update button recognized the view).
- Form now derives the initial name from hydrated saved state, keeps an edited draft scoped to its URL, and announces a successful write. Failed writes preserve both the draft and previous saved record. No storage format/limits changed.
- Red: real component hydration test expected “Family hybrids under €20k”, received “Car search”. Green: 3 React/DOM tests cover hydration/update, quota failure/retry, and filter navigation. `bun run --no-env-file test apps/web/src/app/saved-workspace.test.tsx`; web typecheck passed.
- Browser: reopen, keyboard focus/submit, save confirmation, and saved-workspace link retain name. Desktop and 390×844 inspected. Screenshot: `evidence/pass2-saved-view-mobile.jpg`.
- Domain-modeling guidance applied to next batch: existing analytics require positive prices. Extend that established invariant to user-facing sorting/filtering/display; preserve raw source values and response field shapes. No new domain model or ADR needed.

### Pass 2 completed batch 2 — consistent usable price evidence

- Reproduced: ascending listing sort placed zero first; budget queries included it in rows/counts; history `20000 → 0 → 19000` reported 2 changes; comparison rendered `0 €` and subtracted it from a real reference. Raw SQL used prices without the positive-price rule already present in research statistics. Alternative hypotheses (missing rows/availability selection/rounding) disproved by explicit fixture IDs and values.
- Sorting places nonpositive/missing prices last; shared filter SQL excludes them from budget-filtered listings, counts and research. History change count ignores missing prices. Display uses “Not recorded”; reference differences need two positive prices; history charts leave gaps and history summaries ignore placeholders. Raw stored/API observations and legitimate zero fees/differences are preserved. No migration/index/cache-policy change.
- Regression loops each failed first, then passed: price sorting, current/sold budget evidence/counts, real history changes, rendered comparison. `bun run --no-env-file test packages/domain/src/product.test.ts packages/domain/src/product.integration.test.ts`: **23 passed** with dedicated fixture DB. Comparison + formatting: **5 passed**. Web typecheck, lint and diff whitespace check passed.
- Preview fixtures now include current zero/missing and sold zero; synthetic DB updated only 3 known fixture snapshots. Browser checked both pages of Lowest price, exact unpriced detail, zero change count, one valid history observation, selecting cars, reference switching and differences-only. Desktop + 390×844 inspected, no viewport overflow or console warnings/errors. Screenshot: `evidence/pass2-unpriced-comparison-mobile.jpg`.
- Architecture self-review: reuse one SQL expression at the sort/filter interface and existing formatting module; no generic data adapter/refactor needed. Standards and acceptance self-review found no unresolved correctness issue in this batch. Low-priority pre-existing chart axis formatting can repeat compact ticks on a constant-price history; record for a targeted chart pass, not a blocker for missing-price semantics.

### Pass 2 completed batch 3 — model request recovery and cleanup

- Red loops: a stalled HTTP transport left the model field disabled with no Retry; switching makes left the old request signal active. Existing sequence counter prevented stale results but did not release requests. Fetch uses a 15-second deadline, aborts replaced/unmounted requests, and keeps stale/cancelled responses out of state. Timeout/network failures retain the selected make and expose existing Retry. No API/deployment change.
- Two real React form tests cover timeout → Retry → Corolla, out-of-order Honda/Toyota responses, and unmount cancellation. Web typecheck/lint pass. Browser paused only the local `/api/filters` resource through supported CDP, observed Retry with Honda still selected, resumed it and loaded Civic, then applied a Toyota/Corolla search with 12 results. Interception cleared. 390×844 error/retry layout inspected: `evidence/pass2-model-timeout-mobile.jpg`. Browser tooling capped each individual wait around 3 s; timeout state was inspected after 52 s, so this is recovery proof, not a measured 15-second latency claim.
- Tooling review pinned **jsdom 27.4.0** (official npm metadata: Node ^20.19 / ^22.12 / >=24) instead of latest 30 (requires newer Node). All six new DOM tests pass on installed Node 24.4.1. Lockfile comparison confirms **no original package versions removed**; production dependency declarations unchanged. Bun add unexpectedly reports automatic `.env` loading despite its flag; it performed dependency installation only. All app/test/database commands use explicit isolated configuration; no values were read or printed.

### Pass 2 completed batch 4 — chart selection stays within the displayed evidence

- Browser reproduction: select the Toyota point (€10,000 / 40,000 km / 2015), filter to Honda; “Recorded in this view” still shows the Toyota point. Component regression also keeps €10,000 when that listing's historical point is €11,000. This is duplicate selected-object state, not stale API data or URL filters.
- Store identity only and derive selected evidence from the current response. Regression failed at €10,000 versus expected €11,000, then passed. Browser current → September shows €11,000 and preserves selection; filtering to Honda removes the Toyota summary. Keyboard point selection and complete SSR labels continue working. Screenshot: `evidence/pass2-historical-selection.jpg`.

### Pass 2 final coverage and verification

- **239 tests / 39 files passed**, 26.51 s, including every PostgreSQL integration suite. All package/web/API/worker typechecks, web lint, and all three production builds passed. `node scripts/verify-crawler-http.mjs` passed robots, crawler rejection/budget, browser HTML and RSC checks against the compiled app.
- Commands: explicit localhost fixture `TEST_DATABASE_URL` with `bun run --no-env-file test`; `bun run --no-env-file typecheck:packages`, `typecheck:web`, `typecheck:api`, `typecheck:worker`; `bun --no-env-file --cwd apps/web lint`; `bun --no-env-file --cwd apps/{web,api,worker} build` (each separately); `git diff --check`. API build needed standard escalation for Windows workspace-link permissions.
- Compiled `next start` smoke: real analysis data and exact-table keyboard Space selection at 320×780; no horizontal page overflow or console errors/warnings. Screenshot: `evidence/pass2-compiled-chart-mobile.jpg`. Development browser checks above cover 1280×900 and 390×844, saved view hydration/recovery, unpriced listing/detail/comparison, dependent models and changing historical filters. No formal accessibility or real-device conformance claim; no motion changed.
- Recreated only the verified task-owned preview DB after stopping its API; all existing migrations and the modified seed ran successfully from empty, yielding 60 listings / 108 snapshots, including the three missing-price cases. No new migration required.
- Backend/data review followed query parameters through shared SQL, pagination counts, history and public display. Existing integration suites cover worker persistence/retry/recovery/compression. Cache isolation, bounded retention and invalidation, authentication/rate limits, and external integration boundaries were assessed; no further change warranted. No measured production performance/storage improvement claimed.
- Sequential standards/acceptance self-review included all tracked and new source/tests/docs/fixtures. No unresolved high-priority finding or unrelated code/config change. Remaining low-priority issue: compact chart axis labels can repeat for very small ranges. Production-scale load and Windows standalone packaging remain unverified locally; Linux deployment verification follows the authorized release.
- Cleanup: removed only the Next-generated instruction stubs absent at baseline, cleared synthetic selections and removed the test saved view through the UI. Compiled tab closed and viewport reset ran; an earlier connection-error tab could not be closed by the browser tool because its internal data URL was denied, and remains subject to normal temporary-tab cleanup.
- Local reproduction uses `docs/local-development.md`; review this pass against `010e332e75fd3aa8a166f7909c7cc811ad168f2a`. Screenshots use synthetic data only. Release will use the existing deployment lock and compose override, retaining previous web/API images; database and worker need no update.

## Pass 1 archive

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
