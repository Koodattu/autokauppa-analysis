# Lossless normalized and gallery storage

Migrations 0016–0018 retain the full dataset while reducing repeated JSON,
gallery index overhead and hexadecimal hash storage. They require a coordinated
maintenance deployment; an old worker cannot write binary evidence hashes.

## Representation

- `normalized_payloads` contains checksummed Brotli bundles of PostgreSQL JSON
  **text**. Numeric literals never pass through JavaScript numbers during storage
  conversion. Snapshots remain independent historical observations; this does not
  replace historical details with the current detail record.
- Snapshot/detail rows reference a bundle and an entry. Their original typed
  columns remain queryable. `normalized_data` retains only `detailParserVersion`
  and `sourceLocationLabel`, the keys queried by SQL. Product detail reads decode
  the complete original object. Tools needing complete JSON must use the decoder.
- Search ingestion bundles a page's new snapshots in its existing transaction.
  Detail ingestion decodes the observation valid at fetch time before merging,
  preserves the existing out-of-order rules, and compresses its result. Replaced,
  unreferenced detail bundles are removed.
- `listing_gallery_bundles` preserves every image asset row, including UUID,
  path, variant mask, role, position, microsecond timestamps and raw record ID.
  `listing_gallery_sources` retains foreign keys to all referenced raw records.
  Per-listing writes serialize on the listing row and retain existing merge rules.
  Readers support both inline and compressed galleries during migration.
- Raw evidence hashes use 32-byte `bytea` values; application boundaries still
  use canonical hexadecimal strings. Migration 0018 rejects noncanonical input.
  Raw JSON/HTML bundles and legacy image bundles are otherwise unchanged.
- Hero files, CDN delivery and image fallback policy are unchanged.

## Rehearsal and preservation

The September 21 production-copy rehearsal reduced allocation from
**8,362,137,279 to 5,579,036,351 bytes**, saving **2,783,100,928 bytes (33.28%)**.
This measures structural savings on an already-restored database, rather than
counting all existing production bloat as a structural improvement.

Both pre-reclamation and post-reclamation verification matched all 16 preserved
data populations: 781,658 snapshots, 385,600 details, 2,239,320 raw records,
2,090,970 image assets and the other unchanged tables. All 217 sampled listing,
history, image and vehicle-detail responses matched. Galleries occupy 100,300
bundles. The three physical rewrites took 8.8 seconds locally. Search probes took
0.10–0.33 seconds; overview took 1.51 seconds. These are local measurements.

All 200 tests, type checks, lint and application builds passed with Bun 1.3.14
on Linux. The temporary test image required full ICU locale data and explicit
forwarding of `TEST_DATABASE_URL`; neither tests nor production dependencies were
weakened to accommodate the rehearsal environment. Actual production worker-image
reads successfully decoded the migrated data, and the rollback-only write canary
passed.

Use `clone-storage-audit.py` to stream a custom-format dump and hero archive to
an isolated local PostgreSQL container. Run tests only through the separate
`run-storage-audit.py --fixture` database. Never run fixture tests on the clone.

`storage-v2-audit.ts` provides these explicit operator actions:

1. `migrate-additive`: apply through 0017, preserving original hash types.
2. `baseline`: save immutable full-population fingerprints, sizes and sampled
   public listing/history/image/vehicle-detail responses.
3. `migrate`: apply 0018's validated hash conversion during a maintenance window.
4. `snapshots`, `details`, `galleries`: transactionally compress bounded batches.
   Each write is decoded and compared before replacing inline data. Rerunning an
   interrupted action processes the remaining inline records.
5. `verify`: compare every preserved table and reconstructed payload with the
   baseline, validate projected SQL fields and gallery source references, and
   compare all sampled public responses. No enrichment exceptions are allowed.
6. After physical reclamation, `verify post-reclaim` repeats preservation checks
   and writes a separate result. `performance` exercises search and overview.
   `canary` checks all three storage writers in a transaction that must roll back,
   then verifies that bundle counts have not changed.

Artifacts contain only fingerprints, aggregate sizes and sample listing IDs.
The original database and hero recovery archives remain private under `backups/`.
Production execution requires `STORAGE_V2_PRODUCTION=nettiauto_analytics` and the
matching database name. Read-only actions enable PostgreSQL's read-only mode.

## Production sequence

Coordinate with other VM tasks and acquire the existing
`/run/lock/koodattu-auto-deploy.lock` **before pushing or changing production**.
Record its exact holder PID. Do not invoke broad Docker cleanup or the automatic
deployment script. Verify the app and deployments revisions and available disk.

1. Build and retain the release and recovery image identities. Stop only the
   Nettiauto worker; confirm no active/pending jobs or in-flight transactions.
2. Stream a fresh recovery dump off the VM, checksum it, and verify decoding.
   Keep the previous verified hero archive if its referenced files are unchanged;
   otherwise capture and verify a fresh archive.
3. Apply additive migrations and capture the frozen data baseline with the new
   audit tool. The old API can keep serving during this stage.
4. Stop the API briefly, apply binary hash migration, then start the new API.
   Keep the worker stopped until all preservation and reclamation checks pass.
5. Compress the three populations sequentially. Check VM headroom between stages.
   Verify all fingerprints and API responses before physical reclamation.
6. Stop the API for each necessary `VACUUM (FULL, ANALYZE)` of
   `listing_snapshots`, `listing_details`, and the now-empty
   `listing_image_assets`, one table at a time. Require enough free space for that
   table's rewritten heap, indexes and WAL plus operational reserve. Restore the
   API on exit, including failures. Do not rewrite unrelated tables.
7. Repeat preservation checks and measure cold queries, public HTTPS, hero
   delivery, health, queue state and logs. Resume the new worker with its existing
   configuration, update only Nettiauto's deployment-state revision, and release
   the verified lock holder.

[`VACUUM FULL`](https://www.postgresql.org/docs/18/sql-vacuum.html) reclaims physical files but requires an exclusive table lock and
temporary rewrite space. Logical compression alone does not return all disk
space to the filesystem. The two previously zero-scan query indexes are retained;
their usage counters do not prove they are dispensable for every historical query.

## September 21 production result

The production migration reduced database allocation from **9,025,115,839 to
5,860,669,119 bytes**, saving **3,164,446,720 bytes (35.06%)**. Unlike the restored
clone measurement above, this includes reclaiming existing production overhead.

| Storage group | Before | After |
| --- | ---: | ---: |
| Snapshots, details and their full JSON | 3.37 GB | 1.17 GB |
| Gallery metadata and source references | 0.94 GB | 0.13 GB |
| Raw records and evidence bundles | 2.53 GB | 2.37 GB |

Both full production audits, before and after physical reclamation, matched all
16 preserved populations and all 217 sampled public responses. The rollback-only
write canary passed. All 202 tests and CI checks passed, including hero scheduling
from compressed galleries. The two query indexes were retained.

The hash cutover took 123 seconds including API shutdown and restart. Individual
gallery, detail and snapshot rewrites took 0.18, 2.66 and 9.36 seconds respectively,
with separate API stop/start windows. Before reclamation, the new API logged
4,296 requests with no HTTP 5xx responses, warnings or application errors.

Post-migration direct search probes took 0.14–0.48 seconds; overview took 1.92
seconds. Public listing/detail and current/sold research checks passed. Previously
problematic uncached research filters also passed, including the broad price
filter at 5.84 seconds. These are observed timings after the audit, not cold
PostgreSQL buffer-cache benchmarks.

The original two-minute audit timeout was insufficient for a full raw-record
scan on the VM. Full read-only fingerprint scans now have a 15-minute statement
limit; the audit restores its normal limit afterward. Application limits remain
unchanged. The baseline was restarted and completed before any data conversion.

After worker restart, API, worker, frontend, PostgreSQL and FlareSolverr were
healthy, with no new API/worker warnings or errors. The queue had no active or
pending work; its six pre-existing dead jobs remained. Five public WebP hero
responses matched stored byte counts and SHA-256 hashes. VM free space was
14.29 GB (13.31 GiB).

Verified off-host recovery and preservation artifacts are retained privately in
`backups/production-storage-v2-20260921/`. The database dump was fully decoded,
and all 76,839 hero references matched archived file sizes and SHA-256 values.

## Recovery

Before any new ingestion, the verified pre-migration dump plus retained old
application images is a complete recovery point. Restoring it requires a
controlled outage and the normal backup restoration procedure. Do not start an
old worker against binary hashes, or an old API against projected JSON/galleries.
After ingestion resumes, prefer a forward fix or lossless export/decompression;
restoring the earlier dump alone would discard later observations.

Keep the recovery dump, hero archive and preservation evidence until the release
has been accepted. Do not remove another project's containers, volumes or backups.
