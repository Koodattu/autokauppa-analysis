CREATE UNIQUE INDEX "listings_latest_snapshot_id_uq" ON "listings" USING btree ("latest_snapshot_id") WHERE "listings"."latest_snapshot_id" is not null;--> statement-breakpoint
UPDATE "listings" AS listing
SET "current_availability" = snapshot."availability"
FROM "listing_snapshots" AS snapshot
WHERE snapshot."id" = listing."latest_snapshot_id"
  AND listing."current_availability" IS DISTINCT FROM snapshot."availability";--> statement-breakpoint
ANALYZE "listings";--> statement-breakpoint
ANALYZE "listing_snapshots";
