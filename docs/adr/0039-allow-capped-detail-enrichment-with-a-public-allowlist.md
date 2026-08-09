# Allow Capped Detail Enrichment with a Public Allowlist

ADR 0038 allowed detail-page requests only for a source update date. The product now uses
additional detail-page facts on public listing pages, including equipment, seller notes, images,
and explicitly modeled technical specifications. Removing that established capability would make
the product materially less useful, but retaining arbitrary normalized detail fields would allow
private or unexpected source data to cross into analytical and public storage without review.

Detail enrichment is therefore allowed as a separately opt-in, per-run-capped crawl tier.
`CRAWLER_DETAIL_ENABLED` remains false by default and `CRAWLER_DETAIL_MAX_PER_RUN` remains the hard
limit for scheduled detail jobs. Search-result collection remains the authoritative Crawl Run; a
detail-page failure must not change its completion status.

Raw Listing Data may retain the fetched detail HTML and source payload for provenance and controlled
reprocessing. Normalized snapshot JSON and Product API responses must instead use explicit
allowlists. VIN is retained only in Raw Listing Data and is never copied to normalized snapshots or
the Product API. Registration number remains public under ADR 0021. Unknown detail fields remain raw
and require an explicit schema, parser, and Product API decision before they can be promoted.

The Product API validates successful responses against strict runtime schemas. This is the final
privacy boundary: adding a parser field alone cannot make that field public.

This decision supersedes ADR 0038 while preserving its interpretation of source update dates.
