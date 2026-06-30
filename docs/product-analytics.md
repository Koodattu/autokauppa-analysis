# Product Analytics Ideas

Status: product direction and analysis ideas only. No implementation exists yet.

## First Useful Analytics

The first version should make broad Market Trend questions fast to answer:

- Current inventory count over time.
- Active Asking Price median and percentiles over time.
- Observed Sold Price median and percentiles over time.
- Listing count by make, model, year, fuel type, transmission, seller type, and
  region when available.
- Mileage distribution by make, model, and year.
- Price versus mileage scatter/table.
- New Listings per period.
- Sold Listings per period.
- Recently changed Listings.

Analysis Queries should be represented as URL Filters in the first version so
public analytics views are shareable without user accounts. Saved Views,
watchlists, and alerts are deferred.

## Strong Early Views

These views are likely useful with mostly Search Result Data:

- Make/model trend page, for example Toyota Corolla.
- Make/model/year trend page, for example Toyota Corolla 2017.
- Fuel-type trend page, for example electric versus petrol.
- Price-band inventory, for example Listings under 10,000 EUR.
- Mileage-band price trends.
- Active inventory versus sold inventory.
- Asking Price spread by model year.
- Seller type comparison, if seller type is reliable.

## Public Listing Pages

Individual Public Listing Pages are in scope. They should show curated
normalized data and analysis context rather than raw source data.

Public pages should initially be public but marked `noindex` until Indexing
Readiness is reached. This avoids search engines indexing low-coverage,
early-parser-quality, or unstable URL/page structures.

Useful public fields:

- Make, model, and model year.
- Price history.
- Mileage history.
- Availability history.
- First seen and last seen.
- Source Attribution.
- Registration Number when visible in the Source.
- Image Metadata, if useful.
- Nearby segment comparisons later.

Admin-only fields stay hidden:

- VIN.
- Raw Listing Data.
- Parser internals.
- Crawler metadata beyond useful freshness/coverage.
- Admin notes or operational data.

## Detail-Page Enrichment Views

These depend on Detail Page Data and are out of scope for the first version:

- Transmission trends, such as automatic versus manual pricing.
- Registration identifier recurrence across multiple Listings.
- Trim/equipment impact on Asking Price.
- Engine/power-based comparisons.
- Inspection or condition data trends, if available.
- Description keyword analysis.

## Higher-Value Analysis Ideas

Potential later analytics:

- Days-on-market proxy from first seen to sold/removed/stale.
- Price change frequency before sold/removed.
- Average discount from first Asking Price to Last Asking Price.
- Listing churn by make/model/year.
- Fastest-moving models by availability duration.
- Slowest-moving models by availability duration.
- Outlier detection for unusually cheap or expensive Listings.
- Mileage-adjusted price estimates.
- Year-over-year depreciation curves.
- Seasonal price or inventory patterns.
- Electric vehicle supply and pricing trends.
- Dealer versus private seller pricing differences.
- Region-based price differences, if location data is reliable.
- Market liquidity score by segment, combining inventory, sold observations, and
  days-on-market proxy.

## Important Labeling Rules

- Do not label any price as sale price.
- Use Asking Price for active Listing prices.
- Use Observed Sold Price for prices shown by the Source for Sold Listings.
- Use Last Asking Price for the last observed active price before a Listing
  stopped being active.
- Make coverage freshness visible so charts do not imply more certainty than the
  crawler has.
- Registration Number may be exposed publicly when visible in the Source.
- VIN, Raw Listing Data, parser errors, and crawler internals are admin-only.

## Coverage Metadata

Analytics views should expose Coverage Metadata, including:

- Last relevant crawl time.
- Sample Size.
- Whether results include current Listings, Sold Listings, or both.
- Whether results are based on Search Result Data, Detail Page Data, or both.
- Coverage window, such as last 7 days or last 30 days.
- Whether the relevant crawl coverage is complete or partial.

## Admin Panel

The first product slice should include a small authenticated Admin Panel for
Crawler Status. It should expose enough operational state to understand whether
stale or incomplete analytics are caused by market behavior or crawler lag.

Useful first fields:

- Last successful Current Listings Crawl.
- Last successful Sold Listings Crawl.
- Current crawl status.
- Queue or backlog summary.
- Failed crawl count.
- Latest parser errors.
- Coverage freshness by segment.

This panel must not be exposed without authentication. It does not need to be a
full observability console at launch.

## Open Product Risk

The quality of many analytics depends on crawler coverage. Views should expose
data freshness, sample size, and whether a result is based on Search Result Data
or Detail Page Data.

## Query Strategy

The first implementation should query normalized tables directly with indexed
SQL and live grouped queries. Aggregate Views or materialized views should be
added later only for measured hot paths and stable analytics dimensions.
