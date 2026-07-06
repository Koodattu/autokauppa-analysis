UPDATE "source_search_queries"
SET
  "target_cadence_interval" = '7 days'::interval,
  "updated_at" = now(),
  "notes" = 'Default current passenger-car Nettiauto search query, newest first, weekly cadence.'
WHERE
  "source" = 'nettiauto'
  AND "vehicle_category" = 'passenger_car'
  AND "crawl_kind" = 'current'
  AND "source_search_hash" = 'P2236304442';
--> statement-breakpoint
UPDATE "source_search_queries"
SET
  "target_cadence_interval" = '30 days'::interval,
  "updated_at" = now(),
  "notes" = 'Default sold passenger-car Nettiauto search query, newest first, monthly cadence.'
WHERE
  "source" = 'nettiauto'
  AND "vehicle_category" = 'passenger_car'
  AND "crawl_kind" = 'sold'
  AND "source_search_hash" = 'P82984997';
