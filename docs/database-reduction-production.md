# Production lossless storage migration

The production rollout ran September 11–12, 2026 on `vaarattu-server`, after
the [local rehearsal](database-reduction-rehearsal.md). The user authorized
commit, push, deployment, the ingestion pause, verified storage contraction,
and physical reclamation.

After reclamation and final checks, the production database occupies **8,638,830,271
bytes**, down from **17,182,217,919 bytes**: **8,543,387,648 bytes saved (49.72%)**.
The VM reported about **20 GiB free**, at 73% filesystem utilization. Filesystem
free space also reflects other services; the database measurement isolates this
migration's net saving, including the added v2 details.

| Final representation | Allocated bytes |
| --- | ---: |
| Raw-record metadata and indexes | 1,046,708,224 |
| Exact raw JSON/HTML bundles | 1,359,708,160 |
| Full legacy image metadata bundles | 494,821,376 |
| Standalone details, including recovered v2 | 1,289,912,320 |

## Release and recovery evidence

The initial application images were built from `489302bac757b3c7390685cb0f0d24b283550cf8`
with Bun 1.3.14. Commits `29aaf1f` and `6fb9d1d` subsequently corrected the
standalone audit's module loading and limited its query parallelism; the latter
also increased PostgreSQL shared memory to 256 MiB. These changes did not alter
the application code. A later automatic rebuild used the `6fb9d1d` checkout;
its compiled API and worker code was compared with the retained release, as
described below. GitHub Actions passed at `6fb9d1d`, including all
180 tests, type checks, lint, and builds.

The normal worker was stopped before capturing a fresh consistent custom-format
database dump directly to the operator's machine. No dump archive was written to
the VM. Private artifacts are retained under
`backups/production-reduction-20260911/` locally and
`/srv/projects/nettiauto-analytics/backups/storage-rollout-20260911/` on the VM.
Neither directory is committed or included in Docker build contexts.

| Recovery artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `production.dump` | 4,762,439,643 | `b281167256c1b43df3714520f74e421085c2f99b789f56013188e9a9528d9629` |
| `heroes.tar` | 411,772,416 | `1618d242345ff8b70b34c148ab59d71809353f79a3cc025ecd01613d4de1328a` |

The fresh dump passed full `pg_restore --file=/dev/null` decoding. The earlier
production clone had already passed a complete restore and migration rehearsal;
the fresh archive was not restored into a second full local database. All 5,763
hero references resolved to 5,720 preserved files, with zero missing objects.

The live baseline allocated **17,182,217,919 bytes** and contained 2,160,024 raw
records. Its exact raw-evidence fingerprint was
`1c1bb64f1ea2a59cf8bd9ac677c35bdb61f5ee273635edf9546b765c7934a95d`,
matching the local rehearsal. Baseline fingerprints also cover listings,
snapshots, sightings, events, source fetches, compact image assets, hero references,
raw provenance, and every original standalone detail row.

## Operational corrections

The first API comparison stopped when PostgreSQL exhausted its original 64 MiB
`/dev/shm`. Root disk exhaustion was not the cause of that failure. The API was
stopped gracefully, and only the dedicated PostgreSQL container was recreated
with 256 MiB shared memory. Its pinned PostgreSQL 18.4 image and named volume
`nettiauto-analytics_postgres_data` were preserved and verified. The API then
returned to readiness. Read-only production audits disable parallel query workers.

The full API baseline succeeded after this correction. One earlier baseline
wrapper exited after its script was edited during execution; the completed
baseline artifact was independently checked before reuse. Subsequent operations
use the immutable `operator-29aaf1f.sh` snapshot.

The initial manual rollout did not hold the server's existing automatic-deployment
lock. After physical reclamation supplied headroom, `koodattu-auto-deploy` rebuilt
the `6fb9d1d` checkout and restarted the API, worker, and web at about **00:45
Helsinki time on September 12**. It had previously skipped deployment because of
disk pressure. The final API audit's worker-pause guard detected the restart and
stopped before querying.

The worker was paused again and the existing
`/run/lock/koodattu-auto-deploy.lock` was acquired for the remaining checks.
The automatic-deployment state and journal identified the checkout. Docker file
copies confirmed that the compiled API bundle and all worker runtime/source files
matched the locally retained `489302b` release after normalizing line endings.
Only `tsconfig.tsbuildinfo`, the non-executed incremental compiler cache, differed.
The rebuilt images inherit the Bun base image's revision label; that label is not
the application revision. Automatic pruning removed unused release images on the
VM, so the locally retained images and verified data archives remain the recovery
source. The runbook now requires the deployment lock before starting maintenance.

The final HTTPS check also exposed a pre-existing hero-serving gap: the shared
production Caddy configuration lacked the hero route and volume mount already
defined in this application's own Caddyfile. The preserved file existed, but its
public URL returned 404. Deployment commit **`cffc349`** adds only that route and
mounts the existing `nettiauto-analytics_hero_images` volume read-only. Both staged
and live Compose/Caddy validation passed. The shared proxy was recreated with its
original TLS/configuration volumes preserved, and the public file then matched
its recorded content checksum.

## Verified preservation stages

Offline v2 normalization inserted **280,200** standalone detail rows, with zero
skips or errors. Exact baseline comparison verified all original **105,400** detail
rows unchanged. This operation uses stored evidence and makes no requests to Nettiauto.

All **8,413,976** legacy image rows were packed and then compared against their
original rows, with zero mismatches. The verified reader now uses these bundles.
They preserve the full legacy metadata, including original URLs and values that
the compact image-asset representation could not encode.

All **232** listing/history/image API comparisons passed before the image table
was removed. Exactly 51 responses contained the permitted provenance-label
enrichment from recovered v2 details; every other compared field was unchanged.
The guarded contraction checked the full census again and dropped the redundant
table without `CASCADE`.

Raw conversion completed for **2,160,024** records, with zero skips or errors.
Every batch decoded its stored payload and compared it with the original before
clearing inline columns. Independent verification then checked all **8,641**
bundles, totaling **31,301,246,106 decoded bytes**, including their checksums,
lengths, record counts, and all record references.

Full preservation verification passed before reclamation: all audited table
fingerprints and original details matched, the exact raw SHA-256 matched the
baseline, zero inline raw records remained, and no eligible v2 listing lacked
standalone details. All three migration stages were completed with zero errors.

The API was stopped for the single-table `VACUUM (FULL, ANALYZE)` of
`raw_listing_records`. The procedure required the saved preservation proof,
recovery evidence, at least 4 GiB free, stopped ingestion, and no remaining active
database transactions. It included an API restoration trap. The rewrite completed
in **27 seconds**, and the restarted API returned to healthy status. Immediately
afterward, the raw table's allocation fell from 9,343,664,128 to 1,046,495,232 bytes.

The complete preservation verification was repeated after the physical rewrite
and passed again, including the exact original raw SHA-256 and every original
detail row. The normal worker was then confirmed paused for the final API audit
under the deployment lock.

## Final service verification

- The final API comparison passed all **232** responses, again with exactly 51
  permitted provenance-label enrichments and no other compared-field changes.
- A production write canary stored and read exact packed JSON/HTML, including a
  numeric literal beyond JavaScript's exact integer range. It rolled back, and
  subsequent checks found zero canary records or bundles.
- Public HTTPS readiness and listing requests returned 200. The sampled listing
  returned 32 image entries and two history entries. A separate hero-file check
  returned 200 and matched the recorded SHA-256 for all 44,824 bytes.
- The normal worker resumed with its existing `CRAWLER_ENABLED=true` and
  `CRAWLER_PAUSED=false` settings. API, worker, web, PostgreSQL, and shared Caddy
  health checks passed.
- The final census matched every preserved population: 481,876 listings, 748,216
  snapshots, 1,661,475 sightings, 50,222 events, 593,435 source fetches, 1,785,374
  compact image assets, 5,763 hero references, and 2,160,024 raw records. Standalone
  details total 385,600 after v2 normalization.
- All three migration stages are completed with zero skips/errors, no migration
  exceptions or inline raw records remain, and `listing_images` is absent.
- There were zero active or pending queue jobs. The six previously terminal jobs
  remain historical entries; this rollout did not retry or delete them.
- Final logs contained zero errors or disk-full matches in the running
  API from 21:45:07 to 22:24:28 UTC on September 11, and in the resumed worker from
  22:23:07 to 22:24:28 UTC. These are the observed windows, not a long-term guarantee.

## Recovery boundary

Keep the backup and compatible application images. After compressed writes begin,
an old reader cannot safely be restored by merely changing image tags. Rehydrate
the affected representation and verify it before rolling readers back. If newer
application writes exist, restore the backup into a separate database and recover
only the affected data; do not overwrite newer production writes with the earlier
whole-database backup.
