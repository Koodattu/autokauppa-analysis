CREATE TABLE "detail_backfill_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "source_code" NOT NULL,
	"target_parser_version" text NOT NULL,
	"selection" text DEFAULT 'missing_or_v1' NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"target_count" integer DEFAULT 0 NOT NULL,
	"scheduled_count" integer DEFAULT 0 NOT NULL,
	"succeeded_count" integer DEFAULT 0 NOT NULL,
	"unavailable_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_fetches" ALTER COLUMN "crawl_run_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "source_fetches" ADD COLUMN "detail_backfill_run_id" uuid;
--> statement-breakpoint
ALTER TABLE "source_fetches" ADD COLUMN "source_listing_id" text;
--> statement-breakpoint
ALTER TABLE "raw_listing_records" ALTER COLUMN "crawl_run_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "raw_listing_records" ADD COLUMN "detail_backfill_run_id" uuid;
--> statement-breakpoint
ALTER TABLE "source_fetches" ADD CONSTRAINT "source_fetches_single_run_context_ck" CHECK (num_nonnulls("crawl_run_id", "detail_backfill_run_id") = 1);
--> statement-breakpoint
ALTER TABLE "raw_listing_records" ADD CONSTRAINT "raw_listing_records_single_run_context_ck" CHECK (num_nonnulls("crawl_run_id", "detail_backfill_run_id") = 1);
--> statement-breakpoint
ALTER TABLE "source_fetches" ADD CONSTRAINT "source_fetches_detail_backfill_run_id_detail_backfill_runs_id_fk" FOREIGN KEY ("detail_backfill_run_id") REFERENCES "public"."detail_backfill_runs"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "raw_listing_records" ADD CONSTRAINT "raw_listing_records_detail_backfill_run_id_detail_backfill_runs_id_fk" FOREIGN KEY ("detail_backfill_run_id") REFERENCES "public"."detail_backfill_runs"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "listing_details" (
	"listing_id" uuid PRIMARY KEY NOT NULL,
	"source_parser_version" text NOT NULL,
	"normalization_schema_version" text NOT NULL,
	"source_raw_listing_record_id" uuid NOT NULL,
	"source_fetch_id" uuid NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"source_updated_date" date,
	"vin" text,
	"torque_nm" integer,
	"battery_capacity_kwh" numeric(8, 2),
	"electric_range_km" integer,
	"charging_type_source_label" text,
	"charging_power_ac_kw" numeric(8, 2),
	"charging_power_dc_kw" numeric(8, 2),
	"battery_warranty_source_label" text,
	"battery_warranty_months" integer,
	"battery_warranty_km" integer,
	"electric_consumption_source_label" text,
	"electric_consumption_combined_kwh_100km" numeric(8, 2),
	"owner_count" integer,
	"normalized_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_details_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action,
	CONSTRAINT "listing_details_source_raw_listing_record_id_raw_listing_records_id_fk" FOREIGN KEY ("source_raw_listing_record_id") REFERENCES "public"."raw_listing_records"("id") ON DELETE no action ON UPDATE no action,
	CONSTRAINT "listing_details_source_fetch_id_source_fetches_id_fk" FOREIGN KEY ("source_fetch_id") REFERENCES "public"."source_fetches"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE "listing_image_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"asset_path" text NOT NULL,
	"variant_mask" integer DEFAULT 0 NOT NULL,
	"image_role" text,
	"position" integer,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"last_raw_listing_record_id" uuid NOT NULL,
	CONSTRAINT "listing_image_assets_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action,
	CONSTRAINT "listing_image_assets_last_raw_listing_record_id_raw_listing_records_id_fk" FOREIGN KEY ("last_raw_listing_record_id") REFERENCES "public"."raw_listing_records"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE "listing_hero_images" (
	"listing_id" uuid PRIMARY KEY NOT NULL,
	"object_key" text NOT NULL,
	"content_sha256" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"source_image_asset_path" text NOT NULL,
	"source_raw_listing_record_id" uuid NOT NULL,
	"archived_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_hero_images_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "listing_hero_images_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action,
	CONSTRAINT "listing_hero_images_source_raw_listing_record_id_raw_listing_records_id_fk" FOREIGN KEY ("source_raw_listing_record_id") REFERENCES "public"."raw_listing_records"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "detail_backfill_runs_status_created_idx" ON "detail_backfill_runs" USING btree ("status", "created_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "source_fetches_detail_backfill_idx" ON "source_fetches" USING btree ("detail_backfill_run_id", "fetched_at");
--> statement-breakpoint
CREATE INDEX "raw_listing_records_detail_backfill_idx" ON "raw_listing_records" USING btree ("detail_backfill_run_id");
--> statement-breakpoint
CREATE INDEX "listing_details_parser_idx" ON "listing_details" USING btree ("source_parser_version", "normalization_schema_version");
--> statement-breakpoint
CREATE INDEX "listing_details_vin_idx" ON "listing_details" USING btree ("vin");
--> statement-breakpoint
CREATE UNIQUE INDEX "listing_image_assets_listing_path_uq" ON "listing_image_assets" USING btree ("listing_id", "asset_path");
--> statement-breakpoint
CREATE INDEX "listing_image_assets_listing_cohort_position_idx" ON "listing_image_assets" USING btree ("listing_id", "last_raw_listing_record_id", "position");
--> statement-breakpoint
CREATE INDEX "listing_hero_images_content_sha_idx" ON "listing_hero_images" USING btree ("content_sha256");
