# Observation storage experiment — 5 October 2026

Opt-in investigation only. These scripts do not change application behavior,
production schemas, retention, crawling cadence, or the deployment. They do not
create or restore a full database copy.

## Reproduce

From the repository root, with Docker, Python, Bun and the existing dependencies:

```powershell
docker pull postgres:18.4-alpine
python scripts/observation-storage/run.py benchmark
```

The runner creates a uniquely named, localhost-only PostgreSQL 18.4 container,
limited to two CPUs and 1.5 GiB RAM. PostgreSQL data is in temporary memory-backed
storage. Only that container is stopped and removed in `finally`. Existing
containers, databases and volumes are never reused or modified. The database
name and localhost target are also checked inside the benchmark.

The optional production profile is a **read-only, aggregates-only** operation:

```powershell
python scripts/observation-storage/run.py profile
```

It uses the existing SSH alias and worker runtime; it does not start crawler work.
Only SELECTs and session settings are issued, with read-only transactions,
five-second statement and 500 ms lock timeouts, no parallel queries and sequential
requests. No files, tables or exports are created on the server.

Raw evidence stays on the server. The worker decodes existing Brotli bundles,
selects the required entries in memory, compares complete JSON-text/HTML pairs,
checks round trips and emits aggregate counts and byte sizes only. Hash equality
is checked against the complete pair before considering two records identical.
The original JSON text, large numeric literals, HTML and null/empty distinctions
are preserved. Neither hashes nor source/listing identifiers appear in output.

The selected in-memory panel is capped at 300 observations and 8 MiB including
reference metadata. The client independently caps received bytes. The private
ledger reserves the entire allowance before every attempt, including failures,
and refuses totals above 100,000 rows or 100 MiB. A successful profile is reused;
running `profile` again refuses to accumulate another sample. At most 80 stored
bundles and 256 MiB of internal decompression work are allowed per attempt; those
unselected bundle entries are not exported or retained. This internal read budget
is separate from the selected panel and extraction budgets.

All reports, budget records and diagnostic logs are under the existing ignored
`backups/observation-prototype/` directory. `results.json` contains full table,
index, TOAST, size and timing results. `production-profile.json` contains only
aggregates. No production sample file exists.

## Experiment A: share fetch context

The source fetch already identifies the crawl run, detail-backfill run, query
and page. A sighting also repeats the crawl kind held by the crawl run. The
prototype gives fetches an additional bigint identity and makes raw records and
sightings reference it. Compatibility views reconstruct the original columns.
Observation UUIDs, raw UUIDs, source listing IDs, URLs, parser fields, hashes,
ordering fields and independent raw/sighting timestamps remain unchanged.

This is deliberately conditional on redundant context matching exactly. An
eligibility check rejects inconsistent history instead of silently correcting it.
The measured production panel had no such mismatch; that is not a full census.
Immutable-context triggers prevent later changes from rewriting the meaning of
existing observations. A real implementation must decide how to version any
context that legitimately changes.

Counted supporting structures include:

- The complete source-fetch table and every original index.
- Fetch bigint uniqueness, run lookup and query/time lookup indexes, plus sequence.
- Raw primary key, original unaffected indexes and replacement fetch/listing/kind
  uniqueness, with payload and fetch foreign keys.
- Sighting primary key, listing/time and global time/listing indexes, replacement
  fetch/listing uniqueness, raw lookup and listing/raw/fetch foreign keys.
- Unaffected foreign keys on copied supporting tables.

The earlier zero-scan `listing_sightings_seen_listing_idx` is retained.
`listing_snapshots_listing_latest_idx` is unchanged. Header compaction and empty
index reclamation are not part of these savings.

### Measured storage

The same synthetic data is used on both sides: 4,000 listings, eight complete
current/sold crawls, 20,000 raw observations, 16,000 sightings and 4,536 fetches.
Twenty percent of raw observations are singleton detail fetches, to avoid assuming
all contexts are shared by a full page of cards.

| Affected allocation, including indexes/TOAST | Baseline bytes | Candidate bytes |
| --- | ---: | ---: |
| Raw metadata | 8,642,560 | 7,544,832 |
| Sightings | 7,839,744 | 5,988,352 |
| Fetch table and indexes | 1,417,216 | 2,187,264 |
| Additional identity sequence | 0 | 8,192 |
| **Total** | **17,899,520** | **15,728,640** |

Saving: **2,170,880 bytes / 12.13%**. Unchanged application tables are excluded
equally; fresh-copy compaction of unrelated tables is not counted as a benefit.
These are separate component experiments, not additive whole-database totals.

Warm local medians, with one warm-up followed by five or nine repetitions:

| Operation | Baseline ms | Candidate ms |
| --- | ---: | ---: |
| Listing history | 0.91 | 1.16 |
| Filtered historical research, real domain function | 22.97 | 23.72 |
| Sighting count for one crawl | 0.90 | 2.19 |
| Query/listing history | 1.02 | 1.12 |
| Commit one fetch and 30 raw/sighting metadata pairs | 53.09 | 55.09 |

Writes include indexes, FK enforcement and commit, using existing compressed
payload references. Packing cost is measured separately below. These are local
memory-backed database timings, not production disk-throughput predictions.

Extrapolating *per-table bytes per row*, including increased fetch overhead, to
the October 5 catalog estimates (2,762,160 raw rows, 2,263,642 sightings, 613,098
fetches) suggests roughly **0.3 GiB structural saving**. Widths, index fill,
history consistency and full-size query plans remain uncertain. This is not a
measured production saving or a bloat estimate.

## Experiment B: exact evidence dictionary

The baseline retains Brotli quality 5, whole-bundle digest deduplication, metadata
and observation locators. Both current page/singleton packing and the existing
historical 250-record packing are measured. The candidate stores each distinct
complete JSON-text/HTML pair once in 250-entry compressed bundles, adding a
digest-unique dictionary, dictionary-to-bundle index, observation-to-dictionary
locators and reverse lookup index. All are included in totals.

The synthetic corpus has 7,200 exact repeated observations out of 20,000 (36%).
Some repeated JSON has different HTML and must remain distinct.

| Representation | Total bytes | Packing ms | DB load ms | One recovery median ms |
| --- | ---: | ---: | ---: | ---: |
| Current page/singleton baseline | 4,562,944 | 782.81 | 574.16 | 1.41 |
| Historical 250-record baseline | 3,006,464 | 765.03 | 513.40 | 4.36 |
| Exact dictionary, packed 250 at a time | 5,570,560 | 525.62 | 829.31 | 5.89 |

Candidate hashing and full-pair equality checks add **359.33 ms** before packing.
The dictionary itself occupies **2,981,888 bytes**, including indexes. Even with
36% repetition, the candidate is 22% larger than the page baseline and 85% larger
than the historical baseline. Locator tables model the representation change in
isolation; their common UUID/tuple overhead is not a proposal to duplicate the
application's raw-record identity table.

The production profile selected **84 observations**, including 60 current and 24
sold observations, across three current crawls (September 17/25, October 3) and
two sold crawls (August 12, September 3). Seeds came from three page positions in
the oldest selected crawl, following the same listings forward. All 84 exact
pairs were distinct and passed reconstruction. This is a small survivor panel of
search cards, not a random estimate for the whole dataset or detail evidence.

Selected evidence was 2,530,770 uncompressed bytes, processed only on the server.
The successful profile exported **1,679 bytes of aggregates and zero observation
rows**. Two earlier attempts failed before emitting a profile; all three attempts
remain charged conservatively as 900 rows / 24 MiB in the private ledger.

## Verification and recommendation

The final benchmark passed:

- Exact SQL reconstruction of all 20,000 raw records and 16,000 sightings.
- Duplicate-insert rejection and original-ID preservation for both retry paths.
- FK rejection of missing payloads/listings; protection against mutable context.
- Inconsistent-context refusal and snapshot-at-observation timestamp tie-breaking.
- 29 actual application response comparisons: current/historical research,
  filters, time series, listing details and legacy gallery fallback.
- 105 existing application raw-recovery calls.
- Full stored-byte and locator reconstruction of all 20,000 records in each of
  the three evidence representations (60,000 reconstructions).
- Different HTML, null versus empty HTML, and exact large JSON integer text.

Nine existing codec/gallery unit tests passed. The benchmark passed focused
TypeScript checking; the Python runner and server profiler passed syntax checks.
Runtime: local Bun 1.3.9 on Windows, PostgreSQL 18.4; the production profiler used
the deployed worker runtime. No cold-cache or concurrent-writer test was run.

**No-go for production deployment of this prototype as-is.** Exact evidence
deduplication is a no-go: the bounded real panel showed no repetition and the
synthetic dictionary lost even with substantial repetition. Shared context is a
plausible modest saving, but the 2.4x crawl-count regression needs resolution and
larger-scale synthetic verification before an implementation proposal is ready.

The smallest next experiment would preserve a direct crawl-run lookup in the
compact sighting representation and include its full cost in the comparison.
Do not combine that estimate with the older index/header opportunities.

No production files were reclaimed. Later normalization would first create space
reusable inside PostgreSQL; physical reclamation requires separately budgeted
rewrites. With roughly 11–12 GiB shared free disk, account for old and new heaps,
indexes, WAL, concurrent application growth and rollback reserve, one table at a
time. These measurements do not establish that a migration fits that budget.
