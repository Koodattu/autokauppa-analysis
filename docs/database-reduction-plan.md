# Database reduction after the v4 backfill

Status: implementation and isolated local rehearsal in progress, 2026-09-11.
The first implementation preserves **all** raw JSON/HTML and full legacy image rows
in Brotli bundles; it does not apply the selective retention ideas below.
See [the implementation runbook](database-reduction-rehearsal.md) for the current
commands, verification results, and production execution boundary.
Scope: preserve meaningful listing data, historical analytics, source provenance, and
recoverable images while reducing PostgreSQL storage and future growth.

## Decision

Use an expand/backfill/verify/switch/contract rollout. Reuse the existing offline
backfills, harden their accounting, and complete legacy coverage before deleting
anything. First remove duplicated image representations. Then separate bulky raw
evidence from its stable observation IDs and compact that evidence. Defer changes
to historical snapshots and sightings until the first two releases are measured.

Do not start another full network detail backfill, blanket-delete old records,
drop the legacy image table immediately, or run a database-wide VACUUM FULL.

## Verified baseline

The full missing/v1 run `9ebc5ca9-cb8a-424b-bc58-6d6a0785bda2` completed at
2026-09-11 13:08 Helsinki time: 144,810 resolved, 104,707 parsed, 40,103 unavailable,
zero terminal failures. Completion applies to that selected cohort, not to all
legacy storage. Offline v2 normalization is a separate operation.

At 16:29 Helsinki time, PostgreSQL allocated 17.18 GB. Sizes below are decimal GB
and include indexes and TOAST where applicable:

| Table | Total | Main implication |
| --- | ---: | --- |
| raw_listing_records | 9.20 GB | 7.07 GB is TOAST/auxiliary storage; payloads dominate |
| listing_images | 3.17 GB | 1.50 GB is indexes; compact replacement is incomplete |
| listing_snapshots | 2.03 GB | 1.19 GB is TOAST/auxiliary storage; preserve historical meaning |
| listing_sightings | 0.81 GB | 0.52 GB is indexes; analytics depend on exact observations |
| listing_image_assets | 0.80 GB | Will grow while missing legacy coverage is migrated |
| source_fetches | 0.45 GB | Referenced by raw records, details, and sightings |
| listing_details | 0.37 GB | 105,400 rows, currently all sourced from v4 |

The separate server cleanup task removed about 9 GB of generated website image
cache. The VM subsequently had about 11 GiB available, at 85% use. This is not a
database reduction and must not be counted as migration savings.

Previous bounded samples found:

- 804 v2 snapshots among 1,000 sampled enriched snapshots; all 804 lacked a
  corresponding listing_details row.
- 909 of 1,000 sampled listings with legacy images lacked compact image assets.
- A separate 0.1% block sample of raw records measured approximately 584 bytes of
  stored JSON and 2,434 bytes of stored HTML per sampled search card. These are
  sample averages, not a full census or a reclaimable-space promise.

Seven tables reference raw_listing_records: listings, listing_sightings,
listing_snapshots, listing_details, listing_images, listing_image_assets, and
listing_hero_images. Preserve raw-record IDs rather than deleting their referenced
observations. No foreign keys into listing_images were present in this audit,
but code still reads that table.

## Preservation contract

Keep listing identity, first/last observation, availability, all meaningful price
and mileage changes, seller/status changes, and historical query results. Preserve
seller notes, equipment, registration data, VIN internally, promoted v4 fields,
and any older values that newer or unavailable pages cannot replace.

Keep the original parser version separate from the normalization version. A v2
record normalized into the v4 shape must remain labelled as v2 source evidence.
Do not populate old historical snapshots with details learned at a later time.

Do not remove unique gallery images or URLs simply because a listing is sold or
has one archived hero. That is a separate retention/product decision, not lossless
compaction. Do not assume a current CDN URL will remain downloadable.

Every source field must be classified as preserved, exactly deduplicated,
reconstructible, archived with verified recovery, or unresolved. Unresolved records
are excluded from deletion. Unknown legacy additional fields must survive until
their meaning has been assessed; a bounded normalizer dropping them is not proof
that they were unimportant.

## Work package 1: recovery baseline and complete migration census

Deliverables:

1. Establish a fresh, consistent production backup on a different disk/host;
   stream the dump rather than staging a second full copy on the VM. Include hero
   objects and a checksum manifest separately. Do not assume a PostgreSQL dump
   contains those objects.
2. Restore into a verified isolated local audit database, with no production worker
   or network crawler attached. Existing backup scripts are starting points, not
   proof of a successful recovery. Their migration-count check is insufficient.
3. Record table/index/TOAST sizes, source counts and a full eligibility census on
   the clone. Count v1, v2, v4, unavailable and failed cohorts separately; reconcile
   missing detail rows and unsupported/unowned image URLs.
4. Capture current Product API output, gallery identity/order/fallbacks, historical
   cohort membership, counts, price distributions and selected chart outputs.
   Compare against the same frozen input data after each phase.

The local container inventory contains `my-postgres-prod-copy`, currently stopped;
its name alone does not establish that it is this project's clone or sufficiently
recent. Verify database identity and freshness before using it. Never restore over
an unidentified existing local database.

Acceptance: recovery succeeds, the baseline is reproducible, and every cohort has
an explicit count and disposition. Production remains read-only during this work.

## Work package 2: finish the offline backfills

Reuse:

- apps/worker/src/tasks/backfill_nettiauto_v2_details.ts
- apps/worker/src/tasks/backfill_nettiauto_image_assets.ts
- upgradeStoredNettiautoDetailToV4 and parseNettiautoImageAsset

Changes required before running them as cleanup prerequisites:

- Add durable progress, failure IDs/reasons, skipped-reason counts and resumable
  cursors. Reconcile eligible = migrated + explicitly excluded + failed. A job
  returning successfully is not the acceptance criterion.
- Commit each batch's writes and checkpoint/accounting together; test interruption,
  replay and continuation-job recovery. Do not double-count retry outcomes.
- Rehearse query plans and batch sizes. Existing defaults are 2,000 detail rows
  and 20,000 image rows; use measured bounded transactions and throttle between
  batches. Do not run heavy independent backfills concurrently on the shared VM.
- Do not overwrite a newer v4 detail row with an older v2 record. Audit older unique
  values separately instead of silently discarding them.
- Reconcile v1/unavailable listings separately. Preserve their best stored evidence
  even where it cannot be converted by the v2 normalizer.

The existing v2 job inserts only where listing_details is absent. Its normalizer
requires source_payload.normalizedData and removes additionalSourceFields after
promoting known labels. Preserve unmapped labels in retained evidence and report
them explicitly.

The image job skips unsupported URLs and rows without raw provenance. Its compact
parser supports a limited set of Nettiauto CDN suffixes; it also reconstructs jpeg
variants with a .jpg suffix. Verify exact usable URLs, not merely row counts or
whether a listing has any compact image. Keep useful exceptions losslessly in a
small explicit fallback representation before retiring the old table. Preserve
cohort dates, role, position, dimensions used by the API, and deterministic ties.

Acceptance: full-population reconciliation and zero unexplained field or image
loss; retry/interruption checks pass on the clone. No source HTTP requests are
needed for these two database-only migrations.

## Work package 3: make compact image storage authoritative

The current getPublicListingImages implementation reads both image tables and
chooses between their outputs. Audit both read and write call sites before removal.

1. Deploy compatible readers and ensure all new image writes use the compact
   representation or the explicit exception path. Preserve source cohort metadata.
2. Finish the historical compaction and compare logical images and public gallery
   output for every listing. Additional representative HTTP checks can establish
   current availability, but are not a substitute for metadata preservation.
3. Deploy compact/exception-only API reads; verify no running API, worker, migration
   or diagnostic query still depends on listing_images. Keep the old table through
   the verification period so application rollback remains possible.
4. Run a later, separately authorized DROP TABLE listing_images migration, without
   CASCADE, using a short lock timeout and a verified backup. Do not combine the
   backfill and drop into one startup migration.

Expected reclaim: the old table currently occupies 3.17 GB. Net reduction is
3.17 GB minus additional compact/exception storage and migration overhead. Measure
that delta on the clone; do not promise a 3.17 GB net saving.

Do not require archiving every historical gallery before this representation
migration. Preserve the same source image information in smaller form. Hero
archiving remains separate and must have a storage budget.

## Work package 4: separate observation provenance from bulky evidence

Recommended structure:

- raw_listing_records remains the stable observation/provenance record: existing
  ID, source/listing ID, run/fetch links, parser status/version, timestamps, original
  payload hash and error classification.
- Add a payload reference and an explicit evidence disposition/version. Store
  retained bulky JSON/HTML in a separate payload table, shared only when content is
  exactly equal under a defined canonical representation. Reuse existing hashing
  helpers; verify equality on digest conflicts. Never rewrite an original source
  hash to pretend a transformed payload was the originally captured evidence.
- An absent payload is explicit (for example archived or intentionally omitted
  under a versioned policy), never a fabricated empty JSON object representing a
  successful complete capture. Archived evidence needs a manifest/object reference.

This lets existing foreign keys, historical tie-breaking and source IDs survive
while reducing repeated payloads. It also keeps replay/debugging behavior explicit.
Implement compatible reads before changing legacy payload storage.

New-ingestion policy, starting conservatively:

| Data | Initial policy |
| --- | --- |
| Search observations | Preserve thin provenance and sightings for every observation |
| Search JSON evidence | Retain first observation, meaningful changes, failures/anomalies, and a deterministic audit sample; exactly deduplicate other repeated retained bodies |
| Successful search-card HTML | Stop long-term retention only after field/replay coverage is demonstrated; preserve anomalous or otherwise unique evidence |
| Detail evidence | Keep every distinct meaningful version, including legacy-only fields; share exactly duplicate bodies across repeated fetches |
| Current normalized detail | Keep listing_details; it is valuable and comparatively small |
| Parser failures/unknown formats | Preserve full evidence initially; no age-based purge in this release |

For existing data, classify records in resumable batches. Copy and verify the
retained payload representation before clearing old wide columns. Export unique
evidence not kept in PostgreSQL to a checksummed off-host archive before removing
its online copy. Do not use normalized changeHash alone to declare raw evidence
duplicate: source fields outside today's normalized schema may differ.

Keep per-batch counts, byte estimates, disposition reasons and archive checksums.
Retries must be idempotent. Garbage collection must never remove a payload that
still has references. Do not hold a transaction open across archive/network I/O.

Expected reclaim: raw records are the largest opportunity, with 7.07 GB currently
in TOAST/auxiliary storage. This is a candidate footprint, not savings. Retained
payloads, provenance/indexes and new v2 detail rows reduce the net benefit. Publish
measured before/after sizes rather than repeating the earlier unverified 5-7 GB
final-database target.

## Work package 5: reclaim physical space after logical compaction

An UPDATE/DELETE generally makes PostgreSQL pages reusable; it does not necessarily
return their space to the filesystem. Dropping wide columns also does not immediately
shrink the table. Standard vacuum/analyze remains useful for reuse and query plans.

Rehearse targeted physical compaction of raw_listing_records on the clone after
the image-table reclamation. Prefer a scheduled, table-specific VACUUM FULL when
measured lock duration and disk demand are acceptable. It is a maintenance command,
not a transaction-wrapped application migration, and blocks use of that table.

Do not add pg_repack or a complex online table swap by default. If the measured
maintenance window is unacceptable, evaluate those separately, including extension
support, dependencies, delta capture and rollback. Extra disk capacity may be the
simpler prerequisite on this shared host.

Before execution, record peak extra disk for the new heap/TOAST, rebuilt indexes,
WAL, temporary files, concurrent service growth and recovery reserve. The ~11 GiB
currently free is not by itself proof that the rewrite fits. If the measured budget
does not fit, add/attach storage or defer the rewrite. Never erase rollback evidence
just to make room for the operation that requires it.

Acceptance: verified filesystem bytes reclaimed, foreign keys intact, application
and historical outputs unchanged, acceptable latency, and no disk-full errors.

## Later work, outside the first two cleanup releases

- Snapshot detail JSON: preserve distinct historical values and their effective
  timestamps. If duplicate detail sections dominate, introduce shared versioned
  detail content with a snapshot reference and compatible historical readers.
  Do not replace past detail state with the latest listing_details row.
- Sightings: leave exact observations intact initially. The existing research and
  crawl-quality code depends on run/page/fetch identity and snapshot tie-breaking.
  Presence intervals must distinguish unobserved gaps, incomplete crawls, repeated
  appearances and relistings; they are not an automatically lossless substitute.
- Fetch diagnostics: retain IDs required by foreign keys. Compact wide successful
  diagnostics before considering row deletion. Choose operational retention only
  after recording permanent crawl/parser totals and assessing debug/replay needs.
- Indexes: inspect redundancy, constraints and representative query plans. A zero
  usage counter over a short/reset statistics window is not deletion evidence.
- Use table-specific autovacuum settings only when measured churn justifies them.

## Implementation and release checks

First implementation batch: recovery/census tooling, hardening the two existing
offline backfills, preservation tests, and a report of exceptions. Then run those
jobs on the clone and publish the exact production runbook. No destructive SQL is
needed to start this batch.

Follow with a compact-media cutover/contract release, then the raw-evidence
expand/backfill/contract release and separately scheduled physical reclamation.
Assign migration numbers from the repository's current journal at implementation
time; the inspected journal ends at 0014.

Use the existing Bun workspace, Vitest and real PostgreSQL integration path.
Cover retry/crash recovery, unsupported image variants, newer v4 versus older v2,
unknown legacy fields, concurrent ingestion, current API behavior, historical
as-of behavior, provenance references and payload reconstruction. Verify the
public schema continues to exclude VIN. Run relevant tests, types and builds for
each code release; this planning change does not claim those checks have run.

Rollback is phase-specific: before contract, restore old readers; after data
removal, recovery requires the verified archive/backup and a procedure that also
preserves writes made since it. A schema rollback cannot recreate deleted values.
Keep normal ingest under controlled pause during any rehearsal-proven final
cutover that requires it; doing so in production needs explicit execution approval.

Track database/table/payload bytes, evidence retained/archived/omitted, migration
remaining/failed counts, duplicate storage avoided per crawl, free disk, API disk
errors and hero/cache bytes independently. Bound the generated Next.js image cache
as a separate small change so database savings are not consumed by web cache growth.

Production execution remains separate from this plan: no SSH writes, job queueing,
pauses, deployments or destructive migrations are authorized by merely preparing
the plan. Present the measured migration and recovery runbook before execution.

## References

- docs/storage-v4-rollout.md and scripts/audit-storage-v4.sql
- packages/domain/src/persistence.ts, product.ts, research.ts, listing-images.ts
- packages/domain/src/nettiauto.ts (legacy normalization)
- packages/db/src/schema.ts and packages/db/drizzle/0011_detail_v4_compact_media.sql
- PostgreSQL 18 routine vacuuming:
  https://www.postgresql.org/docs/18/routine-vacuuming.html
- PostgreSQL 18 ALTER TABLE (dropped-column storage behavior):
  https://www.postgresql.org/docs/18/sql-altertable.html
