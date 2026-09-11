import { describe, expect, it } from "vitest";
import { packStorageValue, unpackRawEvidence, unpackStorageValue } from "./storage-codec";

describe("lossless storage codec", () => {
  it("preserves JSON numeric literals, Unicode, HTML and null exactly", () => {
    const evidence = [[String.raw`{"id":900719925474099312345,"text":"ää😀","escape":"\n"}`, "<div>ö &amp; 😀</div>"], ["null", null]];
    expect(unpackRawEvidence(packStorageValue(evidence))).toEqual(evidence);
  });

  it("rejects a checksum mismatch, an incorrect length and unsupported codecs", () => {
    const packed = packStorageValue({ value: "preserve me" });
    expect(() => unpackStorageValue({ ...packed, digest: "0".repeat(64) })).toThrow("checksum");
    expect(() => unpackStorageValue({ ...packed, decodedBytes: packed.decodedBytes + 1 })).toThrow("checksum");
    expect(() => unpackStorageValue({ ...packed, codec: "unknown" })).toThrow("Unsupported");
    expect(() => unpackStorageValue({ ...packed, decodedBytes: 65 * 1024 ** 2 })).toThrow("size");
    expect(() => unpackStorageValue({ ...packed, content: Buffer.from("broken") })).toThrow();
  });

  it("rejects malformed evidence and nonserializable values", () => {
    expect(() => unpackRawEvidence(packStorageValue([[{}, null]]))).toThrow("Invalid raw");
    expect(() => packStorageValue(undefined)).toThrow("serializable");
  });

  it("compresses repeated evidence while retaining a deterministic digest", () => {
    const evidence = Array.from({ length: 50 }, (_, id) => [JSON.stringify({ id, data: "listing information ".repeat(100) }), null]);
    const packed = packStorageValue(evidence);
    expect(packed.content.length).toBeLessThan(packed.decodedBytes / 10);
    expect(packStorageValue(evidence).digest).toBe(packed.digest);
    expect(unpackRawEvidence(packed)).toEqual(evidence);
  });
});
