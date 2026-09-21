SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE listing_gallery_bundles (
  listing_id uuid PRIMARY KEY REFERENCES listings(id),
  digest bytea NOT NULL CHECK(octet_length(digest)=32),
  decoded_bytes integer NOT NULL CHECK(decoded_bytes BETWEEN 0 AND 67108864),
  row_count integer NOT NULL CHECK(row_count>0),
  content bytea NOT NULL
);
--> statement-breakpoint
ALTER TABLE listing_gallery_bundles ALTER COLUMN content SET STORAGE EXTERNAL;
--> statement-breakpoint
CREATE TABLE listing_gallery_sources (
  listing_id uuid NOT NULL REFERENCES listing_gallery_bundles(listing_id),
  raw_listing_record_id uuid NOT NULL REFERENCES raw_listing_records(id),
  PRIMARY KEY(listing_id,raw_listing_record_id)
);
--> statement-breakpoint
CREATE INDEX listing_gallery_sources_raw_idx ON listing_gallery_sources(raw_listing_record_id);
