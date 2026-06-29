# Retain Raw Listing Data in PostgreSQL

The crawler will retain Raw Listing Data from Nettiauto in PostgreSQL instead of
only selected normalized fields. The system should not store complete fetched
HTML pages as the default product data; it should store the relevant
listing-level payload, structured metadata, JSON-LD object, or HTML fragment
needed to reprocess and audit Listing observations. Frontend Data will remain
curated API output rather than raw source or database dumps.
