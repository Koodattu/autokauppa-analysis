SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE raw_listing_payloads (
  digest text PRIMARY KEY,
  codec text NOT NULL CHECK (codec = 'brotli-json-v1'),
  decoded_bytes integer NOT NULL CHECK (decoded_bytes BETWEEN 0 AND 67108864),
  record_count integer NOT NULL CHECK (record_count > 0),
  content bytea NOT NULL
);
--> statement-breakpoint
ALTER TABLE raw_listing_payloads ALTER COLUMN content SET STORAGE EXTERNAL;
--> statement-breakpoint
ALTER TABLE raw_listing_records ALTER COLUMN source_payload DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE raw_listing_records ADD COLUMN payload_digest text REFERENCES raw_listing_payloads(digest);
--> statement-breakpoint
ALTER TABLE raw_listing_records ADD COLUMN payload_index integer;
--> statement-breakpoint
ALTER TABLE raw_listing_records ADD CONSTRAINT raw_listing_records_evidence_ck CHECK (
  (source_payload IS NOT NULL AND payload_digest IS NULL AND payload_index IS NULL)
  OR (source_payload IS NULL AND source_html_fragment IS NULL AND payload_digest IS NOT NULL AND payload_index IS NOT NULL AND payload_index >= 0)
);
--> statement-breakpoint
CREATE INDEX raw_listing_records_payload_idx ON raw_listing_records(payload_digest) WHERE payload_digest IS NOT NULL;
--> statement-breakpoint
CREATE TABLE listing_legacy_image_bundles (
  listing_id uuid PRIMARY KEY REFERENCES listings(id),
  digest text NOT NULL,
  codec text NOT NULL CHECK (codec = 'brotli-json-v1'),
  decoded_bytes integer NOT NULL CHECK (decoded_bytes BETWEEN 0 AND 67108864),
  row_count integer NOT NULL CHECK (row_count > 0),
  content bytea NOT NULL
);
--> statement-breakpoint
ALTER TABLE listing_legacy_image_bundles ALTER COLUMN content SET STORAGE EXTERNAL;
--> statement-breakpoint
CREATE TABLE storage_migration_progress (
  stage text PRIMARY KEY,
  cursor_id uuid,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ready', 'completed', 'partial')),
  run_id uuid REFERENCES reprocessing_runs(id),
  processed_count bigint NOT NULL DEFAULT 0,
  migrated_count bigint NOT NULL DEFAULT 0,
  skipped_count bigint NOT NULL DEFAULT 0,
  error_count bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE storage_migration_exceptions (
  stage text NOT NULL REFERENCES storage_migration_progress(stage),
  source_id uuid NOT NULL,
  reason text NOT NULL,
  PRIMARY KEY (stage, source_id)
);
--> statement-breakpoint
CREATE FUNCTION guard_legacy_image_writes() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE migration_status text;
BEGIN
  SELECT status INTO migration_status FROM storage_migration_progress WHERE stage = 'legacy_images' FOR SHARE;
  IF migration_status = 'completed' THEN
    RAISE EXCEPTION 'Legacy image storage is read-only after verified migration';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER guard_legacy_image_writes BEFORE INSERT OR UPDATE OR DELETE ON listing_images
FOR EACH STATEMENT EXECUTE FUNCTION guard_legacy_image_writes();
--> statement-breakpoint
CREATE FUNCTION guard_inline_raw_writes() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE migration_status text;
BEGIN
  IF NEW.source_payload IS NOT NULL THEN
    SELECT status INTO migration_status FROM storage_migration_progress WHERE stage = 'raw_evidence' FOR SHARE;
    IF migration_status = 'completed' THEN
      RAISE EXCEPTION 'Inline raw evidence is read-only after verified migration';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER guard_inline_raw_writes BEFORE INSERT OR UPDATE ON raw_listing_records
FOR EACH ROW EXECUTE FUNCTION guard_inline_raw_writes();
