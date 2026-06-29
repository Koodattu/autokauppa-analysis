# Distinguish sold from removed Listings

Sold is a Source-confirmed Listing Availability, while removed is an inferred
fallback after reliable missing evidence. Nettiauto sold search results expose
explicit sold signals such as `Myyty` labels and sold listing metadata, so
absence from an active crawl must not be treated as sold.
