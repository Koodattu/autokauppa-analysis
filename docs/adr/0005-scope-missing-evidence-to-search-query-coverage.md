# Scope missing evidence to Search Query coverage

Availability inference from missing Listings will be scoped to Search Query
coverage rather than source-wide absence. A Listing missing from one crawl only
becomes meaningful when the relevant Search Query crawl was complete; this keeps
partial crawls, changed filters, and pagination/ranking behavior from falsely
marking Listings stale or removed.
