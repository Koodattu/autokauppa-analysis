UPDATE "listing_snapshots"
SET "normalized_data" = "normalized_data" - 'vin' - 'additionalSourceFields'
WHERE "normalized_data" ? 'vin'
   OR "normalized_data" ? 'additionalSourceFields';
