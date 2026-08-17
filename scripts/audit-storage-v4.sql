\set ON_ERROR_STOP on

select
  count(*)::int as detail_rows,
  count(*) filter (where source_parser_version = 'nettiauto-detail-v2')::int as normalized_from_v2,
  count(*) filter (where source_parser_version = 'nettiauto-detail-v4')::int as fetched_with_v4,
  count(vin)::int as vin_rows,
  count(torque_nm)::int as torque_rows,
  count(battery_capacity_kwh)::int as battery_capacity_rows,
  count(electric_range_km)::int as electric_range_rows,
  count(charging_type_source_label)::int as charging_type_rows,
  count(charging_power_ac_kw)::int as charging_power_ac_rows,
  count(charging_power_dc_kw)::int as charging_power_dc_rows,
  count(battery_warranty_source_label)::int as battery_warranty_rows,
  count(electric_consumption_source_label)::int as electric_consumption_rows,
  count(owner_count)::int as owner_count_rows
from listing_details;

select
  count(*) filter (where normalized_data ? 'additionalSourceFields')::int
    as unbounded_additional_field_rows,
  count(*) filter (where normalization_schema_version <> 'nettiauto-detail-v4')::int
    as wrong_normalization_schema_rows,
  count(*) filter (where vin is not null and vin !~ '^[A-HJ-NPR-Z0-9]{17}$')::int
    as invalid_vin_rows,
  count(*) filter (where torque_nm not between 1 and 5000)::int
    as implausible_torque_rows,
  count(*) filter (where battery_capacity_kwh not between 0.1 and 500)::int
    as implausible_battery_capacity_rows,
  count(*) filter (where owner_count not between 0 and 100)::int
    as implausible_owner_count_rows
from listing_details;

select
  count(*)::bigint as compact_asset_rows,
  count(distinct listing_id)::int as listings_with_compact_assets,
  round(avg(octet_length(asset_path)), 1) as average_asset_path_bytes,
  count(*) filter (where variant_mask <= 0 or variant_mask > 15)::bigint as invalid_variant_masks
from listing_image_assets;

select
  count(*)::bigint as legacy_image_rows,
  count(*) filter (where image_url like '%?%')::bigint as queried_urls,
  round(avg(octet_length(image_url)), 1) as average_legacy_url_bytes
from listing_images;

select
  target_parser_version,
  selection,
  status,
  target_count,
  scheduled_count,
  succeeded_count,
  unavailable_count,
  failed_count,
  started_at,
  finished_at
from detail_backfill_runs
order by created_at desc;

select
  parser_version_from,
  parser_version_to,
  status,
  raw_record_count,
  success_count,
  failure_count,
  started_at,
  finished_at
from reprocessing_runs
order by created_at desc
limit 10;
