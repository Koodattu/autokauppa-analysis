# Limit the first crawler to Search Result Data

Superseded in part by
[0038](0038-allow-narrow-source-update-date-detail-enrichment.md), which allows
capturing only Nettiauto's visible source update date from detail pages.

The first crawler implementation will ingest current and sold Search Result Data
only. Detail Page Data enrichment remains a later, lower-priority job so the
project can prove the full fetch, parse, persist, API, and UI pipeline before
increasing source request volume and parser complexity.
