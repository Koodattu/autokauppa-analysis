CREATE INDEX "raw_listing_records_captured_quality_idx" ON "raw_listing_records" USING btree ("captured_at" DESC NULLS LAST,"parser_version","parser_status");--> statement-breakpoint
CREATE INDEX "listing_snapshots_detail_enriched_idx" ON "listing_snapshots" USING btree ("id") WHERE "listing_snapshots"."normalized_data" ? 'detailParserVersion';
