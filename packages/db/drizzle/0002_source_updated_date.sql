ALTER TABLE "raw_listing_records" ADD COLUMN "source_updated_date" date;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "source_updated_date" date;--> statement-breakpoint
ALTER TABLE "listing_snapshots" ADD COLUMN "source_updated_date" date;--> statement-breakpoint
CREATE INDEX "listing_snapshots_source_updated_date_idx" ON "listing_snapshots" USING btree ("source_updated_date");
