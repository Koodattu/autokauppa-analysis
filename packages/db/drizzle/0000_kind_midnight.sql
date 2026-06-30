CREATE TYPE "public"."crawl_kind" AS ENUM('current', 'sold');--> statement-breakpoint
CREATE TYPE "public"."crawl_run_status" AS ENUM('planned', 'running', 'completed', 'partial', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."fetch_body_shape" AS ENUM('ajax_json', 'html_document', 'html_fragment', 'redirect', 'blocked', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."fetch_kind" AS ENUM('search_result_page', 'detail_page');--> statement-breakpoint
CREATE TYPE "public"."listing_availability" AS ENUM('active', 'sold', 'stale', 'removed', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."parser_status" AS ENUM('parsed', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."raw_listing_record_kind" AS ENUM('search_result_card', 'search_result_json_ld', 'detail_page');--> statement-breakpoint
CREATE TYPE "public"."source_code" AS ENUM('nettiauto');--> statement-breakpoint
CREATE TYPE "public"."vehicle_category" AS ENUM('passenger_car');--> statement-breakpoint
CREATE TABLE "crawl_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "source_code" NOT NULL,
	"search_query_id" uuid NOT NULL,
	"crawl_kind" "crawl_kind" NOT NULL,
	"vehicle_category" "vehicle_category" NOT NULL,
	"status" "crawl_run_status" NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"expected_page_count" integer,
	"fetched_page_count" integer DEFAULT 0 NOT NULL,
	"parsed_listing_count" integer DEFAULT 0 NOT NULL,
	"source_total_ads" integer,
	"is_complete" boolean DEFAULT false NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"event_at" timestamp with time zone NOT NULL,
	"source_crawl_run_id" uuid,
	"source_snapshot_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"source" "source_code" NOT NULL,
	"image_url" text NOT NULL,
	"image_role" text,
	"position" integer,
	"width" integer,
	"height" integer,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"last_raw_listing_record_id" uuid
);
--> statement-breakpoint
CREATE TABLE "listing_sightings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"crawl_run_id" uuid NOT NULL,
	"search_query_id" uuid NOT NULL,
	"source_fetch_id" uuid NOT NULL,
	"raw_listing_record_id" uuid NOT NULL,
	"crawl_kind" "crawl_kind" NOT NULL,
	"seen_at" timestamp with time zone NOT NULL,
	"page_number" integer,
	"position" integer,
	"source_list_id" text,
	"source_status_label" text
);
--> statement-breakpoint
CREATE TABLE "listing_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"raw_listing_record_id" uuid NOT NULL,
	"parser_version" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"availability" "listing_availability" NOT NULL,
	"source_status_label" text,
	"asking_price_eur" integer,
	"observed_sold_price_eur" integer,
	"price_source_label" text,
	"mileage_km" integer,
	"mileage_source_label" text,
	"year_model" integer,
	"make_source_label" text,
	"model_source_label" text,
	"fuel_type_source_label" text,
	"transmission_source_label" text,
	"body_type_source_label" text,
	"color_source_label" text,
	"seller_source_label" text,
	"seller_type_source_label" text,
	"normalized_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"change_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "source_code" NOT NULL,
	"source_listing_id" text NOT NULL,
	"vehicle_category" "vehicle_category" NOT NULL,
	"canonical_source_url" text,
	"current_availability" "listing_availability" DEFAULT 'unknown' NOT NULL,
	"availability_last_confirmed_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"last_raw_listing_record_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_listing_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "source_code" NOT NULL,
	"source_listing_id" text NOT NULL,
	"crawl_run_id" uuid NOT NULL,
	"source_fetch_id" uuid NOT NULL,
	"record_kind" "raw_listing_record_kind" NOT NULL,
	"source_url" text,
	"source_payload" jsonb NOT NULL,
	"source_html_fragment" text,
	"source_payload_sha256" text NOT NULL,
	"parser_version" text NOT NULL,
	"parser_status" "parser_status" NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"parse_error" text
);
--> statement-breakpoint
CREATE TABLE "reprocessing_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parser_version_from" text,
	"parser_version_to" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"raw_record_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_fetches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crawl_run_id" uuid NOT NULL,
	"search_query_id" uuid NOT NULL,
	"source" "source_code" NOT NULL,
	"fetch_kind" "fetch_kind" NOT NULL,
	"page_number" integer,
	"source_url" text NOT NULL,
	"request_headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_status" integer,
	"response_content_type" text,
	"response_body_shape" "fetch_body_shape" NOT NULL,
	"response_body_sha256" text,
	"response_bytes" integer,
	"fetched_at" timestamp with time zone NOT NULL,
	"duration_ms" integer,
	"error_type" text,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "source_search_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "source_code" NOT NULL,
	"vehicle_category" "vehicle_category" NOT NULL,
	"crawl_kind" "crawl_kind" NOT NULL,
	"entry_path" text NOT NULL,
	"source_search_hash" text NOT NULL,
	"query_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"target_cadence_interval" interval,
	"last_complete_crawl_run_id" uuid,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "crawl_runs" ADD CONSTRAINT "crawl_runs_search_query_id_source_search_queries_id_fk" FOREIGN KEY ("search_query_id") REFERENCES "public"."source_search_queries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_events" ADD CONSTRAINT "listing_events_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_events" ADD CONSTRAINT "listing_events_source_crawl_run_id_crawl_runs_id_fk" FOREIGN KEY ("source_crawl_run_id") REFERENCES "public"."crawl_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_events" ADD CONSTRAINT "listing_events_source_snapshot_id_listing_snapshots_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."listing_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_images" ADD CONSTRAINT "listing_images_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_images" ADD CONSTRAINT "listing_images_last_raw_listing_record_id_raw_listing_records_id_fk" FOREIGN KEY ("last_raw_listing_record_id") REFERENCES "public"."raw_listing_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_sightings" ADD CONSTRAINT "listing_sightings_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_sightings" ADD CONSTRAINT "listing_sightings_crawl_run_id_crawl_runs_id_fk" FOREIGN KEY ("crawl_run_id") REFERENCES "public"."crawl_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_sightings" ADD CONSTRAINT "listing_sightings_search_query_id_source_search_queries_id_fk" FOREIGN KEY ("search_query_id") REFERENCES "public"."source_search_queries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_sightings" ADD CONSTRAINT "listing_sightings_source_fetch_id_source_fetches_id_fk" FOREIGN KEY ("source_fetch_id") REFERENCES "public"."source_fetches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_sightings" ADD CONSTRAINT "listing_sightings_raw_listing_record_id_raw_listing_records_id_fk" FOREIGN KEY ("raw_listing_record_id") REFERENCES "public"."raw_listing_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_snapshots" ADD CONSTRAINT "listing_snapshots_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_snapshots" ADD CONSTRAINT "listing_snapshots_raw_listing_record_id_raw_listing_records_id_fk" FOREIGN KEY ("raw_listing_record_id") REFERENCES "public"."raw_listing_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_last_raw_listing_record_id_raw_listing_records_id_fk" FOREIGN KEY ("last_raw_listing_record_id") REFERENCES "public"."raw_listing_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_listing_records" ADD CONSTRAINT "raw_listing_records_crawl_run_id_crawl_runs_id_fk" FOREIGN KEY ("crawl_run_id") REFERENCES "public"."crawl_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_listing_records" ADD CONSTRAINT "raw_listing_records_source_fetch_id_source_fetches_id_fk" FOREIGN KEY ("source_fetch_id") REFERENCES "public"."source_fetches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_fetches" ADD CONSTRAINT "source_fetches_crawl_run_id_crawl_runs_id_fk" FOREIGN KEY ("crawl_run_id") REFERENCES "public"."crawl_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_fetches" ADD CONSTRAINT "source_fetches_search_query_id_source_search_queries_id_fk" FOREIGN KEY ("search_query_id") REFERENCES "public"."source_search_queries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crawl_runs_search_query_created_idx" ON "crawl_runs" USING btree ("search_query_id","created_at");--> statement-breakpoint
CREATE INDEX "crawl_runs_source_kind_status_created_idx" ON "crawl_runs" USING btree ("source","crawl_kind","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_images_listing_url_uq" ON "listing_images" USING btree ("listing_id","image_url");--> statement-breakpoint
CREATE INDEX "listing_images_listing_position_idx" ON "listing_images" USING btree ("listing_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_sightings_run_listing_fetch_uq" ON "listing_sightings" USING btree ("crawl_run_id","listing_id","source_fetch_id");--> statement-breakpoint
CREATE INDEX "listing_sightings_listing_seen_idx" ON "listing_sightings" USING btree ("listing_id","seen_at");--> statement-breakpoint
CREATE INDEX "listing_sightings_search_query_seen_idx" ON "listing_sightings" USING btree ("search_query_id","seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_snapshots_listing_hash_uq" ON "listing_snapshots" USING btree ("listing_id","change_hash");--> statement-breakpoint
CREATE INDEX "listing_snapshots_listing_observed_idx" ON "listing_snapshots" USING btree ("listing_id","observed_at");--> statement-breakpoint
CREATE INDEX "listing_snapshots_availability_observed_idx" ON "listing_snapshots" USING btree ("availability","observed_at");--> statement-breakpoint
CREATE INDEX "listing_snapshots_make_model_idx" ON "listing_snapshots" USING btree ("make_source_label","model_source_label");--> statement-breakpoint
CREATE INDEX "listing_snapshots_asking_price_idx" ON "listing_snapshots" USING btree ("asking_price_eur");--> statement-breakpoint
CREATE INDEX "listing_snapshots_sold_price_idx" ON "listing_snapshots" USING btree ("observed_sold_price_eur");--> statement-breakpoint
CREATE INDEX "listing_snapshots_mileage_idx" ON "listing_snapshots" USING btree ("mileage_km");--> statement-breakpoint
CREATE INDEX "listing_snapshots_year_model_idx" ON "listing_snapshots" USING btree ("year_model");--> statement-breakpoint
CREATE UNIQUE INDEX "listings_source_listing_uq" ON "listings" USING btree ("source","source_listing_id");--> statement-breakpoint
CREATE INDEX "listings_availability_last_seen_idx" ON "listings" USING btree ("current_availability","last_seen_at");--> statement-breakpoint
CREATE INDEX "listings_category_availability_idx" ON "listings" USING btree ("vehicle_category","current_availability");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_listing_records_fetch_listing_kind_uq" ON "raw_listing_records" USING btree ("source_fetch_id","source_listing_id","record_kind");--> statement-breakpoint
CREATE INDEX "raw_listing_records_source_listing_idx" ON "raw_listing_records" USING btree ("source","source_listing_id");--> statement-breakpoint
CREATE INDEX "raw_listing_records_crawl_run_idx" ON "raw_listing_records" USING btree ("crawl_run_id");--> statement-breakpoint
CREATE INDEX "raw_listing_records_parser_status_idx" ON "raw_listing_records" USING btree ("parser_version","parser_status");--> statement-breakpoint
CREATE UNIQUE INDEX "source_fetches_crawl_run_kind_page_uq" ON "source_fetches" USING btree ("crawl_run_id","fetch_kind","page_number");--> statement-breakpoint
CREATE INDEX "source_fetches_search_query_page_idx" ON "source_fetches" USING btree ("search_query_id","page_number");--> statement-breakpoint
CREATE INDEX "source_fetches_response_status_idx" ON "source_fetches" USING btree ("response_status");--> statement-breakpoint
CREATE INDEX "source_fetches_response_body_shape_idx" ON "source_fetches" USING btree ("response_body_shape");--> statement-breakpoint
CREATE UNIQUE INDEX "source_search_queries_source_category_kind_hash_uq" ON "source_search_queries" USING btree ("source","vehicle_category","crawl_kind","source_search_hash");--> statement-breakpoint
CREATE INDEX "source_search_queries_enabled_priority_idx" ON "source_search_queries" USING btree ("enabled","priority");--> statement-breakpoint
CREATE INDEX "source_search_queries_source_kind_enabled_idx" ON "source_search_queries" USING btree ("source","crawl_kind","enabled");--> statement-breakpoint
INSERT INTO "source_search_queries" (
	"source",
	"vehicle_category",
	"crawl_kind",
	"entry_path",
	"source_search_hash",
	"query_params",
	"enabled",
	"priority",
	"created_at",
	"updated_at",
	"notes"
) VALUES
	(
		'nettiauto',
		'passenger_car',
		'current',
		'/vaihtoautot',
		'P2236304442',
		'{"haku":"P2236304442"}'::jsonb,
		true,
		10,
		now(),
		now(),
		'Default current passenger-car Nettiauto search query.'
	),
	(
		'nettiauto',
		'passenger_car',
		'sold',
		'/hakutulokset',
		'P82984997',
		'{"haku":"P82984997"}'::jsonb,
		true,
		50,
		now(),
		now(),
		'Default sold passenger-car Nettiauto search query.'
	)
ON CONFLICT ("source", "vehicle_category", "crawl_kind", "source_search_hash")
DO NOTHING;
