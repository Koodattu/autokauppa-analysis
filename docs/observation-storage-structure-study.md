# Observation structure and temporal packing — 10 October 2026

**Decision: do not promote these prototypes into application storage.** No tested
design yet justifies that migration for the requested substantial reduction,
preferably multiple GiB. The best metadata result is an optimistic 20.3% of two tables, approximately
0.44 GiB under fixture-like production distributions, not 20.3% of the database.
The subsequent bounded production similarity check found a **4.70% compressed-byte
reduction** in its largest matched bundle. That small, survivor-biased panel does
not establish useful net production savings, so no temporal repacker was added.

The deliverable is a reproducible local experiment and a conditional migration
assessment. Application code, migrations, retention, crawling, production data,
and deployment configuration are unchanged. No database was copied or restored;
no production record, payload, observation identifier or credential was exported. No commit,
push, production maintenance or reclamation was performed. The older experiments
remain available in [the original report](../scripts/observation-storage/README.md).

## Current production evidence

The read-only refresh observed PostgreSQL 18.4, a database size of
**7,205,713,599 bytes (6.71 GiB)**, and **8,904,986,624 bytes (8.29 GiB)** free on
the shared root filesystem at 89% usage. This is a point-in-time observation,
not reserved migration capacity.

| Relation | Total bytes, including indexes/TOAST | Estimated rows |
| --- | ---: | ---: |
| raw_listing_payloads | 1,702,092,800 | 26,391 |
| raw_listing_records | 1,274,413,056 | 2,685,690 |
| listing_sightings | 1,036,926,976 | 2,126,482 |
| listing_snapshots | 815,333,376 | 949,465 |
| normalized_payloads | 573,652,992 | 19,568 |
| listing_legacy_image_bundles | 494,821,376 | 388,104 |
| source_fetches | 455,524,352 | 574,994 |

Row counts are catalog estimates, not fresh censuses. Raw metadata and sightings
occupy 2.15 GiB together; their indexes account for 1.08 GiB. Catalog widths and
distinct-count estimates informed the synthetic row widths and cardinalities.
They do not establish dictionary cardinality, bloat or future growth precisely.

The query used read-only transactions, five-second statement and 500 ms lock
timeouts, one connection, no parallel workers and 4 MiB work memory. A repeatable
page sample examined at most 256 sighting metadata rows, with primary-key probes
into raw records and fetches. It found no context/time mismatch in that panel.
It did not read raw payload contents or establish global one-to-one relationships.
The local aggregate artifact is 23,566 bytes including its file encoding/newline.
This catalog refresh did not compress evidence. The separate bounded in-memory
compression comparison is reported below; no full-table census was run.

## Reader and writer constraints

The investigation traced these actual callers:

| Path | Consequence for a storage design |
| --- | --- |
| `persistence.ts`: search/detail persistence | Fetch, raw and sighting retries update existing records while retaining original UUIDs. New pages must remain atomic. |
| `research.ts`: historical research | Select the last completed run per query, then the latest sighting per listing. Snapshot selection uses observation time, exact raw-record match, creation time and UUID tie-breaking. Filters and pagination operate on that historical snapshot. |
| `product.ts`: detail/history, time series, parser diagnostics | Preserve full history, time filters, parser provenance and raw lookup. Diagnostics also need broad capture-time aggregation. |
| `persistence.ts`: completion and missing-listing reconciliation | Counts distinct listings per crawl; uses query/listing/run existence checks. |
| detail-backfill task/control and v2 reprocessing | Need source listing identity, record kind and parser status/version without decoding all evidence. |
| `storage.ts` and `gallery-storage.ts` | Original raw UUIDs locate exact JSON text/HTML and remain referenced by snapshots, details and gallery sources. Legacy image fallback remains intact. |

Consequently, replacing UUIDs requires accounting for the reverse mappings;
packing queried fields requires accounting for their remaining projections and
indexes. Equal sampled timestamps do not authorize deriving independent historical
fields from mutable fetch rows. A compressed archive also needs a retry/correction
strategy: historical observations are not universally immutable in the current API.

## Matched synthetic metadata experiment

The larger run contains **20,000 listings, 100,000 raw records, 80,000 sightings**
and eight current/sold crawls. Twenty percent of raw records are singleton detail
observations. Fetch times differ and retain actual PostgreSQL microseconds.
Historical evidence uses UUID-ordered 250-record packing; recent search evidence
uses page packing. Raw values include independent timestamps, a changed URL,
leading-zero source identity, null/empty fields, a parser failure, inline evidence
with a large integer, and competing snapshots at the same observation time.

Both sides use the same data and PostgreSQL 18.4, fresh indexed tables, a temporary
memory-backed container limited to two CPUs and 1.5 GiB, and local Bun 1.3.9.
Warm read timings alternate candidate/baseline order over seven measured runs.
Results retain individual samples and min/max; small timing differences are not
claims of a reliable speedup. Cold caches, production disk I/O and production-size
query plans were not tested.
The snapshot fixture keeps four changed states per listing for historical-query
coverage; its snapshot frequency is higher than the production catalog average.

| Representation | Complete affected allocation | Saving vs baseline |
| --- | ---: | ---: |
| Existing raw metadata + sightings | 86,269,952 bytes / 82.27 MiB | — |
| Compact keys + shared metadata contexts | 74,145,792 bytes / 70.71 MiB | 14.05% |
| Compact keys + fused raw/sighting row | 68,755,456 bytes / 65.57 MiB | 20.30% |
| Compact keys + 128-record cold-field blocks | 77,135,872 bytes / 73.56 MiB | 10.59% |

All candidate mapping/dictionary heaps, indexes, sequences, locator constraints,
and TOAST are included. Common fetch, listing, snapshot and evidence tables are
unchanged and excluded equally. No external storage is introduced. Fresh-copy
compaction of unrelated tables, prior storage-v2 savings, and removal of unused
indexes are not counted.

Compact dictionaries retain original UUIDs and exact source identifiers, URLs,
parser versions, raw/sighting timestamps and independent contexts. The sighting
rows retain a direct indexed run key. Fusing adds the sighting fields to the raw
row, eliminating another tuple and repeated raw/fetch references while keeping
both identities and both uniqueness requirements.

Fusion is conditional on at most one sighting per raw record and equal fetch
identities. The experiment refuses counterexamples; production eligibility is
unknown. There is no exception store or fused ingestion implementation. Its result
is an optimistic measurement, not a deployable design or a recommendation to
discard incompatible history.

Cold blocks move exact URLs, evidence hashes, offsets and other unqueried fields
into PostgreSQL-compressed JSONB arrays. They preserve inline JSON as text until
PostgreSQL reconstructs it, retaining large numeric values. Required relational
keys, lookup dictionaries and block locators consume the hoped-for gain: this
variant is larger than compact rows alone. Block recovery also does extra work;
PostgreSQL's [TOAST representation](https://www.postgresql.org/docs/18/storage-toast.html)
does not make repeatedly extracting fields from a compressed block free.

### Read and write results

The final views use foreign-key-backed left joins so PostgreSQL can remove
dictionary joins whose fields a caller does not need. The first inner-join
version was slower; the following figures describe the improved version.

| Warm operation, median ms | Baseline | Compact | Fused |
| --- | ---: | ---: | ---: |
| Listing sighting history | 0.85 | 1.14 | 1.20 |
| Filtered historical research, application function | 175.62 | 183.19 | 177.10 |
| Unfiltered historical research, application function | 218.75 | 231.63 | 225.53 |
| Distinct crawl count, compatibility view | 1.54 | 6.13 | 7.29 |
| Query/listing history | 0.85 | 1.21 | 1.21 |
| Raw detail lookup by source identity | 0.45 | 0.93 | 1.00 |
| Recent parser-quality aggregation | 6.26 | 16.11 | 17.31 |

Counting distinct internal listing keys directly fixes the compact crawl-count
regression without an additional index: **1.53 ms baseline vs 1.48 ms compact**;
the fused layout takes 3.49 ms. This requires a changed reader, not just a view.
The internal-count output is checked against the application's UUID-based count.

A committed fetch plus 30 raw/sighting metadata pairs took median **61.86 ms
baseline vs 65.33 ms compact**, five measured writes after warm-up. These use
existing evidence and do not claim to benchmark complete ingestion. Two concurrent
duplicate-page writers took 165.96 / 181.02 ms respectively; both returned the
winning original IDs and left exactly 30 sightings. Independent connection pools
were used, rather than accidentally serializing both requests through one client.

Existing fixture evidence packing took 2,448 ms for 100,000 records, separately
from metadata writes. Cold-block construction took 8,262 ms. Sampled application
raw recovery took median 6.04 ms baseline, 6.52 ms compact and 8.44 ms blocked.
These are local warm measurements, not forecasts of server throughput.

## Temporal evidence packing sensitivity

This tests a different question from the rejected exact-deduplication experiment:
can nearby, similar observations compress together while retaining every byte?
There is no evidence dictionary. Both layouts retain every pair in 250-record
Brotli bundles, using the existing codec and complete UUID/digest/offset locators.
Locator insertion order is matched. Every pair has unique HTML, so **zero complete
pairs repeat**.

Each scenario contains 20,000 observations and 109,560,612 decoded bytes. One
scenario has independently changing synthetic source text; the other assigns the
same amount of text to a listing across crawls. Baseline compression is 24.35x and
24.78x respectively, near the previously measured 26.6x production sample ratio.
The fixtures model that ratio, not the unknown real cross-crawl similarity.

| Scenario | UUID-order total | Listing/time-order total | Net saving |
| --- | ---: | ---: | ---: |
| Independent text per observation | 7,356,416 bytes | 7,290,880 bytes | 0.89% |
| Stable text per listing | 7,315,456 bytes | 4,423,680 bytes | 39.53% |

Payload-table allocation alone improves 0.86% / 60.45%; those percentages are
**not** the total-component or whole-database savings. Packing took 678 / 652 ms
for independent text and 641 / 588 ms for stable text (UUID / temporal); these are
single packing passes, not repeated speed comparisons. Both scenarios passed
complete stored-byte reconstruction in both layouts: **80,000 reconstructions**.

This sensitivity prevents a credible production projection from the existing
compression ratio alone. The old panel's absence of exact duplicate pairs says
nothing conclusive about whether different pairs share compressible substructure.
Neither scenario is a measured production saving or a statistical bound on it.

## Bounded production similarity check

The requested follow-up ran once on the existing production worker. PostgreSQL
remained read-only: session-enforced read-only transactions, five-second statement
timeouts, 500 ms lock timeouts, one connection and no parallel workers. No remote
files, tables, exports, maintenance or persistent data changes were made. Only
**2,201 bytes of numeric aggregates** crossed SSH; no raw records, identifiers,
hashes, payloads or credentials left the server.

Selection used the latest three complete current and sold crawls within
1 July–10 October. Four source identities were seeded near each of three page
positions in the oldest selected crawl of each kind, then followed through those
crawls. Up to two detail observations were requested for eight seed identities.
The accepted panel contained **71 observations: 31 current cards, 34 sold cards
and six details**, covering 24 search identities and three detail identities.
There were 25 repeated identities and two singleton identities, counting search
and detail separately. All selected candidates fit the work budget.

| Server work | Observed | Hard limit |
| --- | ---: | ---: |
| Selected observations | 71 | 300 |
| Selected encoded evidence | 1,566,424 bytes | 8 MiB |
| Stored bundle reads | 58 | 80 |
| Decoded stored evidence | 128.65 MiB | 256 MiB |
| Compression input across all comparisons | 17.93 MiB | 128 MiB |
| SQL statements, including session settings | 213 | 260 |

A 90-second server watchdog and 110-second client timeout bound the run. Raw
evidence existed only in server memory. Unselected entries were discarded after
each bundle decode. A local attempt ledger reserves the entire allowance before
SSH and refuses subsequent attempts, including after failure. The client accepts
only the fixed aggregate schema and at most 16 KiB of output.

Each comparison uses exactly the same observations, the existing quality-5 Brotli
codec, and equal record limits and bundle counts. The baseline sorts by raw UUID;
the candidate sorts by source identity, search/detail kind, capture time and UUID.
No deduplication, reduced evidence or lossy parsing is involved. All **852
record round-trip comparisons passed**, including the separate kind panels.

| Maximum records per bundle | Actual bundles | UUID order, compressed bytes | Temporal order, compressed bytes | Difference |
| --- | ---: | ---: | ---: | ---: |
| 16 | 5 | 64,560 | 40,325 | 37.54% smaller |
| 64 | 2 | 36,181 | 30,085 | 16.85% smaller |
| 250 | 1 | 29,314 | 27,936 | 4.70% smaller |

The 250 limit fits this whole 71-record panel in one bundle; it is **not a test
of full 250-record production neighborhoods**. In the largest separate kind
bundles, current cards improved 3.81%, sold cards 4.22%, and details grew 0.40%.
Only three identities supplied details, so general singleton-detail costs remain
unmeasured. Other limits include ordered seeds, surviving listings, missing
crawl observations, and repeated identities concentrated more densely than in
historical UUID-packed storage. These are paired observations, not a representative
survey or an estimate of database-wide savings.

**Decision:** this confirms some temporal similarity but does not establish
meaningful net savings at the existing historical bundle limit. The 37.54% and
16.85% figures are sensitive to bundle boundaries: their temporal outputs still
exceed the 29,314-byte UUID baseline using the 250 limit. The remaining 1,378-byte
gain excludes PostgreSQL allocation, rewrite/WAL costs and rollback retention.
It does not justify implementing a migration on this evidence. Application
storage behavior remains unchanged; actual filesystem reclamation is zero.

The profiler passed a focused TypeScript check, strict schema validation of the
recorded aggregates, and five local Python guard tests covering no repeated
sampling, rejection of raw/unexpected output, response size, redacted errors and
reservation before timeout/failure. These tests mock SSH and do not revisit
production. The final diff passed whitespace checks.

## Verification and limits

The larger completed run passed exact SQL reconstruction of all 180,000 metadata
rows for each compact/fused representation and all 100,000 raw rows from cold
blocks. Each compact/fused representation passed 29 application comparisons:
current/historical research, filters, second-page pagination, time series,
listing details, history and actual legacy gallery fallback. There were 303
untimed application raw-recovery comparisons across compact, fused and blocked
readers, plus recovery timing probes.

Retries preserved original IDs, late timestamps retained microseconds, duplicate
natural keys and missing payload references were rejected, and research responses
matched after writes. The final smaller regression also checks rollback of a
whole 30-record page, rejection of a missing packed-evidence offset, and refusal
of both fusion counterexamples. The synthetic driver explicitly preserves string
timestamps: the default postgres-js serializer otherwise rounds through JavaScript
`Date`, which would invalidate a microsecond fixture.

Focused TypeScript checking and Python syntax validation passed. Nine existing
codec/gallery unit tests passed. Fused/block writers, full worker integration,
migration restart/resume, and production-scale performance are **not implemented
or certified**. The compact writer is a benchmark probe, not a replacement for
application persistence. The full application build was not needed or run for
these opt-in scripts.

## Savings, growth and migration decision

Scaling the measured per-observation metadata difference to the current estimated
populations, assuming fixture-like dictionary/context cardinalities, suggests
approximately **0.30 GiB compact, 0.44 GiB fused, or 0.23 GiB blocked**. These are
uncertain structural scenarios, not measured production savings. The best scenario
is roughly 6.5% of today's whole database. It also leaves the largest evidence,
snapshot, normalized and legacy-image stores unchanged. This modest gain does
not justify the broad compatibility changes on present evidence; the fusion
scenario also lacks proven eligibility and a writer.

Those ratios describe only future growth of the affected populations under the
same mix. They are not a whole-database growth rate. Existing allocation made
reusable inside PostgreSQL is distinct from bytes returned to the filesystem.
**Actual filesystem bytes reclaimed by this task: zero.**

Do not deploy these SQL files as migrations. Multi-table compatibility views do
not support the application's existing table upserts unchanged; see PostgreSQL's
[view update rules](https://www.postgresql.org/docs/18/sql-createview.html).

If later evidence justifies a design, the required migration sequence is:

1. Establish eligibility over all retained metadata, or implement and charge for
   every exception. Inventory/repoint incoming raw foreign keys from listings,
   snapshots, details and gallery sources; adapt persistence, maintenance and
   reprocessing callers. Keep externally visible identities unchanged.
2. Rehearse bounded, resumable batches and crash/retry/correction behavior on
   synthetic data. Compare original values and application responses before
   retiring anything. Pack complete new rows once where possible; avoid an
   insert-inline-then-rewrite ingestion path.
3. Budget the current replacement, including its indexes, at roughly 1.7–1.9 GiB,
   plus actual WAL generation/retention, temporary files, concurrent host growth and
   operational reserve. The current 8.29 GiB free does not prove this fits. Measure
   WAL and peaks in a local disk-backed synthetic rehearsal and refresh shared-host capacity
   before proposing execution. No production benchmark tables are needed.
4. Define an explicit writer cutover and a lossless rollback boundary. Retained
   original tables support rollback only until new writes diverge; thereafter
   reverse-convert new records or use an audited change journal. Reverting app
   images alone is insufficient. Do not create a full production copy here or
   elsewhere as a workaround.
5. Reclaim only after preservation verification and explicit production authority.
   Retiring a whole old table and reclaiming dead tuples after an in-place rewrite
   have different disk/lock costs; ordinary VACUUM alone is not the structural
   saving. Keep rollback capacity until acceptance.

The aggregate-only similarity follow-up above completes the proposed next
experiment. It does not clear the implementation gate. A future decision would
need representative full-bundle neighborhoods and net PostgreSQL allocation,
including singleton details, rewrite costs and retained rollback evidence. The
small-panel percentages must not be extrapolated to production bytes or used to
justify a larger production scan without separately defining its bounds.

## Reproduce and inspect

From the repository root, using the existing dependencies and Docker:

```powershell
python scripts/observation-storage/run.py structure
```

The default uses 20,000 listings. `STRUCTURE_LISTINGS=4000` selects the smaller
regression. Outputs are private under `backups/observation-structure/`, including
`structure-20000-results.json`, `structure-4000-results.json` and `catalog.json`.
The runner creates and removes only its uniquely named disposable localhost
container; it never connects the benchmark to production or reads a backup.

`python scripts/observation-storage/run.py catalog` performs the bounded SSH
catalog check, but refuses another refresh when the recorded aggregate file
already exists. It does not invoke the older raw-evidence sampler.

`python scripts/observation-storage/run.py similarity` performs the bounded
on-server comparison and refuses another attempt once its ledger exists.
`production-similarity.json` and `similarity-budget.json` in the same private
directory retain only aggregates and budget metadata. Do not remove the ledger
to collect additional samples. Local guard tests require no production access:

```powershell
python -B -m unittest discover -s scripts/observation-storage -p test_run.py
```

The [structure harness](../scripts/observation-storage/structure.ts),
[compact schema](../scripts/observation-storage/compact.sql),
[fusion experiment](../scripts/observation-storage/fused.sql),
[cold blocks](../scripts/observation-storage/blocks.sql), and
[temporal packing](../scripts/observation-storage/packing.ts) contain the measured
implementations. They are isolated from deployed application migrations.
