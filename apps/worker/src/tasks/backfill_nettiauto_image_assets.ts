import { parseWorkerConfig } from "@nettiauto/config";
import { closeSqlClient, createSqlClient } from "@nettiauto/db";
import { parseNettiautoImageAsset } from "@nettiauto/domain";
import type { Task } from "graphile-worker";
import { z } from "zod";

const BATCH_SIZE = 20_000;
const payloadSchema = z.object({ afterImageId: z.string().uuid().optional() });

const task: Task = async (payload, helpers) => {
  const command = payloadSchema.parse(payload ?? {});
  const config = parseWorkerConfig();
  const sql = createSqlClient(config.DATABASE_URL, 1);
  try {
    const rows = await sql<{
      id: string;
      listingId: string;
      imageUrl: string;
      imageRole: string | null;
      position: number | null;
      firstSeenAt: string;
      lastSeenAt: string;
      lastRawListingRecordId: string;
    }[]>`
      select
        id,
        listing_id as "listingId",
        image_url as "imageUrl",
        image_role as "imageRole",
        position,
        first_seen_at::text as "firstSeenAt",
        last_seen_at::text as "lastSeenAt",
        last_raw_listing_record_id::text as "lastRawListingRecordId"
      from listing_images
      where id > coalesce(
        ${command.afterImageId ?? null}::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid
      )
        and last_raw_listing_record_id is not null
      order by id
      limit ${BATCH_SIZE}
    `;

    const assets = new Map<string, {
      listingId: string;
      assetPath: string;
      variantMask: number;
      imageRole: string | null;
      position: number | null;
      firstSeenAt: string;
      lastSeenAt: string;
      lastRawListingRecordId: string;
    }>();
    for (const row of rows) {
      const parsed = parseNettiautoImageAsset(row.imageUrl);
      if (!parsed) {
        continue;
      }
      const key = `${row.listingId}\u0000${parsed.assetPath}`;
      const existing = assets.get(key);
      const rowIsNewer = !existing || Date.parse(row.lastSeenAt) >= Date.parse(existing.lastSeenAt);
      assets.set(key, {
        listingId: row.listingId,
        assetPath: parsed.assetPath,
        variantMask: (existing?.variantMask ?? 0) | parsed.variantMask,
        imageRole: rowIsNewer ? row.imageRole : existing.imageRole,
        position: rowIsNewer ? row.position : existing.position,
        firstSeenAt:
          !existing || Date.parse(row.firstSeenAt) < Date.parse(existing.firstSeenAt)
            ? row.firstSeenAt
            : existing.firstSeenAt,
        lastSeenAt: rowIsNewer ? row.lastSeenAt : existing.lastSeenAt,
        lastRawListingRecordId: rowIsNewer
          ? row.lastRawListingRecordId
          : existing.lastRawListingRecordId,
      });
    }

    if (assets.size > 0) {
      await sql`
        with batch as (
          select *
          from jsonb_to_recordset(${sql.json([...assets.values()])}::jsonb) as row(
            "listingId" uuid,
            "assetPath" text,
            "variantMask" integer,
            "imageRole" text,
            "position" integer,
            "firstSeenAt" timestamptz,
            "lastSeenAt" timestamptz,
            "lastRawListingRecordId" uuid
          )
        )
        insert into listing_image_assets (
          listing_id,
          asset_path,
          variant_mask,
          image_role,
          position,
          first_seen_at,
          last_seen_at,
          last_raw_listing_record_id
        )
        select
          "listingId",
          "assetPath",
          "variantMask",
          "imageRole",
          "position",
          "firstSeenAt",
          "lastSeenAt",
          "lastRawListingRecordId"
        from batch
        on conflict (listing_id, asset_path)
        do update set
          variant_mask = listing_image_assets.variant_mask | excluded.variant_mask,
          image_role = case
            when excluded.last_seen_at >= listing_image_assets.last_seen_at then excluded.image_role
            else listing_image_assets.image_role
          end,
          position = case
            when excluded.last_seen_at >= listing_image_assets.last_seen_at then excluded.position
            else listing_image_assets.position
          end,
          first_seen_at = least(listing_image_assets.first_seen_at, excluded.first_seen_at),
          last_seen_at = greatest(listing_image_assets.last_seen_at, excluded.last_seen_at),
          last_raw_listing_record_id = case
            when excluded.last_seen_at >= listing_image_assets.last_seen_at
              then excluded.last_raw_listing_record_id
            else listing_image_assets.last_raw_listing_record_id
          end
      `;
    }

    const lastRow = rows.at(-1);
    if (rows.length === BATCH_SIZE && lastRow) {
      await helpers.addJob(
        "backfill_nettiauto_image_assets",
        { afterImageId: lastRow.id },
        {
          queueName: "nettiauto-image-asset-backfill",
          maxAttempts: 5,
          jobKey: `nettiauto:image-asset-backfill:${lastRow.id}`,
        },
      );
    }
  } finally {
    await closeSqlClient(sql);
  }
};

export default task;
