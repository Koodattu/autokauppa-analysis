# Nettiauto Analytics

This context describes the domain language for collecting and analyzing vehicle
marketplace listing data. It intentionally avoids implementation details.

## Language

**Listing**:
A Nettiauto advertisement with a stable source identity such as a source listing
ID or source URL. This is the primary entity the system tracks.
_Avoid_: Vehicle, ad, item, market observation

**Source Listing ID**:
The identifier assigned by a Source to a Listing. For Nettiauto, this is the
numeric ID found in listing URLs and listing-card metadata.
_Avoid_: Vehicle ID, VIN, ad ID

**Listing Snapshot**:
One changed state of a Listing at a specific point in time.
_Avoid_: Listing version, observation, scrape result

**Listing Sighting**:
Proof that a Listing was observed during a Crawl Run.
_Avoid_: Snapshot, heartbeat, scrape result

**Daily Market Snapshot**:
A precomputed calendar-day representation of market state.
_Avoid_: Listing Snapshot, market history

**Listing Availability**:
The system's current availability classification for a Listing: active, sold,
stale, removed, or unknown.
_Avoid_: Status, state

**Sold Listing**:
A Listing that the Source explicitly reports as sold.
_Avoid_: Removed listing, unavailable listing

**Removed Listing**:
A Listing that is no longer discoverable after enough reliable missing evidence,
without an explicit sold signal from the Source.
_Avoid_: Sold listing, missing listing

**Stale Listing**:
A previously active Listing that has not been seen recently, but does not yet
have enough evidence to be classified as removed.
_Avoid_: Removed listing, expired listing

**Unknown Availability**:
The classification used when crawl coverage is too unreliable to update Listing
Availability.
_Avoid_: Stale listing, failed listing

**Market Dataset**:
The accumulated historical Listing data used for analysis.
_Avoid_: Data lake, warehouse, scraped data

**Analysis Query**:
A user-selected set of filters over the Market Dataset for charts, tables, and
trend analysis.
_Avoid_: Search query, report, dashboard query

**URL Filter**:
An Analysis Query represented in the public page URL.
_Avoid_: Saved filter, watchlist

**Saved View**:
A persisted user-defined Analysis Query.
_Avoid_: URL filter, report

**Market Trend**:
A change in Listing counts, prices, mileage, or other Listing attributes over
time within an Analysis Query.
_Avoid_: Statistic, chart

**Aggregate View**:
A precomputed or materialized analytic result used to speed up known Market
Trend queries.
_Avoid_: Cache, report table

**Coverage Metadata**:
Information that describes how complete, fresh, and enriched the data behind an
Analysis Query is.
_Avoid_: Debug data, crawl metadata

**Admin Panel**:
An authenticated internal UI for crawler health, coverage, failures, and other
operational state.
_Avoid_: Public dashboard, observability console

**Admin Password Gate**:
The deliberately minimal first-version authentication mechanism for the Admin
Panel and admin-only API routes.
_Avoid_: User account, auth system

**Crawler Status**:
The current operational state of crawling, including recent runs, failures,
queue backlog, and freshness.
_Avoid_: Debug status, worker status

**Crawler Control**:
Operator-directed scheduling, pausing, and resuming of crawling, together with
the operational state needed to determine how those actions will take effect.
_Avoid_: Worker control, crawler settings, admin action

**Sample Size**:
The number of Listings or Listing Snapshots contributing to an analytic result.
_Avoid_: Count, row count

**Specific-Car Lookup**:
Analysis that attempts to connect Listings through a vehicle-specific identifier
such as a visible registration number.
_Avoid_: Vehicle identity, duplicate detection

**Registration Number**:
A visible vehicle registration identifier captured from Detail Page Data when
available.
_Avoid_: License plate, vehicle identity

**VIN**:
A visible vehicle identification number captured from Detail Page Data when
available.
_Avoid_: Vehicle identity

**Crawl Run**:
One execution of source collection work that attempts to discover or refresh
Listings.
_Avoid_: Scrape, scan, sync

**Crawl Politeness**:
The crawler's source-facing limits and behavior intended to avoid excessive
load, blocking, or bypassing access controls.
_Avoid_: Anti-bot strategy, evasion

**Source**:
A marketplace or provider from which Listings are collected.
_Avoid_: Site, provider, platform

**Vehicle Category**:
The Source category a Listing belongs to, such as passenger car or motorcycle.
_Avoid_: Type, segment

**Passenger Car**:
The initial Vehicle Category for the Market Dataset.
_Avoid_: Car, auto

**Motorcycle**:
A likely future Vehicle Category after the passenger car pipeline is stable.
_Avoid_: Bike

**Search Query**:
A Source search or filter definition used by the crawler to discover Listings.
_Avoid_: Search URL, filter, crawl target

**Search Result Page**:
One paginated result page within a Search Query.
_Avoid_: Page, result set

**Complete Crawl Run**:
A Crawl Run that successfully visited every expected Search Result Page for a
Search Query.
_Avoid_: Successful crawl, full scrape

**Current Listings Crawl**:
A Crawl Run focused on Listings currently offered for sale.
_Avoid_: Active crawl, normal crawl

**Sold Listings Crawl**:
A Crawl Run focused on Listings the Source reports as sold.
_Avoid_: Historical crawl, removed crawl

**Search Result Data**:
Listing data collected from search result pages.
_Avoid_: Basic data, list data

**Detail Page Data**:
Listing data collected from an individual Listing page.
_Avoid_: Full data, rich data

**Raw Listing Data**:
The source-provided listing-level payload or relevant listing fragment captured
before normalization.
_Avoid_: Full page HTML, scrape dump, source record

**Parser Version**:
The version identifier for logic that turns Raw Listing Data into Normalized
Listing Data.
_Avoid_: Code version, schema version

**Reprocessing Run**:
An execution that regenerates Normalized Listing Data from stored Raw Listing
Data.
_Avoid_: Backfill, migration, recrawl

**Normalized Listing Data**:
Cleaned Listing data derived from Raw Listing Data for analytics and application
use, represented as explicit typed fields.
_Avoid_: Parsed JSON, frontend data, raw data

**Source Label**:
The original Source-provided text for a Listing field before normalization.
_Avoid_: Raw value, display value

**Frontend Data**:
Curated data returned by the application API for UI use.
_Avoid_: Raw data, database row, normalized data

**Public Listing Data**:
Curated Listing data that may be exposed without authentication.
_Avoid_: Raw data, admin data

**Public Listing Page**:
A public page for an individual Listing using curated normalized data and
analysis context.
_Avoid_: Raw listing mirror, scrape viewer

**Indexing Readiness**:
The point at which public pages are considered complete, stable, and trustworthy
enough for search engine indexing.
_Avoid_: Launch, public readiness

**Product API**:
The public API surface used by the web application to render analytics and
Listing views.
_Avoid_: Open data API, public API

**Source Attribution**:
Visible information that identifies the Source and links back to the original
Listing when available.
_Avoid_: Credit, backlink

**Image Metadata**:
Image URLs and related listing image information captured from the Source.
_Avoid_: Image files, downloaded images

**Asking Price**:
The price shown while a Listing is active.
_Avoid_: Price

**Observed Sold Price**:
The price shown by the Source for a Sold Listing.
_Avoid_: Sale price, transaction price, final price

**Last Asking Price**:
The most recent Asking Price observed before a Listing stopped being active.
_Avoid_: Sale price, final asking price
