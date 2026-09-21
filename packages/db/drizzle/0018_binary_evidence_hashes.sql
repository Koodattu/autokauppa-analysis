SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM raw_listing_records WHERE source_payload_sha256 !~ '^[0-9a-f]{64}$'
    OR (payload_digest IS NOT NULL AND payload_digest !~ '^[0-9a-f]{64}$'))
    OR EXISTS (SELECT 1 FROM raw_listing_payloads WHERE digest !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'Evidence hashes are not canonical SHA-256; refusing conversion';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE raw_listing_records DROP CONSTRAINT raw_listing_records_payload_digest_fkey;
--> statement-breakpoint
ALTER TABLE raw_listing_payloads ALTER COLUMN digest TYPE bytea USING decode(digest,'hex');
--> statement-breakpoint
ALTER TABLE raw_listing_records
  ALTER COLUMN payload_digest TYPE bytea USING decode(payload_digest,'hex'),
  ALTER COLUMN source_payload_sha256 TYPE bytea USING decode(source_payload_sha256,'hex');
--> statement-breakpoint
ALTER TABLE raw_listing_payloads ADD CONSTRAINT raw_listing_payloads_digest_length_ck CHECK(octet_length(digest)=32);
--> statement-breakpoint
ALTER TABLE raw_listing_records
  ADD CONSTRAINT raw_listing_records_payload_digest_fkey FOREIGN KEY(payload_digest) REFERENCES raw_listing_payloads(digest),
  ADD CONSTRAINT raw_listing_records_hash_length_ck CHECK(octet_length(source_payload_sha256)=32 AND
    (payload_digest IS NULL OR octet_length(payload_digest)=32));
