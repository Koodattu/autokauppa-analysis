# Demand-driven analytics caching

The September 29, 2026 production audit found around 800 cache refreshes per day
despite almost no public traffic. A 30-second sweep kept default filter metadata,
all-market snapshots and historical time series warm after their five-minute TTL.
Snapshot and time-series refreshes averaged about seven and nine seconds and
repeated database work even when those endpoints had no visitors.

The API now loads analytics only when requested. Startup and idle time do not
run analytics queries. The unused prewarm method, startup call, sweep timer and
default-refresh API have been removed.

Existing bounded in-memory caches retain their five-minute TTL, query-specific
keys and concurrent-request deduplication. A cold request waits for its query;
an expired entry serves its last good value while that request triggers one
refresh. A failed refresh retains the last good value and can retry on a later
request. There is no timer-driven retry or refresh. As before, a stale response
may be returned on the first request after a quiet period.

The first uncached broad historical request can therefore take several seconds,
especially after an API restart. Existing database and HTTP deadlines still
apply. The frontend's three small homepage cache entries and crawler controls
are unchanged; no additional disk cache or database migration is introduced.

Deploy only the API under the existing auto-deployment maintenance lock, using
the production compose override and `--no-deps --no-build` after building the
verified revision. Preserve the running web, worker and database containers.
After readiness and representative page/API checks, observe an idle interval
longer than five minutes: no unsolicited analytics refreshes should occur and
temporary I/O should stay flat in the absence of actual database work. Record
only Nettiauto's verified deployment state before releasing the owned lock.
