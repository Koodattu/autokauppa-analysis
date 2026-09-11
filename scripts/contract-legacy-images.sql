-- Run only after deploying the bundle reader and completing full image verification.
-- No CASCADE: unexpected database dependencies must stop the operation.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE listing_images IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE source_count bigint; packed_count bigint; migrated_count bigint;
BEGIN
  SELECT processed_count INTO migrated_count FROM storage_migration_progress
  WHERE stage = 'legacy_images' AND status = 'completed' AND error_count = 0 FOR UPDATE;
  IF migrated_count IS NULL THEN
    RAISE EXCEPTION 'Legacy image verification has not completed';
  END IF;
  SELECT count(*) INTO source_count FROM listing_images;
  SELECT coalesce(sum(row_count), 0) INTO packed_count FROM listing_legacy_image_bundles;
  IF source_count <> packed_count OR source_count <> migrated_count THEN
    RAISE EXCEPTION 'Legacy image census changed after verification';
  END IF;
END;
$$;
DROP TABLE listing_images;
COMMIT;
