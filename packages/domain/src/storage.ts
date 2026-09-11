import type postgres from "postgres";
import type { StoredListingImageRow } from "./listing-images";
import { packStorageValue, unpackRawEvidence, unpackStorageValue, type RawEvidenceEntry } from "./storage-codec";

type Sql = postgres.Sql<Record<string, unknown>>;
type Transaction = postgres.TransactionSql<Record<string, unknown>>;
type Query = Sql | Transaction;
const FIRST_ID = "00000000-0000-0000-0000-000000000000";

export interface StorageProgress {
  stage: string;
  cursorId: string | null;
  status: "running" | "ready" | "completed" | "partial";
  processedCount: number;
  migratedCount: number;
  skippedCount: number;
  errorCount: number;
}

export async function lockStorageProgress(sql: Query, stage: string): Promise<StorageProgress> {
  await sql`insert into storage_migration_progress(stage) values (${stage}) on conflict do nothing`;
  const [progress] = await sql<StorageProgress[]>`
    select stage, cursor_id::text as "cursorId", status,
      processed_count::float8 as "processedCount", migrated_count::float8 as "migratedCount",
      skipped_count::float8 as "skippedCount", error_count::float8 as "errorCount"
    from storage_migration_progress where stage = ${stage} for update
  `;
  if (!progress) throw new Error("Storage progress row missing");
  return progress;
}

export async function advanceStorageProgress(sql: Query, progress: StorageProgress, input: {
  cursorId: string | null;
  processed: number;
  migrated: number;
  skipped?: number;
  errors?: number;
  finished: boolean;
  needsVerification?: boolean;
}): Promise<StorageProgress> {
  const errorCount = progress.errorCount + (input.errors ?? 0);
  const status = input.finished
    ? errorCount > 0 ? "partial" : input.needsVerification ? "ready" : "completed"
    : "running";
  await sql`
    update storage_migration_progress set cursor_id = ${input.cursorId}, status = ${status},
      processed_count = processed_count + ${input.processed},
      migrated_count = migrated_count + ${input.migrated},
      skipped_count = skipped_count + ${input.skipped ?? 0},
      error_count = error_count + ${input.errors ?? 0}, updated_at = now()
    where stage = ${progress.stage}
  `;
  return {
    ...progress, cursorId: input.cursorId, status, errorCount,
    processedCount: progress.processedCount + input.processed,
    migratedCount: progress.migratedCount + input.migrated,
    skippedCount: progress.skippedCount + (input.skipped ?? 0),
  };
}

export async function scheduleStorageContinuation(sql: Query, task: string, progress: StorageProgress) {
  if (progress.status !== "running") return;
  await sql`
    select graphile_worker.add_job(${task}, '{}'::json, queue_name := 'nettiauto-storage-migration',
      max_attempts := 5, job_key := ${`storage:${progress.stage}:${progress.cursorId}`},
      run_at := now() + interval '1 second')
  `;
}

export async function storeRawEvidence(sql: Query, entries: RawEvidenceEntry[]): Promise<string> {
  if (entries.length === 0) throw new Error("Cannot store empty raw evidence bundle");
  const packed = packStorageValue(entries);
  const inserted = await sql`
    insert into raw_listing_payloads(digest, codec, decoded_bytes, record_count, content)
    values (${packed.digest}, ${packed.codec}, ${packed.decodedBytes}, ${entries.length}, ${packed.content})
    on conflict (digest) do nothing returning digest
  `;
  if (inserted.length === 0) {
    const [existing] = await sql<PackedRow[]>`
      select digest, codec, decoded_bytes as "decodedBytes", content from raw_listing_payloads
      where digest = ${packed.digest}
    `;
    if (!existing || JSON.stringify(unpackRawEvidence(existing)) !== JSON.stringify(entries)) {
      throw new Error("Raw evidence digest collision or corruption");
    }
  }
  return packed.digest;
}

interface PackedRow {
  digest: string;
  codec: string;
  decodedBytes: number;
  content: Buffer;
}

export async function readRawEvidence(sql: Query, rawRecordId: string): Promise<RawEvidenceEntry> {
  const [row] = await sql<Array<PackedRow & { payloadJson: string | null; html: string | null; index: number | null }>>`
    select r.source_payload::text as "payloadJson", r.source_html_fragment as html, r.payload_index as index,
      p.digest, p.codec, p.decoded_bytes as "decodedBytes", p.content
    from raw_listing_records r left join raw_listing_payloads p on p.digest = r.payload_digest
    where r.id = ${rawRecordId}
  `;
  if (!row) throw new Error("Raw evidence record missing");
  if (row.payloadJson !== null) return [row.payloadJson, row.html];
  const entry = row.index === null ? undefined : unpackRawEvidence(row)[row.index];
  if (!entry) throw new Error("Raw evidence bundle index missing");
  return entry;
}

export async function packRawEvidenceBatch(sql: Sql, batchSize = 250, scheduleNext = false): Promise<StorageProgress> {
  checkBatchSize(batchSize);
  return await sql.begin(async (tx) => {
    await tx`set local lock_timeout = '5s'`;
    const progress = await lockStorageProgress(tx, "raw_evidence");
    if (progress.status !== "running") return progress;
    const rows = await tx<Array<{ id: string; payloadJson: string; html: string | null }>>`
      select r.id::text, r.source_payload::text as "payloadJson", r.source_html_fragment as html
      from raw_listing_records r
      where r.id > ${progress.cursorId ?? FIRST_ID}::uuid and r.source_payload is not null
      order by r.id limit ${batchSize} for update
    `;
    if (rows.length > 0) {
      const entries: RawEvidenceEntry[] = rows.map((row) => [row.payloadJson, row.html]);
      const digest = await storeRawEvidence(tx, entries);
      // Decode the stored bytes before replacing any inline evidence.
      const [stored] = await tx<PackedRow[]>`
        select digest, codec, decoded_bytes as "decodedBytes", content
        from raw_listing_payloads where digest = ${digest}
      `;
      if (!stored || JSON.stringify(unpackRawEvidence(stored)) !== JSON.stringify(entries)) {
        throw new Error("Raw evidence round-trip mismatch");
      }
      const ids = rows.map((row, index) => ({ id: row.id, index }));
      await tx`
        update raw_listing_records r set source_payload = null, source_html_fragment = null,
          payload_digest = ${digest}, payload_index = batch.index
        from jsonb_to_recordset(${tx.json(ids)}::jsonb) as batch(id uuid, index integer)
        where r.id = batch.id
      `;
    }
    let finished = rows.length < batchSize;
    let cursorId = rows.at(-1)?.id ?? progress.cursorId;
    if (finished) {
      // Close the UUID cursor gap and atomically activate the old-writer guard.
      await tx`lock table raw_listing_records in share row exclusive mode`;
      const [remaining] = await tx`select exists(select 1 from raw_listing_records where source_payload is not null) as present`;
      if (remaining?.present) {
        finished = false;
        cursorId = null;
      }
    }
    const next = await advanceStorageProgress(tx, progress, {
      cursorId, processed: rows.length,
      migrated: rows.length, finished,
    });
    if (scheduleNext) await scheduleStorageContinuation(tx, "backfill_nettiauto_raw_evidence", next);
    return next;
  }) as unknown as StorageProgress;
}

export interface LegacyImageEvidence {
  id: string;
  listingId: string;
  source: string;
  imageUrl: string;
  role: string | null;
  position: number | null;
  width: number | null;
  height: number | null;
  firstSeenAt: string;
  lastSeenAt: string;
  rawRecordId: string | null;
  recordKind: string | null;
  capturedAt: string | null;
}

export function decodeLegacyImageBundle(packed: PackedRow): LegacyImageEvidence[] {
  const value = unpackStorageValue(packed);
  if (!Array.isArray(value) || value.some((row) => !row || typeof row !== "object" ||
    typeof row.id !== "string" || typeof row.listingId !== "string" || typeof row.imageUrl !== "string"
  )) throw new Error("Invalid legacy image bundle");
  return value as LegacyImageEvidence[];
}

export function legacyEvidenceToPublicRows(rows: LegacyImageEvidence[]): StoredListingImageRow[] {
  return rows.flatMap((row) => row.rawRecordId && row.recordKind && row.capturedAt
    ? [{ ...row, cohortId: row.rawRecordId, recordKind: row.recordKind, capturedAt: row.capturedAt }]
    : []);
}

export async function loadLegacyImageEvidence(sql: Query, listingIds: string[]): Promise<LegacyImageEvidence[]> {
  if (listingIds.length === 0) return [];
  return sql<LegacyImageEvidence[]>`
    select image.id::text, image.listing_id::text as "listingId", image.source::text,
      image.image_url as "imageUrl", image.image_role as role, image.position, image.width, image.height,
      image.first_seen_at::text as "firstSeenAt", image.last_seen_at::text as "lastSeenAt",
      image.last_raw_listing_record_id::text as "rawRecordId",
      raw.record_kind::text as "recordKind", raw.captured_at::text as "capturedAt"
    from listing_images image left join raw_listing_records raw on raw.id = image.last_raw_listing_record_id
    where image.listing_id = any(${listingIds}::uuid[])
    order by image.listing_id, raw.captured_at desc, image.position nulls last, image.last_seen_at desc, image.id
  `;
}

export async function packLegacyImagesBatch(sql: Sql, batchSize = 100, scheduleNext = false): Promise<StorageProgress> {
  checkBatchSize(batchSize);
  return await sql.begin(async (tx) => {
    const progress = await lockStorageProgress(tx, "legacy_images");
    if (progress.status !== "running") return progress;
    const candidates = await tx<{ listingId: string }[]>`
      select distinct listing_id as "listingId" from listing_images
      where listing_id > ${progress.cursorId ?? FIRST_ID}::uuid
      order by listing_id limit ${batchSize}
    `;
    const rows = await loadLegacyImageEvidence(tx, candidates.map((row) => row.listingId));
    const groups = new Map<string, LegacyImageEvidence[]>();
    for (const row of rows) {
      const group = groups.get(row.listingId) ?? [];
      group.push(row);
      groups.set(row.listingId, group);
    }
    for (const [listingId, group] of groups) {
      const packed = packStorageValue(group);
      if (JSON.stringify(decodeLegacyImageBundle(packed)) !== JSON.stringify(group)) {
        throw new Error("Legacy image round-trip mismatch");
      }
      await tx`
        insert into listing_legacy_image_bundles(listing_id, digest, codec, decoded_bytes, row_count, content)
        values (${listingId}, ${packed.digest}, ${packed.codec}, ${packed.decodedBytes}, ${group.length}, ${packed.content})
        on conflict (listing_id) do update set digest = excluded.digest, codec = excluded.codec,
          decoded_bytes = excluded.decoded_bytes, row_count = excluded.row_count, content = excluded.content
      `;
    }
    const next = await advanceStorageProgress(tx, progress, {
      cursorId: candidates.at(-1)?.listingId ?? progress.cursorId,
      processed: rows.length, migrated: rows.length,
      finished: candidates.length < batchSize, needsVerification: true,
    });
    if (scheduleNext) await scheduleStorageContinuation(tx, "backfill_nettiauto_legacy_image_bundles", next);
    return next;
  }) as unknown as StorageProgress;
}

export async function readLegacyPublicImages(sql: Query, listingId: string): Promise<StoredListingImageRow[]> {
  const [state] = await sql<{ complete: boolean }[]>`
    select exists(select 1 from storage_migration_progress
      where stage = 'legacy_images' and status = 'completed' and error_count = 0) as complete
  `;
  if (state?.complete) {
    const [packed] = await sql<PackedRow[]>`
      select digest, codec, decoded_bytes as "decodedBytes", content
      from listing_legacy_image_bundles where listing_id = ${listingId}
    `;
    return packed ? legacyEvidenceToPublicRows(decodeLegacyImageBundle(packed)) : [];
  }
  return legacyEvidenceToPublicRows(await loadLegacyImageEvidence(sql, [listingId]));
}

export async function verifyLegacyImages(sql: Sql, onProgress?: (rows: number) => void): Promise<number> {
  return await sql.begin(async (tx) => {
    // Hold the legacy representation stable until the reader-switch marker commits.
    await tx`set local lock_timeout = '5s'`;
    await tx`lock table listing_images in share mode`;
    const progress = await lockStorageProgress(tx, "legacy_images");
    if (!['ready', 'completed'].includes(progress.status)) throw new Error("Image migration is not ready to verify");
    let cursor = FIRST_ID;
    let count = 0;
    for (;;) {
      const candidates = await tx<{ listingId: string; decodedBytes: number }[]>`
        select listing_id::text as "listingId", decoded_bytes as "decodedBytes"
        from listing_legacy_image_bundles where listing_id > ${cursor}::uuid order by listing_id limit 100
      `;
      if (candidates.length === 0) break;
      const listingIds: string[] = [];
      let decodedBytes = 0;
      for (const candidate of candidates) {
        if (listingIds.length > 0 && decodedBytes + candidate.decodedBytes > 32 * 1024 ** 2) break;
        listingIds.push(candidate.listingId);
        decodedBytes += candidate.decodedBytes;
      }
      const bundles = await tx<Array<PackedRow & { listingId: string; rowCount: number }>>`
        select listing_id::text as "listingId", digest, codec, decoded_bytes as "decodedBytes", row_count as "rowCount", content
        from listing_legacy_image_bundles where listing_id = any(${listingIds}::uuid[]) order by listing_id
      `;
      const expected = await loadLegacyImageEvidence(tx, bundles.map((row) => row.listingId));
      const groups = new Map<string, LegacyImageEvidence[]>();
      for (const row of expected) {
        const group = groups.get(row.listingId) ?? [];
        group.push(row);
        groups.set(row.listingId, group);
      }
      for (const bundle of bundles) {
        const decoded = decodeLegacyImageBundle(bundle);
        if (decoded.length !== bundle.rowCount || JSON.stringify(decoded) !== JSON.stringify(groups.get(bundle.listingId) ?? [])) {
          throw new Error("Legacy image preservation verification failed");
        }
        count += decoded.length;
      }
      cursor = bundles.at(-1)!.listingId;
      onProgress?.(count);
    }
    const [source] = await tx<{ count: number }[]>`select count(*)::float8 as count from listing_images`;
    if (source?.count !== count || count !== progress.processedCount) {
      throw new Error("Legacy image census mismatch");
    }
    await tx`update storage_migration_progress set status = 'completed', updated_at = now() where stage = 'legacy_images'`;
    return count;
  }) as unknown as number;
}

function checkBatchSize(size: number) {
  if (!Number.isInteger(size) || size < 1 || size > 2000) throw new Error("Storage batch size must be 1..2000");
}

export async function verifyRawEvidence(sql: Sql, onProgress?: (bundles: number) => void) {
  return await sql.begin("isolation level repeatable read read only", async tx => {
    const [state] = await tx`select status, error_count from storage_migration_progress where stage='raw_evidence'`;
    if (state?.status !== "completed" || Number(state.error_count) !== 0) throw new Error("Raw evidence migration incomplete");
    const [census] = await tx`
      select count(*)::float8 as records,
        count(*) filter (where r.source_payload is not null)::float8 as inline,
        count(*) filter (where p.digest is null or r.payload_index is null or r.payload_index < 0
          or r.payload_index >= p.record_count)::float8 as invalid
      from raw_listing_records r left join raw_listing_payloads p on p.digest=r.payload_digest
    `;
    if (!census || census.inline !== 0 || census.invalid !== 0) throw new Error("Invalid raw evidence references");
    let cursor = "";
    let count = 0;
    let decodedBytes = 0;
    for (;;) {
      const candidates = await tx<{ digest: string; decodedBytes: number }[]>`
        select digest, decoded_bytes as "decodedBytes" from raw_listing_payloads where digest > ${cursor} order by digest limit 100
      `;
      if (candidates.length === 0) break;
      const digests: string[] = [];
      let batchBytes = 0;
      for (const candidate of candidates) {
        if (digests.length > 0 && batchBytes + candidate.decodedBytes > 32 * 1024 ** 2) break;
        digests.push(candidate.digest);
        batchBytes += candidate.decodedBytes;
      }
      const bundles = await tx<Array<PackedRow & { recordCount: number }>>`
        select digest, codec, decoded_bytes as "decodedBytes", record_count as "recordCount", content
        from raw_listing_payloads where digest = any(${digests}::text[]) order by digest
      `;
      for (const bundle of bundles) {
        if (unpackRawEvidence(bundle).length !== bundle.recordCount) throw new Error("Raw evidence bundle census mismatch");
        count++;
        decodedBytes += bundle.decodedBytes;
      }
      cursor = bundles.at(-1)!.digest;
      onProgress?.(count);
    }
    return { records: census.records, bundles: count, decodedBytes };
  });
}
