# Store change-based Listing Snapshots

Listing Snapshots will be created only when tracked Listing state changes, while
Listing Sightings record that a Listing was observed during a Crawl Run. This
keeps price, mileage, status, and metadata history clean without losing crawl
freshness or coverage information.
