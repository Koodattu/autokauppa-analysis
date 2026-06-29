# Derive market history from Sightings and Snapshots first

The first implementation will derive market history from Listing Sightings and
change-based Listing Snapshots rather than maintaining a separate Daily Market
Snapshot table. Daily or period inventory views can be added later as Aggregate
Views if measured query patterns require them.
