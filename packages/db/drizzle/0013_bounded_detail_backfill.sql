ALTER TABLE "detail_backfill_runs" ADD COLUMN "attempted_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "detail_backfill_runs" ADD COLUMN "cancelled_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "detail_backfill_runs" ADD COLUMN "blocked_until" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "detail_backfill_runs" ADD COLUMN "block_reason" text;
--> statement-breakpoint
ALTER TABLE "detail_backfill_runs" ADD COLUMN "next_dispatch_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "detail_backfill_runs" ADD COLUMN "last_progress_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "detail_backfill_runs" ADD COLUMN "cancelled_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE "detail_backfill_targets" (
	"run_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "detail_backfill_targets_run_id_listing_id_pk" PRIMARY KEY("run_id","listing_id"),
	CONSTRAINT "detail_backfill_targets_state_ck" CHECK ("state" IN ('pending', 'queued')),
	CONSTRAINT "detail_backfill_targets_run_id_detail_backfill_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."detail_backfill_runs"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "detail_backfill_targets_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "detail_backfill_targets_dispatch_idx" ON "detail_backfill_targets" USING btree ("run_id","state","next_attempt_at","listing_id");
--> statement-breakpoint
WITH contaminated_queries AS (
	SELECT sq.id
	FROM "source_search_queries" sq
	WHERE sq.pause_reason IN ('blocked', 'rate_limited', 'redirected', 'unexpected_response_body_shape')
		AND EXISTS (
			SELECT 1
			FROM "source_fetches" sf
			WHERE sf.search_query_id = sq.id
				AND sf.detail_backfill_run_id IS NOT NULL
				AND sf.error_type = sq.pause_reason
				AND sq.last_failure_at BETWEEN sf.fetched_at - interval '1 minute'
					AND sf.fetched_at + interval '1 minute'
		)
)
UPDATE "source_search_queries" sq
SET
	last_failure_at = (
		SELECT max(sf.fetched_at)
		FROM "source_fetches" sf
		WHERE sf.search_query_id = sq.id
			AND sf.crawl_run_id IS NOT NULL
			AND sf.error_type IS NOT NULL
	),
	paused_until = NULL,
	pause_reason = NULL,
	updated_at = now()
FROM contaminated_queries contaminated
WHERE sq.id = contaminated.id;
