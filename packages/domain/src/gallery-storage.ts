import type postgres from "postgres";
import type { StoredCompactListingImageRow } from "./listing-images";
import { packStorageValue, unpackStorageValue } from "./storage-codec";

type Query = postgres.Sql<Record<string, unknown>> | postgres.TransactionSql<Record<string, unknown>>;
export interface GalleryAsset {
  id: string; listing_id: string; asset_path: string; variant_mask: number;
  image_role: string | null; position: number | null; first_seen_at: string; last_seen_at: string;
  last_raw_listing_record_id: string;
}
const columns = `id uuid, listing_id uuid, asset_path text, variant_mask integer, image_role text,
  position integer, first_seen_at timestamptz, last_seen_at timestamptz, last_raw_listing_record_id uuid`;

export async function readGalleryAssets(sql: Query, listingId: string): Promise<GalleryAsset[]> {
  const [result] = await sql<Array<{ digest: string | null; codec: string; decodedBytes: number; content: Buffer; count: number; inline: GalleryAsset[] }>>`
    select encode(b.digest,'hex') as digest, 'brotli-json-v1' as codec, b.decoded_bytes as "decodedBytes", b.content, b.row_count as count,
      coalesce((select jsonb_agg(to_jsonb(a) order by a.asset_path) from listing_image_assets a where a.listing_id=${listingId}),'[]'::jsonb) as inline
    from (select 1) singleton left join listing_gallery_bundles b on b.listing_id=${listingId}
  `;
  if (!result) throw new Error("Missing gallery query result");
  const packed = result.digest === null ? null : { ...result, digest: result.digest };
  const values = packed ? unpackStorageValue(packed) : [];
  if (!Array.isArray(values) || (packed && values.length !== packed.count) || values.some(row =>
    !row || typeof row.id !== "string" || row.listing_id !== listingId || typeof row.asset_path !== "string" ||
    typeof row.last_raw_listing_record_id !== "string")) throw new Error("Invalid gallery bundle");
  const inline = result.inline;
  if (inline.some(row => values.some(value => value.asset_path === row.asset_path))) {
    throw new Error("Gallery has overlapping inline and compressed assets");
  }
  return [...values, ...inline];
}

export async function storeGalleryAssets(sql: Query, listingId: string, rows: GalleryAsset[]) {
  if (!rows.length) return;
  const packed = packStorageValue(rows);
  const [saved] = await sql<Array<{ digest: string; codec: string; decodedBytes: number; content: Buffer }>>`
    insert into listing_gallery_bundles(listing_id,digest,decoded_bytes,row_count,content)
    values (${listingId},${Buffer.from(packed.digest,"hex")},${packed.decodedBytes},${rows.length},${packed.content})
    on conflict(listing_id) do update set digest=excluded.digest, decoded_bytes=excluded.decoded_bytes,
      row_count=excluded.row_count,content=excluded.content
    returning encode(digest,'hex') as digest,'brotli-json-v1' as codec,decoded_bytes as "decodedBytes",content
  `;
  if (!saved || JSON.stringify(unpackStorageValue(saved)) !== JSON.stringify(rows)) throw new Error("Gallery round-trip mismatch");
  const rawIds = [...new Set(rows.map(row => row.last_raw_listing_record_id))];
  await sql`insert into listing_gallery_sources(listing_id,raw_listing_record_id)
    select ${listingId}::uuid,unnest(${rawIds}::uuid[]) on conflict do nothing`;
  await sql`delete from listing_gallery_sources where listing_id=${listingId} and not(raw_listing_record_id=any(${rawIds}::uuid[]))`;
  await sql`delete from listing_image_assets where listing_id=${listingId}`;
}

export async function readPublicGallery(sql: Query, listingId: string): Promise<StoredCompactListingImageRow[]> {
  const rows = await readGalleryAssets(sql, listingId);
  if (!rows.length) return [];
  // Keep timestamp comparison and null ordering in PostgreSQL, including microsecond precision.
  return sql.unsafe<StoredCompactListingImageRow[]>(`select asset.asset_path as "assetPath",
    asset.variant_mask as "variantMask",asset.image_role as role,asset.position,
    asset.last_raw_listing_record_id::text as "cohortId",r.captured_at::text as "capturedAt",
    asset.last_seen_at::text as "lastSeenAt"
    from jsonb_to_recordset($1::text::jsonb) as asset(${columns})
    join raw_listing_records r on r.id=asset.last_raw_listing_record_id
    order by r.captured_at desc,asset.position nulls last,asset.last_seen_at desc`, [JSON.stringify(rows)]);
}

export async function mergeGalleryAssets(sql: Query, input: {
  listingId: string; rawListingRecordId: string; fetchedAt: Date;
  assets: Array<{ assetPath: string; variantMask: number; imageRole: string | null; position: number | null }>;
}) {
  if (!input.assets.length) return;
  await sql`select id from listings where id=${input.listingId} for update`;
  const previous = await readGalleryAssets(sql, input.listingId);
  const rows = await sql.unsafe<{ value: GalleryAsset }[]>(`
    select to_jsonb(merged) as value from (
      select coalesce(old.id,gen_random_uuid()) as id, $3::uuid as listing_id,
        coalesce(new."assetPath",old.asset_path) as asset_path,
        coalesce(old.variant_mask,0) | coalesce(new."variantMask",0) as variant_mask,
        case when new."assetPath" is not null and (old.id is null or $4::timestamptz>=old.last_seen_at)
          then new."imageRole" else old.image_role end as image_role,
        case when new."assetPath" is not null and (old.id is null or $4::timestamptz>=old.last_seen_at)
          then new.position else old.position end as position,
        case when new."assetPath" is null then old.first_seen_at else least(old.first_seen_at,$4::timestamptz) end as first_seen_at,
        case when new."assetPath" is null then old.last_seen_at else greatest(old.last_seen_at,$4::timestamptz) end as last_seen_at,
        case when new."assetPath" is not null and (old.id is null or $4::timestamptz>=old.last_seen_at)
          then $5::uuid else old.last_raw_listing_record_id end as last_raw_listing_record_id
      from jsonb_to_recordset($1::text::jsonb) as old(${columns}) full join
        jsonb_to_recordset($2::text::jsonb) as new("assetPath" text,"variantMask" integer,"imageRole" text,position integer)
        on old.asset_path=new."assetPath"
    ) merged order by asset_path`, [JSON.stringify(previous),JSON.stringify(input.assets),input.listingId,input.fetchedAt,input.rawListingRecordId]);
  await storeGalleryAssets(sql,input.listingId,rows.map(row=>row.value));
}
