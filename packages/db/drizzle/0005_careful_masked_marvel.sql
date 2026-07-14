DROP INDEX "listing_snapshots_listing_hash_uq";--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "latest_snapshot_id" uuid;--> statement-breakpoint
UPDATE "listings" AS listing
SET "latest_snapshot_id" = latest_snapshot."id"
FROM (
  SELECT DISTINCT ON ("listing_id")
    "id",
    "listing_id"
  FROM "listing_snapshots"
  ORDER BY "listing_id", "observed_at" DESC, "created_at" DESC
) AS latest_snapshot
WHERE latest_snapshot."listing_id" = listing."id";--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_latest_snapshot_id_listing_snapshots_id_fk" FOREIGN KEY ("latest_snapshot_id") REFERENCES "public"."listing_snapshots"("id") ON DELETE no action ON UPDATE no action NOT VALID;
