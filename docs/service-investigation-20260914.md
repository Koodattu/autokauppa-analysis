# September 14: image cache and query I/O investigation

This records the initial read-only investigation on September 14, 2026, including
the first proposed fixes. The user subsequently authorized direct CDN delivery,
small persistent fallback heroes, production deployment, and removal of the old
image cache. The resulting design supersedes the preliminary cache-limit and
export proposal below; see [image delivery](image-delivery.md).

## What the frontend cache contains

Next.js stores actual image files in the web container's writable filesystem at
`/app/apps/web/.next/cache/images`. The cache key includes the source URL, requested
width, quality, and negotiated output format. A cached file is therefore an image
variant, not necessarily a distinct source photograph or listing.

The gallery uses Next.js image optimization for remote photos. Locally archived
heroes bypass this optimizer and remain in the separate persistent hero volume.
The latter occupied approximately 401 MiB and was not changed.

Two complete live filesystem passes measured the following. Counts drifted while
the running service added images; they are not a transactionally frozen snapshot.

| File census | Measurement |
| --- | ---: |
| Image files in size/format pass | 273,748 |
| Format detected from headers | All JPEG |
| Total image payload bytes | 5,893,158,992 (5.49 GiB) |
| Allocated file blocks, excluding directories | 6,458,388,480 bytes (6.02 GiB) |
| Mean file size | 21,528 bytes |
| Median file size | 9,189 bytes |
| 95th percentile | 124,505 bytes |
| 99th percentile | 194,163 bytes |
| Smallest / largest | 523 / 525,071 bytes |
| Header/stat read failures | 0 |

The directory occupied approximately **7.1 GiB** including filesystem allocation
and hundreds of thousands of cache directories. A separate `fetch-cache`
directory occupied approximately **410 MiB**; those are frontend data-cache
entries, not photographs.

The JPEG resolution pass read 274,067 files with zero unknown dimensions or read
failures:

| Resolution | Files | Combined payload bytes |
| --- | ---: | ---: |
| 289 x 217 | 245,957 | 2,201,280,725 |
| 1440 x 1080 | 12,689 | 1,760,964,395 |
| 1620 x 1080 | 10,925 | 1,350,597,459 |
| 1500 x 1000 | 1,163 | 170,817,942 |
| 1621 x 1080 | 672 | 80,213,932 |
| 810 x 1080 | 456 | 54,895,948 |

Other dimensions include landscape and portrait variants. Approximately 90% of
the files are 289 x 217 thumbnails. Image headers, rather than URL suffixes, were
used to establish the format and resolution. A bounded 1,000-entry cache-filename
sample found no original-byte optimization fallbacks: output and upstream ETags
differed for all sampled entries. A synthetic in-memory test confirmed the live
Sharp optimizer can resize a 289 x 217 JPEG to 128 x 96.

The installed Next.js 16.3.0 implementation defaults the image cache's byte budget
to half the available filesystem space when the cache initializes. Expiration
controls freshness, not a guarantee that expired files disappear immediately.
This is documented in the [Next.js Image reference](https://nextjs.org/docs/app/api-reference/components/image#maximumdiskcachesize)
and confirmed in the installed `disk-lru-cache.external.js` implementation.

The proposed explicit budget is **1 GiB of cached image payloads**. Filesystem
blocks/directories and the separate fetch cache are additional to that budget.
The existing cache must be preserved before deploying a container replacement
or eviction: some cached images may no longer exist at their remote source.

## Upstream image failures and gallery changes

The 48-hour web-log inspection found approximately 42,000 upstream image 404s
covering approximately as many distinct URLs, all on `images.nettiauto.com`.
Recent failures included both `-large.jpg` and `-289x217.webp` variants. Three
sampled failing URLs also returned 404 when checked directly against the source.
This confirms failures for those samples; it does not establish the availability
of every source image or the cause of every historical 404.

The existing gallery already tries recorded alternate URLs and removes a picture
after its allowed variants fail. Failure state lasts for that mounted gallery;
the vast number of distinct failed URLs means a short negative cache alone would
not resolve the observed failure volume.

Prepared gallery changes:

- Prefer an observed 289 x 217 thumbnail URL for the thumbnail strip, using it
  directly. Keep archived heroes first. Do not manufacture source URLs.
- Retain the full-size photo when only its thumbnail fails, and retain the
  existing alternate-image fallback sequence.
- Request the enlarged dialog image only while the dialog is open.
- Show `Images unavailable` after recorded images fail, reserving `No images
  observed` for listings that never had image metadata.

These changes reduce unnecessary optimization requests and improve failure
handling. They cannot restore photographs removed by the source provider.

## Temporary-file I/O and the confirmed query defect

PostgreSQL writes intermediate results to temporary files when an operation such
as a sort, hash join, or materialized query exceeds its memory allowance. Those
files are read again and normally removed after the operation. The cumulative
temporary-byte counter records I/O over time, not current allocated storage.

The initial 74-second sample recorded 10.6 GB of new temporary files despite the
application database remaining exactly 8,638,830,271 bytes. The application used
4 MiB `work_mem`. No PostgreSQL memory settings were changed.

Read-only `EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, FORMAT JSON)` identified a
specific defect in each listing's comparable-price query. Its twice-referenced
`latest_snapshots` CTE was materialized. Because it selected `snapshot.*`, the
plan scanned 748,216 snapshots and materialized 481,876 current snapshots,
including large fields unused by the comparison.

| Same sampled comparison query | Existing | Prepared change |
| --- | ---: | ---: |
| Execution time | 2,994 ms | 11.9 ms |
| Temporary blocks written | 115,249 | 0 |
| Temporary blocks read | 115,249 | 0 |

Each PostgreSQL block is 8 KiB: the baseline wrote approximately 944 MB and read
the same amount for one comparison. The prepared change uses `NOT MATERIALIZED`
for this CTE so the planner can apply restrictions and omit unnecessary columns.
It requires no data migration, index creation, or database configuration change.

Six further read-only comparisons covering active and sold listings returned
identical complete comparable-price query results. Under varying shared-VM load,
baseline queries took 3,425-11,182 ms and the changed queries took 69-249 ms.
These are query measurements, not a claim of deployed HTTP latency improvement.

Time-series profiling also confirmed temporary I/O. A filtered Toyota/Corolla
baseline took 3,902 ms and wrote 41,531 temporary blocks. Removing materialization
from both intermediate CTEs took 2,351 ms and wrote 21,078 blocks, but broader
queries remained slow: the all-data baseline reached the 20-second diagnostic
timeout, and alternatives took 18.2-19.8 seconds. These inconsistent improvements
do not justify deploying that speculative rewrite. The time-series query remains
unchanged and needs further work preserving historical as-of snapshot semantics.

Profiles used read-only sessions, bounded statement timeouts, and disabled
parallel query workers. Shared-VM load and filesystem census work affected wall
times. No application sessions were cancelled.

## Validation and release boundary

- All **184 tests in 31 files passed**, including PostgreSQL integration tests
  against a dedicated local synthetic fixture database.
- Web and API production builds passed.
- Package, API, and web type checks passed; web lint and diff whitespace checks
  passed.
- Six production before/after query comparisons passed without exporting their
  results or changing production data.
- The first test run passed 179 tests but rejected the fixture database's name.
  A database with the test suite's required disposable name was created, migrated,
  and the full suite rerun successfully. No test guard was weakened.

Automatic approval review rejected the proposed local archive of production
image and fetch caches because the current request was interpreted as
investigation rather than authorization for that export. No archive was created.
The proposed follow-up is narrower: preserve **only the generated image cache**
locally, verify the archive, then deploy the verified query/gallery/cache changes.
The fetch cache does not need to be exported. Existing database backups, persistent
hero files, other applications, and their containers/volumes must remain intact.

Do not push before the release is ready: the server's automatic deployment can
replace the web container and discard its writable cache. Follow the existing
deployment-lock procedure when releasing. Afterward verify API readiness, gallery
fallbacks, effective cache configuration, disk headroom, query temporary-byte rate,
and observed HTTP latency under normal traffic.
