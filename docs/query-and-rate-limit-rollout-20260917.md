# Query and rate-limit improvements, September 17, 2026

Server-rendered requests previously reached the API without a visitor address,
sharing its 120-request-per-minute `unknown` bucket. The server API client now
forwards Caddy's `X-Forwarded-For` header on uncached requests. Client components
continue using the client-safe parsers in `api.ts`. The three shared homepage
responses never read visitor headers, so their cache keys remain fixed.

Caddy is the public ingress and replaces untrusted incoming forwarded headers.
The API has no published host port. Keep those boundaries when changing the
deployment; forwarding browser-supplied identity directly would permit bypassing
the rate limiter. The rate limit and authentication behavior are unchanged.
Listing pages show a retry message when their visitor reaches the limit, instead
of throwing the expected 429 response into the application error boundary.

Research queries materialize only the fields used by their aggregates and
evidence rows. They no longer copy normalized listing JSON into temporary results
or join listings twice. Detail coverage uses an indexed existence probe that can
stop at the first enriched snapshot. Historical filtered research first selects
candidate listing IDs, then resolves the actual snapshot before applying filters.

Time-series queries allow PostgreSQL to inline their intermediate results.
Make/model searches narrow candidate listing IDs and use the existing historical
snapshot index. Broader searches retain the bulk snapshot-period join. Filters
are applied after resolving each sighting's snapshot: an older matching version
must never replace a newer nonmatching version.

Read-only production comparisons use all/current markets, Volkswagen Golf
2019–2024 current listings, and Volvo V70 sold listings over August 1–September 10.
All eight complete result sets match the original queries in repeatable-read
transactions. The regression suite also covers changing historical mileage.

Representative EXPLAIN ANALYZE measurements use unchanged 4 MiB work memory and
parallel workers disabled for consistent comparisons. Values are single runs
under live load, not latency guarantees. Temporary bytes are written plan blocks
multiplied by 8192, not persistent database growth.

| Query | Before | After | Temporary writes before → after |
| --- | ---: | ---: | ---: |
| Research, all | 14.14 s | 7.08 s | 1.72 GB → 346 MB |
| Research, current | 2.35 s | 1.36 s | 154 MB → 20 MB |
| Research, filtered historical | 7.63 s | 0.27 s | 27 MB → 0 |
| Time series, all | 10.20 s | 9.04 s | 1.07 GB → 824 MB |
| Time series, current | 7.84 s | 6.22 s | 508 MB → 298 MB |
| Time series, Golf current | 3.33 s | 0.15 s | 366 MB → 0 |
| Time series, V70 historical | 3.25 s | 0.29 s | 404 MB → 0 |

Broad uncached historical aggregations still write temporary files. This release
reduces that work without increasing disk caches or global PostgreSQL memory.
Measure subsequent traffic before deciding whether more aggregate optimization
is needed; a quiet post-deploy interval cannot establish a daily I/O reduction.

Deploy only API and web. No database migration or worker restart is required.
Verify API/web health, independent SSR rate-limit buckets, representative public
pages, continued worker progress, and the three-entry homepage fetch cache.
Preserve PostgreSQL volumes, archived heroes, backups and unrelated services.
