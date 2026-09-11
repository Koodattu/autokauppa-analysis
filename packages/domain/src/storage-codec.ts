import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";
import { sha256 } from "./nettiauto";

export const STORAGE_CODEC = "brotli-json-v1";
const MAX_DECODED_BYTES = 64 * 1024 * 1024;

export interface PackedStorageValue {
  digest: string;
  codec: typeof STORAGE_CODEC;
  decodedBytes: number;
  content: Buffer;
}

export function packStorageValue(value: unknown): PackedStorageValue {
  const text = JSON.stringify(value);
  if (text === undefined) throw new Error("Storage value must be JSON serializable");
  const decodedBytes = Buffer.byteLength(text);
  if (decodedBytes > MAX_DECODED_BYTES) throw new Error("Storage bundle exceeds 64 MiB");
  return {
    digest: sha256(text),
    codec: STORAGE_CODEC,
    decodedBytes,
    content: brotliCompressSync(text, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 5, [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT },
    }),
  };
}

export function unpackStorageValue(packed: {
  digest: string;
  codec: string;
  decodedBytes: number;
  content: Uint8Array;
}): unknown {
  if (packed.codec !== STORAGE_CODEC) throw new Error("Unsupported storage codec");
  if (packed.decodedBytes < 0 || packed.decodedBytes > MAX_DECODED_BYTES) {
    throw new Error("Invalid storage bundle size");
  }
  const decoded = brotliDecompressSync(packed.content, { maxOutputLength: MAX_DECODED_BYTES });
  if (decoded.length !== packed.decodedBytes || sha256(decoded.toString("utf8")) !== packed.digest) {
    throw new Error("Storage bundle checksum mismatch");
  }
  return JSON.parse(decoded.toString("utf8")) as unknown;
}

// JSON is kept as text here so migrating a PostgreSQL jsonb value never rounds
// large numeric literals through JavaScript's number representation.
export type RawEvidenceEntry = [payloadJson: string, html: string | null];

export function unpackRawEvidence(packed: Parameters<typeof unpackStorageValue>[0]): RawEvidenceEntry[] {
  const value = unpackStorageValue(packed);
  if (!Array.isArray(value) || value.some((entry) =>
    !Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" ||
    (entry[1] !== null && typeof entry[1] !== "string")
  )) {
    throw new Error("Invalid raw evidence bundle");
  }
  return value as RawEvidenceEntry[];
}
