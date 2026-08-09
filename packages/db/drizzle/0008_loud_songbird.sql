ALTER TABLE "crawl_runs" ADD COLUMN "detail_jobs_scheduled" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "source_search_queries" ADD COLUMN "paused_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source_search_queries" ADD COLUMN "pause_reason" text;