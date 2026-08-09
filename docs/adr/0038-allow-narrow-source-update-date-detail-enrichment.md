# Allow Narrow Source Update Date Detail Enrichment

Superseded by [ADR 0039](./0039-allow-capped-detail-enrichment-with-a-public-allowlist.md).

Nettiauto search result payloads do not expose an exact listing created,
posted, or updated date. The detail page commonly exposes a visible
`Päivitetty DD.MM.YYYY` label when fetched with the same AJAX-style request
headers used by the search-result crawler.

The crawler may therefore enqueue a low-priority detail-page probe for known
Listing URLs to capture only this source update date into `source_updated_date`.
This is a Source-provided date, not a crawler observation timestamp, created
date, sold date, or exact datetime.

Broader Detail Page Data enrichment remains deferred. Registration number, VIN,
equipment, descriptions, and richer technical fields should not be added under
this exception.
