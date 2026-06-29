# Use explicit typed columns for normalized analytics data

Normalized Listing Data will be extracted into explicit typed columns rather
than left as flexible JSON. Raw Listing Data may use JSON or source fragments,
but fields used for analytics, filtering, grouping, sorting, and charting should
be promoted into typed schema columns so queries remain reliable and indexable.
