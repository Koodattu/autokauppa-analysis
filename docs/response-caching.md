# Response caching

The web API client defaults to `cache: "no-store"`. Listing detail pages,
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
The remaining expensive research and time-series queries require separate query
optimization, not larger disk caches.

Deploy by replacing only the web container. Its old generated fetch cache is
discarded with its writable layer. PostgreSQL, archived hero images and backups
are persistent and must be preserved. Verify that the new fetch cache contains
only the three homepage responses after exercising multiple listing and search
pages. Image optimization remains disabled as documented in image-delivery.md.
