# Limit the first crawler to Search Result Data

The first crawler implementation will ingest current and sold Search Result Data
only. Detail Page Data enrichment remains a later, lower-priority job so the
project can prove the full fetch, parse, persist, API, and UI pipeline before
increasing source request volume and parser complexity.
