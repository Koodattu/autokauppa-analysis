SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE normalized_payloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digest bytea NOT NULL CHECK (octet_length(digest)=32),
  decoded_bytes integer NOT NULL CHECK (decoded_bytes BETWEEN 0 AND 67108864),
  record_count integer NOT NULL CHECK (record_count > 0),
  content bytea NOT NULL
);
--> statement-breakpoint
ALTER TABLE normalized_payloads ALTER COLUMN content SET STORAGE EXTERNAL;
--> statement-breakpoint
ALTER TABLE listing_snapshots ADD COLUMN normalized_payload_id uuid REFERENCES normalized_payloads(id),
  ADD COLUMN normalized_payload_index integer,
  ADD CONSTRAINT listing_snapshots_payload_ck CHECK ((normalized_payload_id IS NULL AND normalized_payload_index IS NULL)
    OR (normalized_payload_id IS NOT NULL AND normalized_payload_index IS NOT NULL AND normalized_payload_index >= 0));
--> statement-breakpoint
ALTER TABLE listing_details ADD COLUMN normalized_payload_id uuid REFERENCES normalized_payloads(id),
  ADD COLUMN normalized_payload_index integer,
  ADD CONSTRAINT listing_details_payload_ck CHECK ((normalized_payload_id IS NULL AND normalized_payload_index IS NULL)
    OR (normalized_payload_id IS NOT NULL AND normalized_payload_index IS NOT NULL AND normalized_payload_index >= 0));
--> statement-breakpoint
CREATE INDEX listing_snapshots_payload_idx ON listing_snapshots(normalized_payload_id) WHERE normalized_payload_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX listing_details_payload_idx ON listing_details(normalized_payload_id) WHERE normalized_payload_id IS NOT NULL;
