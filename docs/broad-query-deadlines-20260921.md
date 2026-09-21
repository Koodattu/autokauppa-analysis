# Broad time-series queries and deadlines, September 21, 2026

The September 19 audit found time-series requests lasting up to 120.6 seconds
when year/mileage/fuel or body/transmission filters omitted make and model.
Those requests took the bulk snapshot-period join even when only about 100
listings matched. Some continued after the API's 60-second HTTP idle timeout
closed the frontend connection.

Time series now counts distinct candidate listing IDs, stopping at 10,001,
for filtered requests without the existing make/model fast path. Up to 10,000
candidates use indexed historical snapshot lookups; larger scopes retain the
bulk join. The limit chooses the execution strategy and never truncates results.
The count limit does not guarantee an index-only scan or cap all probe work.
Unfiltered requests and existing make/model requests keep their previous SQL.

Every lookup still resolves the latest snapshot valid at the sighting before
applying filters. An older matching snapshot must not replace a newer snapshot
that no longer matches. The regression test exercises this with and without
make/model filters.

Read-only production verification covered eight scopes. Three changed queries
(year/mileage/fuel, body/transmission, and an empty scope) returned exactly the
same complete results in repeatable-read transactions. Five other scopes had
identical final SQL and parameters. The baseline comparisons disabled nested
loops only to avoid replaying the known pathological plan; no data or query
semantics changed. Actual candidate counts verified the captured branch choices.

Representative measurements with unchanged 4 MiB work memory and parallel query
workers disabled:

| Scope | Probe candidates | Probe wall time including connection overhead | Main query | Main-query temporary writes |
| --- | ---: | ---: | ---: | ---: |
| Current, 2000, 200,000–224,999 km, petrol | 105 | 220 ms | 78 ms | 0 |
| Current, Erilliskori, manual | 91 | 374 ms | 765 ms | 0 |
| Current, price at least EUR 1 | 10,001 (capped) | 306 ms | 7.25 s | 300 MB |

The broad price query retains the original SQL (7.72 s and 300 MB in its baseline
measurement). These are individual live measurements, not latency guarantees.
Whole-market analytics still perform temporary I/O; this release adds no disk
cache, materialized data, index, migration, or global PostgreSQL memory setting.

The API alone opens PostgreSQL connections with a 30-second `statement_timeout`.
PostgreSQL stops an over-budget statement rather than merely abandoning the
JavaScript promise. SQLSTATE 57014 becomes HTTP 503 with `Retry-After: 5`.
Workers, migrations and other SQL clients keep their existing defaults.
The timeout is per statement, not a total request or connection-pool wait budget.
Shared cache refreshes are not cancelled when one visitor disconnects; they are
subject to the same database deadline.

Uncached frontend API requests have a 45-second fetch deadline, composed with
any caller signal. Socket failures and fetch timeouts become retryable API
errors. Listing pages handle 503/504 alongside rate limiting. Response-schema
errors still propagate normally. The three shared homepage cache keys and
five-minute freshness policy are unchanged.

Tests exercise real PostgreSQL cancellation, connection reuse, an HTTP 503 while
a fixture table is locked, successful retry after releasing the lock, and an
unbounded separate client. Frontend tests cover transport failures and preserve
the shared homepage cache behavior.

Deploy only API and web, preserving PostgreSQL and the worker. Verify the
previously slow scopes through the public API and frontend, API/web health,
recent logs, and the three-file frontend cache. Do not replay long-running
production queries to test cancellation; the disposable local fixture covers it.

References: [PostgreSQL statement timeout](https://www.postgresql.org/docs/18/runtime-config-client.html#GUC-STATEMENT-TIMEOUT),
[Postgres.js connection parameters](https://github.com/porsager/postgres#connection-details),
[Bun HTTP server](https://bun.sh/docs/runtime/http/server).
