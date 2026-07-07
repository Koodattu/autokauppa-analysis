CREATE INDEX "listing_snapshots_listing_latest_idx" ON "listing_snapshots" USING btree ("listing_id","observed_at" DESC NULLS LAST,"created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "listing_sightings_seen_listing_idx" ON "listing_sightings" USING btree ("seen_at" DESC NULLS LAST,"listing_id");
