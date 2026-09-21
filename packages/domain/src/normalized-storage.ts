import type postgres from "postgres";
import { packStorageValue, unpackStorageValue } from "./storage-codec";

type Query = postgres.Sql<Record<string, unknown>> | postgres.TransactionSql<Record<string, unknown>>;
export type NormalizedTable = "listing_snapshots" | "listing_details";
export interface NormalizedReference {
  normalizedData: unknown;
  normalizedIndex: number | null;
  normalizedDigest: string | null;
  normalizedContent: Buffer | null;
  normalizedDecodedBytes: number | null;
}

export function decodeNormalizedData(row: NormalizedReference): unknown {
  if (row.normalizedIndex === null) return row.normalizedData;
  return JSON.parse(decodeNormalizedText(row));
}

export function decodeNormalizedText(row: NormalizedReference): string {
  if (row.normalizedIndex === null || !row.normalizedDigest || !row.normalizedContent || row.normalizedDecodedBytes === null) {
    throw new Error("Missing normalized payload reference");
  }
  const values = unpackStorageValue({ digest: row.normalizedDigest, content: row.normalizedContent,
    decodedBytes: row.normalizedDecodedBytes, codec: "brotli-json-v1" });
  if (!Array.isArray(values) || typeof values[row.normalizedIndex] !== "string") {
    throw new Error("Invalid normalized payload bundle");
  }
  return values[row.normalizedIndex];
}

export async function readSnapshotNormalizedText(sql: Query, id: string): Promise<string> {
  const [row] = await sql<Array<NormalizedReference & { text: string }>>`
    select s.normalized_data::text as text, s.normalized_payload_index as "normalizedIndex",
      encode(p.digest, 'hex') as "normalizedDigest", p.content as "normalizedContent",
      p.decoded_bytes as "normalizedDecodedBytes"
    from listing_snapshots s left join normalized_payloads p on p.id=s.normalized_payload_id where s.id=${id}
  `;
  if (!row) throw new Error("Missing snapshot");
  return row.normalizedIndex === null ? row.text : decodeNormalizedText(row);
}

// Preserve PostgreSQL's JSON text, including numeric literals beyond JavaScript's integer range.
// Only the two keys used by SQL remain inline; the archive retains every key and value.
export async function compactNormalizedRows(sql: Query, table: NormalizedTable, ids: string[]) {
  if (!ids.length) return;
  const key = table === "listing_snapshots" ? "id" : "listing_id";
  const rows = await sql.unsafe<{ id: string; value: string }[]>(
    `select ${key}::text as id, normalized_data::text as value from ${table}
     where ${key}=any($1::uuid[]) and normalized_payload_id is null order by ${key} for update`, [ids]);
  if (!rows.length) return;
  const values = rows.map(row => row.value);
  const packed = packStorageValue(values);
  const [stored] = await sql<Array<{ id: string; digest: string; content: Buffer; decodedBytes: number; codec: string }>>`
    insert into normalized_payloads(digest, decoded_bytes, record_count, content)
    values (${Buffer.from(packed.digest, "hex")}, ${packed.decodedBytes}, ${rows.length}, ${packed.content})
    returning id, encode(digest,'hex') as digest, content, decoded_bytes as "decodedBytes", 'brotli-json-v1' as codec
  `;
  if (!stored || JSON.stringify(unpackStorageValue(stored)) !== JSON.stringify(values)) {
    throw new Error("Normalized payload round-trip mismatch");
  }
  await sql.unsafe(`update ${table} t set normalized_payload_id=$1, normalized_payload_index=b.ordinality::integer-1,
      normalized_data=(select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb)
        from jsonb_each(t.normalized_data) e where e.key in ('detailParserVersion','sourceLocationLabel'))
    from unnest($2::uuid[]) with ordinality b(id,ordinality) where t.${key}=b.id`, [stored.id, rows.map(row=>row.id)]);
}

export async function removeUnusedNormalizedPayload(sql: Query, id: string | null) {
  if (!id) return;
  await sql`delete from normalized_payloads p where p.id=${id}
    and not exists(select 1 from listing_snapshots s where s.normalized_payload_id=p.id)
    and not exists(select 1 from listing_details d where d.normalized_payload_id=p.id)`;
}
