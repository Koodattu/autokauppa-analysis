import { parseWorkerConfig } from "@nettiauto/config";
import { closeSqlClient, createSqlClient } from "@nettiauto/db";
import {
  NETTIAUTO_DETAIL_NORMALIZATION_SCHEMA_VERSION,
  upgradeStoredNettiautoDetailToV4,
} from "@nettiauto/domain";
import type { Task } from "graphile-worker";
import { z } from "zod";

const BATCH_SIZE = 2_000;
const payloadSchema = z.object({
  runId: z.string().uuid().optional(),
  afterListingId: z.string().uuid().optional(),
});

const task: Task = async (payload, helpers) => {
  const command = payloadSchema.parse(payload ?? {});
  const config = parseWorkerConfig();
  const sql = createSqlClient(config.DATABASE_URL, 1);
  try {
    const runId = command.runId ?? await createRun(sql);
    const sourceRows = await sql<{
      listingId: string;
      sourceParserVersion: string;
      sourceRawListingRecordId: string;
      sourceFetchId: string;
      fetchedAt: string;
      sourceUpdatedDate: string | null;
      sourcePayload: unknown;
    }[]>`
      select
        listing.id as "listingId",
        detail.parser_version as "sourceParserVersion",
        detail.id as "sourceRawListingRecordId",
        detail.source_fetch_id as "sourceFetchId",
        detail.captured_at::text as "fetchedAt",
        detail.source_updated_date::text as "sourceUpdatedDate",
        detail.source_payload as "sourcePayload"
      from listings listing
      join lateral (
        select record.*
        from raw_listing_records record
        where record.source = listing.source
          and record.source_listing_id = listing.source_listing_id
          and record.record_kind = 'detail_page'
          and record.parser_status = 'parsed'
          and record.parser_version = 'nettiauto-detail-v2'
        order by record.captured_at desc
        limit 1
      ) detail on true
      where listing.source = 'nettiauto'
        and listing.id > coalesce(
          ${command.afterListingId ?? null}::uuid,
          '00000000-0000-0000-0000-000000000000'::uuid
        )
        and not exists (
          select 1 from listing_details existing where existing.listing_id = listing.id
        )
      order by listing.id
      limit ${BATCH_SIZE}
    `;

    const failures: string[] = [];
    const storageRows = sourceRows.flatMap((row) => {
      const upgraded = upgradeStoredNettiautoDetailToV4(
        row.sourcePayload,
        row.sourceParserVersion,
      );
      if (!upgraded) {
        failures.push(row.listingId);
        return [];
      }
      const { sourcePayload: _, ...sourceRow } = row;
      return [{
        ...sourceRow,
        normalizationSchemaVersion: NETTIAUTO_DETAIL_NORMALIZATION_SCHEMA_VERSION,
        ...upgraded,
      }];
    });

    const insertedRows = storageRows.length > 0
      ? await sql<{ listingId: string }[]>`
        with batch as (
          select *
          from jsonb_to_recordset(${sql.json(storageRows as never)}::jsonb) as row(
            "listingId" uuid,
            "sourceParserVersion" text,
            "normalizationSchemaVersion" text,
            "sourceRawListingRecordId" uuid,
            "sourceFetchId" uuid,
            "fetchedAt" timestamptz,
            "sourceUpdatedDate" date,
            "vin" text,
            "torqueNm" integer,
            "batteryCapacityKwh" numeric,
            "electricRangeKm" integer,
            "chargingTypeSourceLabel" text,
            "chargingPowerAcKw" numeric,
            "chargingPowerDcKw" numeric,
            "batteryWarrantySourceLabel" text,
            "batteryWarrantyMonths" integer,
            "batteryWarrantyKm" integer,
            "electricConsumptionSourceLabel" text,
            "electricConsumptionCombinedKwh100Km" numeric,
            "ownerCount" integer,
            "normalizedData" jsonb
          )
        )
        insert into listing_details (
          listing_id,
          source_parser_version,
          normalization_schema_version,
          source_raw_listing_record_id,
          source_fetch_id,
          fetched_at,
          source_updated_date,
          vin,
          torque_nm,
          battery_capacity_kwh,
          electric_range_km,
          charging_type_source_label,
          charging_power_ac_kw,
          charging_power_dc_kw,
          battery_warranty_source_label,
          battery_warranty_months,
          battery_warranty_km,
          electric_consumption_source_label,
          electric_consumption_combined_kwh_100km,
          owner_count,
          normalized_data
        )
        select
          "listingId",
          "sourceParserVersion",
          "normalizationSchemaVersion",
          "sourceRawListingRecordId",
          "sourceFetchId",
          "fetchedAt",
          "sourceUpdatedDate",
          "vin",
          "torqueNm",
          "batteryCapacityKwh",
          "electricRangeKm",
          "chargingTypeSourceLabel",
          "chargingPowerAcKw",
          "chargingPowerDcKw",
          "batteryWarrantySourceLabel",
          "batteryWarrantyMonths",
          "batteryWarrantyKm",
          "electricConsumptionSourceLabel",
          "electricConsumptionCombinedKwh100Km",
          "ownerCount",
          "normalizedData"
        from batch
        on conflict (listing_id) do nothing
        returning listing_id as "listingId"
      `
      : [];

    await sql`
      update reprocessing_runs
      set
        success_count = success_count + ${insertedRows.length},
        failure_count = failure_count + ${failures.length},
        updated_at = now()
      where id = ${runId}
    `;

    const lastRow = sourceRows.at(-1);
    if (sourceRows.length === BATCH_SIZE && lastRow) {
      await helpers.addJob(
        "backfill_nettiauto_v2_details",
        { runId, afterListingId: lastRow.listingId },
        {
          queueName: "nettiauto-v2-detail-backfill",
          maxAttempts: 5,
          jobKey: `nettiauto:v2-detail-backfill:${runId}:${lastRow.listingId}`,
        },
      );
      return;
    }

    await sql`
      update reprocessing_runs
      set status = case when failure_count = 0 then 'completed' else 'partial' end,
          finished_at = now(),
          updated_at = now()
      where id = ${runId}
    `;
  } finally {
    await closeSqlClient(sql);
  }
};

async function createRun(sql: ReturnType<typeof createSqlClient>) {
  const [counts] = await sql<{ targetCount: number }[]>`
    select count(*)::int as "targetCount"
    from listings listing
    where listing.source = 'nettiauto'
      and not exists (select 1 from listing_details detail where detail.listing_id = listing.id)
      and exists (
        select 1
        from raw_listing_records record
        where record.source = listing.source
          and record.source_listing_id = listing.source_listing_id
          and record.record_kind = 'detail_page'
          and record.parser_status = 'parsed'
          and record.parser_version = 'nettiauto-detail-v2'
      )
  `;
  const [run] = await sql<{ id: string }[]>`
    insert into reprocessing_runs (
      parser_version_from,
      parser_version_to,
      status,
      started_at,
      raw_record_count,
      notes
    )
    values (
      'nettiauto-detail-v2',
      ${NETTIAUTO_DETAIL_NORMALIZATION_SCHEMA_VERSION},
      'running',
      now(),
      ${counts?.targetCount ?? 0},
      'Offline bounded normalization into listing_details; source parser provenance remains v2.'
    )
    returning id
  `;
  if (!run) {
    throw new Error("Failed to create v2 detail normalization run.");
  }
  return run.id;
}

export default task;
