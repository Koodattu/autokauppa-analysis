# Defer precomputed Aggregate Views

The first implementation will query normalized tables directly with indexed SQL
instead of building precomputed Aggregate Views immediately. Analytics questions,
schema, and dimensions are expected to change early, so aggregate tables or
materialized views should be introduced later for measured hot paths.
