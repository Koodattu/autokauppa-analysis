# Response caching

The server-only web API client defaults to `cache: "no-store"`. Listing detail pages,
listing searches, filtered metadata and analysis requests use this default.
Browsing additional listings or filter combinations must not create Next.js
fetch-cache entries on disk.

The homepage explicitly caches only three fixed public API responses: dataset
overview, current-market research and unfiltered metadata. They revalidate after
five minutes. The number of cache keys therefore does not grow with the number
of listings or searches. Revalidation is a freshness policy, not a deletion TTL.

The API's existing entry-limited, in-memory caches remain available for shared
analytics and metadata queries. Listing details are queried directly; their
comparable-price query avoids materializing the full latest-snapshot dataset.
Research and time-series queries reduce intermediate rows and temporary writes
as described in [the query rollout](query-and-rate-limit-rollout-20260917.md).
Broad aggregations still require temporary I/O; disk caches are not enlarged.
Filtered time series now chooses indexed lookups based on candidate count;
[query deadlines](broad-query-deadlines-20260921.md) bound API database statements
and uncached frontend fetches without changing worker connection defaults.

Uncached server requests forward Caddy's visitor address so the API rate limiter
does not pool all SSR visitors into one bucket. Cached homepage requests exclude
visitor headers, preserving the three shared keys.

Deploy by replacing only the web container. Its old generated fetch cache is
discarded with its writable layer. PostgreSQL, archived hero images and backups
are persistent and must be preserved. Verify that the new fetch cache contains
only the three homepage responses after exercising multiple listing and search
pages. Image optimization remains disabled as documented in image-delivery.md.
