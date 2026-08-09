DROP INDEX "source_fetches_crawl_run_kind_page_uq";--> statement-breakpoint
ALTER TABLE "source_fetches" ADD COLUMN "attempt_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "listing_events_listing_type_run_uq" ON "listing_events" USING btree ("listing_id","event_type","source_crawl_run_id") WHERE "listing_events"."source_crawl_run_id" is not null;--> statement-breakpoint
CREATE INDEX "listing_events_listing_type_time_idx" ON "listing_events" USING btree ("listing_id","event_type","event_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "listing_sightings_query_listing_seen_idx" ON "listing_sightings" USING btree ("search_query_id","listing_id","seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "source_fetches_crawl_run_kind_page_uq" ON "source_fetches" USING btree ("crawl_run_id","fetch_kind","page_number","attempt_number");