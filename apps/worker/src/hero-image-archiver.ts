import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { SqlClient } from "@nettiauto/db";
import {
  hasListingHeroImage,
  parseNettiautoImageAsset,
  persistListingHeroImage,
} from "@nettiauto/domain";

const execFileAsync = promisify(execFile);
const encoderScriptPath = fileURLToPath(new URL("./sharp-encode.mjs", import.meta.url));

const HERO_MAX_DIMENSION_PX = 960;
const HERO_WEBP_QUALITY = 75;

export interface ArchiveListingHeroImageInput {
  listingId: string;
  sourceRawListingRecordId: string;
  sourceImageUrl: string;
}

export interface ListingHeroImageArchiver {
  archive(input: ArchiveListingHeroImageInput): Promise<"archived" | "exists" | "skipped">;
}

export function createListingHeroImageArchiver(input: {
  sql: SqlClient;
  enabled: boolean;
  storagePath: string;
  maxSourceBytes: number;
  fetchImplementation?: typeof globalThis.fetch;
}): ListingHeroImageArchiver {
  const fetchImplementation = input.fetchImplementation ?? globalThis.fetch;

  return {
    async archive(command) {
      if (!input.enabled) {
        return "skipped";
      }
      if (await hasListingHeroImage(input.sql, command.listingId)) {
        return "exists";
      }

      const sourceAsset = parseNettiautoImageAsset(command.sourceImageUrl);
      if (!sourceAsset) {
        return "skipped";
      }

      const response = await fetchImplementation(command.sourceImageUrl, { redirect: "follow" });
      if ([404, 410].includes(response.status)) {
        return "skipped";
      }
      if (!response.ok) {
        throw new Error(`Nettiauto hero image returned HTTP ${response.status}.`);
      }
      if (!parseNettiautoImageAsset(response.url || command.sourceImageUrl)) {
        return "skipped";
      }
      const declaredBytes = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredBytes) && declaredBytes > input.maxSourceBytes) {
        return "skipped";
      }

      const sourceBytes = Buffer.from(await response.arrayBuffer());
      if (sourceBytes.byteLength === 0 || sourceBytes.byteLength > input.maxSourceBytes) {
        return "skipped";
      }
      const encoded = await encodeListingHeroImage(sourceBytes);
      const contentSha256 = createHash("sha256").update(encoded.data).digest("hex");
      const objectKey = `${contentSha256.slice(0, 2)}/${contentSha256}.webp`;
      const targetPath = join(input.storagePath, objectKey);
      const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(temporaryPath, encoded.data, { flag: "wx", mode: 0o644 });
      try {
        await rename(temporaryPath, targetPath);
      } finally {
        await rm(temporaryPath, { force: true });
      }

      await persistListingHeroImage(input.sql, {
        listingId: command.listingId,
        sourceRawListingRecordId: command.sourceRawListingRecordId,
        sourceImageAssetPath: sourceAsset.assetPath,
        objectKey,
        contentSha256,
        byteSize: encoded.data.byteLength,
        width: encoded.info.width,
        height: encoded.info.height,
      });
      return "archived";
    },
  };
}

export function encodeListingHeroImage(sourceBytes: Buffer) {
  return encodeListingHeroImageWithNode(sourceBytes);
}

async function encodeListingHeroImageWithNode(sourceBytes: Buffer) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "nettiauto-hero-"));
  const sourcePath = join(temporaryDirectory, "source-image");
  const outputPath = join(temporaryDirectory, "hero.webp");
  try {
    await writeFile(sourcePath, sourceBytes, { flag: "wx", mode: 0o600 });
    const { stdout } = await execFileAsync(
      "node",
      [
        encoderScriptPath,
        sourcePath,
        outputPath,
        String(HERO_MAX_DIMENSION_PX),
        String(HERO_WEBP_QUALITY),
      ],
      { encoding: "utf8", maxBuffer: 64 * 1024 },
    );
    const info = JSON.parse(stdout) as { format: string; width: number; height: number };
    return { data: await readFile(outputPath), info };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
