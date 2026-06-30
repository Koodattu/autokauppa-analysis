# Use PostgreSQL enums for stable domain state

Stable app-owned domain states such as Source, Vehicle Category, Crawl Kind,
Listing Availability, Crawl Run Status, Fetch Kind, Fetch Body Shape, Raw
Listing Record Kind, and Parser Status will use PostgreSQL enums. Source labels,
failure classes, and other externally shaped or open-ended values remain text so
normal source drift does not require schema changes.
