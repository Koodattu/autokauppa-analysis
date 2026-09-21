import { readGalleryAssets } from "../packages/domain/src/gallery-storage";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, lstat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createSqlClient, closeSqlClient } from "../packages/db/src/index";
import { parseNettiautoImageAsset } from "../packages/domain/src/listing-images";
import { readLegacyPublicImages } from "../packages/domain/src/storage";
import { persistListingHeroImage } from "../packages/domain/src/persistence";
import { encodeFallbackHero } from "../apps/worker/src/hero-image-encoder.mjs";

// Run in an isolated worker-image container with the old web cache mounted read-only.
// Only --apply writes new content-addressed heroes and their database references.
const apply = process.argv.includes("--apply");
const cacheRoot = resolve(process.env.IMAGE_CACHE_ROOT ?? "/cache");
const heroRoot = resolve(process.env.HERO_IMAGE_STORAGE_PATH ?? "/data/hero-images");
if (cacheRoot !== "/cache" || heroRoot !== "/data/hero-images") throw new Error("Unexpected recovery mount paths");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const sql = createSqlClient(process.env.DATABASE_URL, 1);
const hash = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const stats = { apply, fetchEntries: 0, listingResponses: 0, alreadyArchived: 0, cachedCandidates: 0,
  noCachedImage: 0, missingProvenance: 0, recovered: 0, recoveredBytes: 0, encodedSamples: 0, sampleBytes: 0 };
const started = Date.now();
const widths = [3840, 1920, 2048, 1200, 1080, 828, 750, 640, 384, 256, 128, 96, 64, 48, 32, 16];
const mimeTypes = ["", "image/webp", "image/avif"];
const seen = new Set<string>();

try {
  if (!apply) await sql`set default_transaction_read_only=on`;
  await sql`set statement_timeout='8s'`;
  await sql`set max_parallel_workers_per_gather=0`;
  const originalHeroes = await sql`select * from listing_hero_images order by listing_id`;
  const originalIds = originalHeroes.map((row) => row.listing_id as string);
  const originalFingerprint = hash(JSON.stringify(originalHeroes));
  const existing = new Set(originalIds);
  const verifiedFiles = new Set<string>();
  for (const hero of originalHeroes) {
    const objectKey = hero.object_key as string;
    if (!/^[0-9a-f]{2}\/[0-9a-f]{64}\.webp$/.test(objectKey)) throw new Error("Unexpected existing hero path");
    if (verifiedFiles.has(objectKey)) continue;
    const bytes = await readFile(join(heroRoot, objectKey));
    if (hash(bytes) !== hero.content_sha256 || bytes.length !== hero.byte_size) throw new Error("Existing hero file verification failed");
    verifiedFiles.add(objectKey);
  }
  const cacheKeys = new Set((await readdir(join(cacheRoot, "images"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^[A-Za-z0-9_-]{43}$/.test(entry.name)).map((entry) => entry.name));

  async function cachedImage(url: string) {
    for (const width of widths) {
      for (const mime of mimeTypes) {
        const key = createHash("sha256").update(`4${url}${width}75${mime}`).digest("base64url");
        if (!cacheKeys.has(key)) continue;
        const directory = join(cacheRoot, "images", key);
        const files = await readdir(directory, { withFileTypes: true }).catch((error) => {
          if (error.code === "ENOENT") return [];
          throw error;
        });
        for (const file of files) {
          if (!file.isFile()) continue;
          const path = join(directory, file.name);
          const info = await lstat(path);
          if (info.isFile() && info.size > 0 && info.size <= 20 * 1024 * 1024) return path;
        }
      }
    }
    return null;
  }

  for (const entry of await readdir(join(cacheRoot, "fetch-cache"), { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    stats.fetchEntries++;
    const contents = JSON.parse(await readFile(join(cacheRoot, "fetch-cache", entry.name), "utf8"));
    if (contents.kind !== "FETCH" || contents.data?.status !== 200 || typeof contents.data.body !== "string") continue;
    const path = new URL(contents.data.url).pathname;
    const match = /^\/listings\/([0-9a-f-]{36})$/.exec(path);
    if (!match) continue;
    const listingId = match[1]!;
    if (seen.has(listingId)) continue;
    seen.add(listingId);
    const response = JSON.parse(Buffer.from(contents.data.body, "base64").toString("utf8"));
    if (response.listing?.listingId !== listingId || !Array.isArray(response.imageMetadata)) {
      throw new Error("Cached listing identity mismatch");
    }
    stats.listingResponses++;
    if (existing.has(listingId)) { stats.alreadyArchived++; continue; }
    let candidate: { path: string; assetPath: string } | undefined;
    for (const image of response.imageMetadata) {
      for (const url of [image.imageUrl, ...(image.fallbackImageUrls ?? [])]) {
        const asset = parseNettiautoImageAsset(url);
        if (!asset) continue;
        const cached = await cachedImage(url);
        if (cached) { candidate = { path: cached, assetPath: asset.assetPath }; break; }
      }
      if (candidate) break;
    }
    if (!candidate) { stats.noCachedImage++; continue; }
    stats.cachedCandidates++;
    const compact = await readGalleryAssets(sql, listingId);
    let rawId = compact.find(row => row.asset_path === candidate!.assetPath)?.last_raw_listing_record_id;
    if (!rawId) {
      const legacy = await readLegacyPublicImages(sql, listingId);
      rawId = legacy.find((row) => parseNettiautoImageAsset(row.imageUrl)?.assetPath === candidate!.assetPath)?.cohortId;
    }
    if (!rawId) { stats.missingProvenance++; continue; }
    const [proof] = await sql`
      select 1 from raw_listing_records raw join listings listing
        on listing.source=raw.source and listing.source_listing_id=raw.source_listing_id
      where listing.id=${listingId} and raw.id=${rawId}
    `;
    if (!proof) throw new Error("Cached image provenance does not belong to its listing");
    if (apply || stats.encodedSamples < 100) {
      const encoded = await encodeFallbackHero(candidate.path);
      if (encoded.data.byteLength > 20 * 1024 || encoded.info.format !== "webp") throw new Error("Invalid fallback encoding");
      stats.encodedSamples++;
      stats.sampleBytes += encoded.data.byteLength;
      if (apply) {
        const digest = hash(encoded.data);
        const objectKey = `${digest.slice(0, 2)}/${digest}.webp`;
        const path = join(heroRoot, objectKey);
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.${randomUUID()}.tmp`;
        await writeFile(temporary, encoded.data, { flag: "wx", mode: 0o644 });
        try { await rename(temporary, path); } finally { await rm(temporary, { force: true }); }
        if (hash(await readFile(path)) !== digest) throw new Error("Recovered hero checksum mismatch");
        await persistListingHeroImage(sql, { listingId, sourceRawListingRecordId: rawId,
          sourceImageAssetPath: candidate.assetPath, objectKey, contentSha256: digest,
          byteSize: encoded.data.byteLength, width: encoded.info.width, height: encoded.info.height });
        existing.add(listingId);
        stats.recovered++;
        stats.recoveredBytes += encoded.data.byteLength;
      }
    }
    if (stats.cachedCandidates % 250 === 0) console.log(JSON.stringify({ ...stats, elapsedSeconds: Math.round((Date.now()-started)/1000) }));
  }
  const preserved = await sql`select * from listing_hero_images where listing_id=any(${originalIds}::uuid[]) order by listing_id`;
  if (hash(JSON.stringify(preserved)) !== originalFingerprint) throw new Error("Existing hero records changed during recovery");
  console.log(JSON.stringify({ complete: true, ...stats, originalHeroes: originalHeroes.length,
    originalFilesVerified: verifiedFiles.size, originalHeroesFingerprint: originalFingerprint,
    existingHeroesPreserved: true, elapsedSeconds: Math.round((Date.now()-started)/1000) }));
  if (stats.missingProvenance) throw new Error("Unresolved cache provenance must be reviewed before cleanup");
} finally {
  await closeSqlClient(sql);
}
