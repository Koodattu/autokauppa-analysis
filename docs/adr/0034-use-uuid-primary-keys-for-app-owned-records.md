# Use UUID primary keys for app-owned records

App-owned database tables will use UUID primary keys rather than generated
identity integers. Source identities remain modeled explicitly with unique
constraints, especially `(source, source_listing_id)` for Listings, so UUIDs are
only internal references for application rows and worker jobs.
