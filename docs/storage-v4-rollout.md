# Detail v4 and compact-media rollout

This rollout is intentionally additive. Do not delete `raw_listing_records`, `listing_images`, or
detail keys from snapshots until the new tables have been populated and audited against the local
production clone.

## What v4 stores

`listing_details` owns the latest parsed detail state independently of the latest search snapshot.
It retains source parser provenance separately from the normalization schema version, so an offline
v2 normalization remains labeled `nettiauto-detail-v2` while using the bounded v4 storage shape.

VIN is internal data. It is stored in `listing_details` and is not part of the Product API schema.
The previously generic additional fields are bounded to the nine labels observed in the audit:

- torque;
- battery capacity;
- electric range;
- charging type;
- AC charging power;
- battery warranty;
- electric consumption;
- maximum DC charging power; and
- owner count.

## Safe order

1. Apply migrations `0011_detail_v4_compact_media` and `0012_shared_hero_objects`.
2. Queue the database-only v2 normalization. It does not make network requests:

   ```sql
   select graphile_worker.add_job('backfill_nettiauto_v2_details', '{}'::json);
   ```

3. Queue the database-only image URL compaction. It derives logical CDN asset paths and skips signed,
   queried, placeholder, and unsupported URLs:

   ```sql
   select graphile_worker.add_job('backfill_nettiauto_image_assets', '{}'::json);
   ```

4. Compare counts, sampled values, image ordering, and Product API responses. Reads fall back to
   `listing_images` when a listing has not yet been compacted. The read-only baseline checks are in
   `scripts/audit-storage-v4.sql`.
5. Optionally queue the rate-spaced hero archive for all compacted listings. This fetches only the
   first available logical image, not the detail page or gallery:

   ```sql
   select graphile_worker.add_job('schedule_nettiauto_hero_backfill', '{}'::json);
   ```

6. With the crawler enabled and unpaused, queue the network backfill for listings that have no parsed
   detail or only v1 detail data:

   ```sql
   select graphile_worker.add_job('schedule_nettiauto_detail_backfill', '{}'::json);
   ```

   This creates a `detail_backfill_runs` row, schedules rate-spaced v4 detail jobs, and records every
   fetch against that run rather than an unrelated historical crawl run.
7. Audit `detail_backfill_runs`, `listing_details`, `listing_image_assets`, hero files, and public
   responses. Only a later migration should remove legacy rows or columns.

## Hero images

The worker archives only the first detail image, only from the allowlisted Nettiauto CDN. It is
auto-rotated, bounded to 960 pixels without enlargement, encoded as WebP quality 75, and written to
the `hero_images` volume using a content-addressed key. PostgreSQL stores metadata and the object key,
not image bytes. Caddy serves the immutable files under `/media/heroes/`.

At the measured audit average of about 48 KiB per hero, all 425,000 listings would require roughly
20 GiB outside PostgreSQL. In practice, historical source images that no longer resolve cannot be
recovered; failed images are not replaced with placeholders.

## Explicit non-goals of this migration

- It does not delete or rewrite production data.
- It does not queue any job automatically.
- It does not expose VIN publicly.
- It does not retain an open-ended `additionalSourceFields` object.
- It does not archive full galleries.
