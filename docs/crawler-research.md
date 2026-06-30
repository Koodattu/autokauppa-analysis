# Nettiauto crawler research

Status: early source research only. No crawler implementation exists here.
Last checked: 2026-06-30.

## Project constraints

The existing architecture docs point to an HTTP-first crawler:

- Fetch static source pages or source API responses before considering browser
  automation.
- Keep Current Listings Crawl and Sold Listings Crawl in the first scope.
- Store relevant Raw Listing Data, not complete fetched pages by default.
- Prefer fixture-based parser work and conservative Crawl Politeness.

## Request behavior

The JSON-vs-HTML behavior is controlled by whether the request looks like the
site's AJAX pagination/filter request.

The full page includes `ad_listing.1965ef03.js`. That bundle intercepts
`.pageNavigation`, `.quickCustomFilter`, `.quickFilterSelect`, and
`.selectNavigation`, prevents normal navigation, then calls jQuery `$.get(...)`
against the same search URL. The response is passed to code that expects:

```text
total_ads
ad_listing_data
pagination_small_view
pagination_large_view
quick_filter_option
current_page
total_page
```

Live probes show the deciding header is `X-Requested-With: XMLHttpRequest`.
`Accept: application/json` alone was not enough.

Observed on 2026-06-30 without browser cookies:

| URL | Header shape | Result |
| --- | --- | --- |
| `/vaihtoautot?haku=P2236304442&page=1` | document navigation | 302 to `/sso/refresh...` HTML |
| `/vaihtoautot?haku=P2236304442&page=1` | `X-Requested-With: XMLHttpRequest`, `Accept: */*` | 200 `application/json` |
| `/vaihtoautot?haku=P2236304442` | AJAX header, no `page` | 200 JSON, `current_page: 1` |
| `/hakutulokset?haku=P82984997` | AJAX header, no `page` | 200 JSON, `current_page: 1` |
| either endpoint | `Accept: application/json` only | 302 document path |

The current-listing AJAX response had 32 listing records in `data-datalayer`:
2 `Ohituskaista` and 30 `Listaussivu`, all `Myynnissä`. The sold-listing AJAX
response had 30 `Listaussivu` records, all `Myyty`. Totals are live and changed
between probes.

## Payloads

### JSON-LD

The first HTML document contains `application/ld+json` with an ItemList. In the
provided fixture it had:

- `numberOfItems: 78383`
- 32 `itemListElement` records
- Source Listing ID derivable from item URL
- brand, model, name, image, VIN, body type, color, fuel type, transmission,
  mileage, and offer price

JSON-LD is useful, but it lacks some list-card fields we likely need from Search
Result Data, especially seller and explicit availability labels.

### AJAX JSON

The AJAX JSON is the better primary Search Result Page payload. Its
`ad_listing_data` field contains listing-card HTML. Each card has a
`data-datalayer` JSON object with fields such as:

- `item_id` as Source Listing ID
- `item_name`, `item_brand`, `item_variant`
- `item_seller`
- `item_year_model`
- `item_vehicle_price`
- `item_mileage`
- `item_power_type`
- `item_ad_status`
- `position`, `page_number`, `item_list_id`

The full HTML document also has the same card-level `data-datalayer` shape under
`#listingData`, so the same parser can be used as a fallback if a document page
is received.

## `haku`

`haku=P...` appears to be an opaque server-side search hash.

Evidence:

- The page links to `tallennettu-haku?haku=P2236304442`.
- The inline page code stores current form data with `statusType: "forsale"`.
- The advance-search bundle uses constants for `forsale`, `sold`,
  `vaihtoautot`, and `hakutulokset`.
- The advance-search save flow posts form data to `save_search`; on success it
  receives `searchHash` and redirects with `haku: e.searchHash`.

Treat `haku` as a Source Search Query identifier, not as a parameter we can
derive locally. For now, seed the crawler with known current and sold default
hashes. Later, only use the site's form/save-search flow if legality and
stability are confirmed.

## Recommended first crawler approach

1. Fetch search result pages with normal HTTP and AJAX headers:
   `Accept: */*` and `X-Requested-With: XMLHttpRequest`.
2. Use `page` for pagination, including page 1 for consistency.
3. Parse JSON response metadata: `total_ads`, `current_page`, `total_page`.
4. Parse `ad_listing_data` card HTML and extract each card's `data-datalayer`.
5. Store Raw Listing Data as the relevant card HTML fragment plus parsed
   card-level source payload, not the full page response.
6. Use JSON-LD/full HTML parsing only as fallback or comparison fixture.
7. Keep sold/current distinct by crawl type and source labels:
   `Myynnissä` for current, `Myyty` for sold.
8. Delay detail-page enrichment until broad Search Result Data ingestion works.

## Research scripts

Inspect saved responses:

```powershell
bun scripts/nettiauto/inspect-fixture.ts <response-file> [...]
```

Probe live response behavior:

```powershell
$env:NETTIAUTO_PROBE_SCENARIOS = 'jquery-get-x-requested-with'
bun scripts/nettiauto/probe-fetch.ts 'https://www.nettiauto.com/vaihtoautot?haku=P2236304442&page=1'
```

Optional environment variables:

- `NETTIAUTO_PROBE_SCENARIOS`: comma-separated scenario names to run.
- `NETTIAUTO_PROBE_DELAY_MS`: delay between requests, default `1500`.
- `NETTIAUTO_COOKIE`: optional browser cookie string for debugging only. Do not
  commit or log real session cookies.

## Open checks

- Confirm Nettiauto terms, robots.txt expectations, and acceptable crawl rate.
- Verify whether the default current/sold hashes stay stable over time.
- Add parser fixtures for sold HTML/JSON captures before implementation.
- Decide which image metadata should be retained from card HTML.
- Probe failure modes: SSO redirects, Cloudflare challenges, 429s, empty pages,
  and changed response keys.
