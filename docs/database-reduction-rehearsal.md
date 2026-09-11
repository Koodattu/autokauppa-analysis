# Lossless database storage migration

Local rehearsal started 2026-09-11. Production remains unchanged by this work.
The restore, lossless migration, physical reclamation, post-rewrite full-data
verification and final API comparison are complete.
The restored baseline occupies 16,561,903,295 bytes and contains 2,160,024 raw
records. The live source allocated about 17.18 GB; the restore's incidental bloat
reduction is separate from the storage-migration saving.

The measured database size after reclamation is **8,040,216,255 bytes**:
**8,521,687,040 bytes saved (51.45%)** versus the restored baseline. This includes
the added standalone v2 details. The single-table raw rewrite took 13.1 seconds
on this local copy; production timing depends on its hardware and load.

| Representation | Final allocated bytes |
| --- | ---: |
| Raw-record metadata and indexes | 1,046,495,232 |
| Exact raw JSON/HTML bundles | 1,359,716,352 |
| Full legacy image metadata bundles | 494,829,568 |
| Standalone details, including recovered v2 | 1,288,675,328 |

Offline v2 normalization completed on the copy: 280,200 rows inserted, zero
exceptions or skipped rows, 373 seconds. `listing_details` then occupied
1,288,675,328 bytes. This added structured-data cost is included in the final
net saving, not hidden behind the gross table-removal figure.

Image migration completed: 8,413,976 rows packed in 901 seconds and compared
against the original table in 219 seconds, with zero mismatches. The new table
occupies 494,829,568 bytes versus 3,165,224,960 bytes for the legacy table.
All 232 API samples passed before contract; 51 had only the permitted v2
provenance-label enrichment. The old image table was then removed on the copy.
Its database size became 14,817,597,119 bytes, including the added v2 detail data.

Raw migration completed for all 2,160,024 records, with zero skips or errors.
The payload bundles occupy 1,359,716,352 bytes. Before the physical rewrite,
`raw_listing_records` still occupies 9,368,248,320 bytes and the database occupies
16,361,969,343 bytes. The container segment migrated the remaining 1,652,774
records in 1,567 seconds; that excludes the first 507,250 records migrated on
Windows and is not the duration of the full operation.

The pre-reclamation whole-dataset audit passed: all unchanged table fingerprints,
all 105,400 original detail rows, zero uncovered eligible v2 details, and the
original checksum of all 2,160,024 raw records. No inline raw evidence remains.
The exact raw SHA-256 is
`1c1bb64f1ea2a59cf8bd9ac677c35bdb61f5ee273635edf9546b765c7934a95d`.
The private `preservation-before-reclaim.json` retains this checkpoint independently
of the final verification artifact.
The pinned Bun 1.3.14 verifier also passed all 8,641 bundles and 2,160,024 record
references, covering 31,301,246,106 decoded bytes. Local free space was 18.6 GiB
immediately before the rewrite; no idle-in-transaction sessions were present.
The whole-dataset audit passed again after the rewrite, including the exact raw
checksum, unchanged relational tables and original detail rows.
All 232 API samples also passed after both legacy-image removal and the raw-table
rewrite. Exactly 51 responses had the permitted v2 provenance-label enrichment;
all remaining response fields, including prices, history and image metadata,
matched their immutable baseline checksums.

Keep bulk operations and the expensive full API audit sequential. Running the
API price-context scans alongside raw compression caused disk contention during
this rehearsal; the read-only audit was stopped and will be repeated after the
bulk work. The raw batches remained transactionally safe and resumed normally.
The raw migration resumed inside the built worker image at 507,250 committed
records. That image uses the pinned Linux Bun 1.3.14 runtime; the Windows host
has Bun 1.3.9. The local PostgreSQL memory limit was raised from 4 to 12 GiB
to reduce random disk reads. Local timings are not production timing guarantees.

## Implemented representation

- Keep every raw observation ID, timestamp, parser version, original source hash,
  fetch/run relationship, snapshot, sighting and listing relationship.
- `raw_listing_payloads` stores Brotli bundles with a codec version, SHA-256 of the
  decoded bytes, decoded length and record count. Each raw record points to a
  digest and an array index. Original JSON stays **text inside the bundle**, so
  PostgreSQL numeric literals cannot be rounded through JavaScript. HTML remains
  exact text. Migrating a batch decodes the stored bytes and compares them with
  the source before clearing the inline columns, within the same transaction.
- New search pages share a bundle across their cards. New details use a bundle
  per observation. Repeated structures can compress together instead of PostgreSQL
  compressing each JSON/HTML value independently.
- `listing_legacy_image_bundles` preserves complete old image rows per listing:
  exact URLs, variants, dimensions, ordering, timestamps, row IDs, raw-record IDs
  and source cohort metadata. Unknown URLs and rows without a raw reference are
  preserved too. The API continues its existing selection rules. An empty listing
  needs no bundle; a completed **whole-table census** is the proof of coverage.
- Existing compact image assets and hero-image files remain unchanged. The
  migration does not pretend that a thumbnail, one hero, and a full gallery are
  equivalent, and does not fetch remote images.
- Offline v2 normalization fills only missing standalone details and retains v2
  source provenance. Existing v4 details are never overwritten. Unconvertible
  legacy rows are recorded as exceptions and block successful completion.

The public provenance label intentionally changes from search-only to search-and-
detail data where a missing v2 detail row is materialized. The original API
checksums remain immutable: verification permits only that exact label transition,
only for a new v2 detail ID absent from the original detail census, and requires
the entire response checksum to match after reverting that one label in memory.
All prices, history and image metadata must still match exactly.

The new additive migration is `packages/db/drizzle/0015_lossless_storage.sql`.
It does not enqueue jobs, delete source rows or drop the old image table.

## Recovery copy and local commands

The dedicated PostgreSQL 18.4 container is `nettiauto-storage-audit-20260911`,
bound only to `127.0.0.1:55433`, with the dedicated volume
`nettiauto-storage-audit-20260911-data`. The database is `nettiauto_audit_test`.
Integration tests use a **different** database, `nettiauto_storage_fixture_test`.
Do not point test commands at the production clone.

Private artifacts are ignored by Git under `backups/reduction-20260911/`.
Credentials are read into process memory from the local container; they are not
printed, committed or written to a connection file.

The copy script streams a read-only `pg_dump --format=custom --compress=1` from
`vaarattu-server` directly to a local archive, then streams that archive into
`docker exec -i ... pg_restore`. It creates no dump file on the production VM.
Keeping the archive, rather than a single unrecoverable pipe, allows restore retries
and supplies a separate rollback source. Both the dump and hero tar have SHA-256
sidecars; retries verify them before restoring.

```powershell
python scripts/clone-storage-audit.py --container nettiauto-storage-audit-20260911 --directory reduction-20260911
python scripts/run-storage-audit.py -- bun scripts/storage-audit.ts baseline
python scripts/run-storage-audit.py -- bun scripts/storage-audit.ts migrate
python scripts/run-storage-audit.py -- bun scripts/storage-audit.ts api-baseline
python scripts/run-storage-audit.py -- bun scripts/storage-audit.ts v2
python scripts/run-storage-audit.py -- bun scripts/storage-audit.ts images
python scripts/run-storage-audit.py -- bun scripts/storage-audit.ts verify-images
python scripts/run-storage-audit.py -- bun scripts/storage-audit.ts api-verify
python scripts/run-storage-audit.py -- bun scripts/storage-audit.ts reclaim-images
python scripts/run-storage-audit.py -- bun scripts/storage-audit.ts api-verify
python scripts/run-storage-audit.py -- bun scripts/storage-audit.ts raw
python scripts/run-storage-audit.py -- bun scripts/storage-audit.ts verify
python scripts/run-storage-audit.py -- bun scripts/storage-audit.ts reclaim-raw
python scripts/run-storage-audit.py -- bun scripts/storage-audit.ts verify
python scripts/run-storage-audit.py -- bun scripts/storage-audit.ts api-verify
```

For the actual deployment runtime, build a labeled local worker image and run
the bulk operation inside Docker. The helper uses the isolated PostgreSQL
container's network namespace and passes credentials through process environment.
It starts only the explicit maintenance command, with no crawler or scheduler.

```powershell
docker build --label dev.koodattu.nettiauto-storage-audit=true -f apps/worker/Dockerfile -t nettiauto-storage-audit-worker:20260911 .
python scripts/run-storage-audit.py --worker-image nettiauto-storage-audit-worker:20260911 -- bun dist/storage-maintenance.js raw
python scripts/run-storage-audit.py --worker-image nettiauto-storage-audit-worker:20260911 -- bun dist/storage-maintenance.js verify-raw
```

The worker helper records each invocation's duration separately. A resumed run's
duration excludes earlier attempts; a completed host `raw` invocation only saves
the final checkpoint and sizes, and is not a full-migration timing measurement.

The baseline refuses overwrite. Re-running a migration batch resumes its durable
cursor. A terminal partial stage requires investigation of its exception ledger;
do not reset counters and call the problem solved. SQL/codec failures roll back the
batch and stop the local runner; worker execution has a five-attempt continuation
limit. Reducing a batch size is possible through the exported batch functions.

The restore initially hit an initialization readiness race (fixed by checking TCP)
and then Docker disk exhaustion. Unused local build cache was reclaimed; no other
database volume or container was removed. The failed disposable audit database was
recreated and the same checksummed archive restored successfully.

Recovery artifacts verified at restore:

- Production archive: 4,762,439,641 bytes, SHA-256
  `ed2250a3e1d71fdbb931160a7e2e6407e9c28fe07800c120d289f3d18c6c06e9`.
- Hero archive: 411,772,416 bytes, SHA-256
  `d21c32f30e920cd81d62df630b65fdda4e7a840fe161b7377ad70454e4902d09`.
- All 5,763 database hero references resolve to 5,720 archived files, with no
  missing objects. Shared references explain the difference. Individual file hashes
  are in the private `hero-manifest.json`.

## Production sequence after reviewing the measured rehearsal

Production execution was authorized after the completed local rehearsal. The
audit CLI also supports production **read-only** checks when
`STORAGE_AUDIT_PRODUCTION_READ_ONLY=nettiauto_analytics` is explicitly supplied.
It requires that exact database name, rejects all migration/reclamation actions,
sets PostgreSQL's `default_transaction_read_only=on` on every connection, and
verifies the setting before proceeding. Mount `scripts/` at `/app/scripts` and
a private artifact directory at `/audit` in the compatible worker image, with
`STORAGE_AUDIT_DIRECTORY=/audit`. Run `baseline`, `api-baseline`, `verify`, and
`api-verify` sequentially, retaining the baseline across container replacements.

Prepare a reviewed release containing migration 0015, the compatible domain
readers/writers and the worker maintenance entry point. Follow the repository's
serial Compose build procedure for `migrate`, `api` and `worker`; build before
the ingestion pause where headroom allows. The existing migration image copies
the Drizzle journal and SQL files, and the application services must start only
after that migration succeeds. Commit/push and production execution remain
separate from this local rehearsal. The 13-second rewrite is only one step;
budget the ingestion pause for the backfills and full verification as well.

1. Confirm production code/database versions, current disk headroom, no active
   crawl/backfill jobs, and a fresh recoverable backup. Recheck the deployed direct
   readers of `source_payload`, HTML and `listing_images`, including external scripts.
   The local rehearsal copy is not a replacement for later production writes.
2. Use a controlled ingestion pause and drain old workers. Apply migration 0015,
   then deploy the compatible API and worker together. The migration uses a five
   second lock timeout; it may still hold table locks during its scans. Budget a
   maintenance window from measured timings. Do not roll back to an old reader
   after packed writes have begun.
3. Run `backfill_nettiauto_v2_details` and resolve every exception. Run
   `backfill_nettiauto_legacy_image_bundles`. The new jobs share the
   `nettiauto-storage-migration` queue; each batch and continuation are committed
   together. Do not run the older, lossy image-asset conversion as this migration.
4. Run `verifyLegacyImages(sql)` from the deployed domain package. It compares
   **every stored image row** and total census under a legacy-table write lock.
   Only then does it set `legacy_images` completed and switch the reader. A database
   trigger rejects late legacy writes after the switch, including writers that
   were blocked during verification. Check representative public responses.
5. With the compatible reader confirmed and rollback artifacts available, execute
   `scripts/contract-legacy-images.sql`. It takes a short lock, requires successful
   verification, rechecks the row census, and drops the legacy table without CASCADE.
   This is a separate operator contract, deliberately absent from automatic Drizzle
   migrations. Remove the obsolete schema declaration in the subsequent schema
   cleanup release; do not run schema generation against the contracted database
   before doing so.
6. Run `backfill_nettiauto_raw_evidence`. Each batch compares decoded stored bytes
   before clearing source columns. At the cursor end it locks writes, checks for
   missed lower UUIDs, and rescans if needed. Completion activates a trigger that
   rejects old inline writes. Keep IDs and all referring rows. Verify every bundle,
   record index and source checksum/census; require zero inline rows and zero gaps.
7. Recheck free space, WAL growth, running transactions and backup recoverability.
   Reclaim **only** `raw_listing_records` with a scheduled `VACUUM (FULL, ANALYZE)`
   after the storage verification passes. It requires an exclusive lock and space
   for the replacement table/indexes; ordinary VACUUM is not a guaranteed filesystem
   reclamation. Do not run database-wide FULL vacuum or rewrite with insufficient
   headroom. Check API behavior and dataset fingerprints again afterward.
8. Resume ingestion, verify packed new writes and API errors, and monitor growth.
   Keep the recovery archive until the retention decision is explicit. Bundles with
   no referencing raw records can arise after replay/upsert; measure those separately
   before designing bounded orphan collection. No automatic evidence deletion is
   included here.

The production pause, deployment and destructive contract must be explicitly
authorized at the execution step. No production job or configuration has been
changed during this rehearsal.

After those gates, the deployed worker contains the explicit operator commands
below. These run bounded batches in a foreground process and can be resumed;
they do not start the crawler. Use either these commands or the queued tasks,
not both at once. Pause ingestion and drain old workers first.

```sh
docker exec nettiauto-analytics-worker-1 bun dist/storage-maintenance.js v2
docker exec nettiauto-analytics-worker-1 bun dist/storage-maintenance.js images
docker exec nettiauto-analytics-worker-1 bun dist/storage-maintenance.js verify-images
# Check the compatible API, then run from the reviewed release checkout:
docker exec -i nettiauto-analytics-postgres-1 psql -X -v ON_ERROR_STOP=1 -U nettiauto -d nettiauto_analytics < scripts/contract-legacy-images.sql
docker exec nettiauto-analytics-worker-1 bun dist/storage-maintenance.js raw
docker exec nettiauto-analytics-worker-1 bun dist/storage-maintenance.js verify-raw
# Only after checking measured rewrite headroom and the maintenance window:
docker exec -e 'PGOPTIONS=-c lock_timeout=5s' nettiauto-analytics-postgres-1 psql -X -v ON_ERROR_STOP=1 -U nettiauto -d nettiauto_analytics -c 'VACUUM (FULL, ANALYZE) raw_listing_records;'
docker exec nettiauto-analytics-worker-1 bun dist/storage-maintenance.js verify-raw
```

`verify-raw` checks every reference/index and every stored bundle's checksum,
decoded length and record count in one read-only repeatable-read snapshot. It
also checks unreferenced bundles; corruption is not silently ignored. Verification
fetches are bounded by decoded size, with at most one oversized-but-valid bundle
processed alone.

## Verification so far

- Package and worker type checks passed; the audit CLI also passed an explicit
  strict TypeScript check.
- Worker and API builds passed. The API build needed execution outside the Windows
  sandbox because the sandbox could not read the existing `pino` dependency.
- The rehearsal initially exposed a pre-existing date-sensitive product integration
  failure: fixed August 3 fixtures fell outside the last 30 days. Release preparation
  now dates those three observations to yesterday and retains all assertions,
  including the exact latest timestamp. The complete release suite passes:
  **180 tests in 31 files**. No assertion was weakened or skipped.
- Compression tests cover exact Unicode/HTML/large numeric literals and corruption.
- Real PostgreSQL tests cover resumability, transactional rollback, nonempty image
  responses with dimensions/fallbacks after hiding the old relation, cutover write
  guards, changed legacy rows blocking verification, packed v2 input, preserved v4
  details, exception accounting and v2 rollback.
- The five-test worker migration group also passed after adding an injected
  Graphile continuation failure: the detail insert, run accounting and checkpoint
  all roll back, and a retry successfully stores a JSON-object continuation.
  The obsolete image conversion also exits after cutover when the old table is
  absent. The intentional v2 provenance-label transition has a separate passing test.
- The production worker image built successfully with Bun 1.3.14 and round-tripped
  a real migrated raw record in that container runtime.
- The existing `audit-storage-v4.sql` now handles the contracted image table;
  both its pre-contract and post-contract branches passed on the fixture database.

## Recovery boundary

Before changing production, capture the backup after draining writers. If any
application writes are allowed afterward (including saved views or control jobs),
do not replace the whole database with that older backup. Restore it into a separate
database and recover only the affected representation, retaining newer writes.
The compressed image rows contain everything required to rebuild the old table;
`decodeLegacyImageBundle` exposes the original IDs and values. `readRawEvidence`
returns the exact original JSON text and HTML for rehydrating inline columns.
Reader rollback must follow reconstruction and verification, not precede it.

Keep the compatible code running when a batch fails. Its transaction rolls back,
and the reader supports both inline and packed raw evidence. Before image cutover
the reader uses the old table; afterward the verified bundles remain the source.
Do not reset a migration's status merely to make a failing verification disappear.

## Scope and limitations

This release trades direct SQL access to raw JSON/HTML for explicit decompression;
reprocessing callers use `readRawEvidence`. Normal analytics continue to query the
unchanged relational observations. It preserves all raw evidence rather than choosing
a retention policy. Bundles have a 64 MiB decoded safety limit; oversized or corrupt
evidence stops migration for investigation instead of being silently discarded.

The generated Next.js image cache is separate from these database representations.
Its limit needs a separate deployment decision, particularly for cached images whose
remote originals have disappeared. Persistent hero objects are preserved here.

References: [PostgreSQL VACUUM](https://www.postgresql.org/docs/18/sql-vacuum.html),
[Next.js disk cache behavior](https://nextjs.org/docs/app/api-reference/components/image#maximumdiskcachesize).
