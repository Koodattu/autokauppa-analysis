import { describe, expect, it, vi } from "vitest";
import type { SqlClient } from "@nettiauto/db";
import { createListingHeroImageArchiver, encodeListingHeroImage } from "./hero-image-archiver";

describe("listing hero image encoding", () => {
  it("creates a 480px-bounded WebP within the fallback byte budget", async () => {
    const source = Buffer.from(
      '<svg width="1600" height="1200" xmlns="http://www.w3.org/2000/svg">' +
        '<rect width="1600" height="1200" fill="#285a8c"/></svg>',
    );

    const encoded = await encodeListingHeroImage(source);

    expect(encoded.info.format).toBe("webp");
    expect(encoded.info.width).toBe(480);
    expect(encoded.info.height).toBe(360);
    expect(encoded.data.byteLength).toBeGreaterThan(0);
    expect(encoded.data.byteLength).toBeLessThanOrEqual(20 * 1024);
  });

  it("does not enlarge a source thumbnail", async () => {
    const source = Buffer.from('<svg width="289" height="217" xmlns="http://www.w3.org/2000/svg"><rect width="289" height="217" fill="#285a8c"/></svg>');
    const encoded = await encodeListingHeroImage(source);
    expect(encoded.info).toMatchObject({ format: "webp", width: 289, height: 217 });
    expect(encoded.data.byteLength).toBeLessThanOrEqual(20 * 1024);
  });

  it("keeps a detailed source inside the hard byte budget", async () => {
    const cells = Array.from({ length: 4096 }, (_, index) =>
      `<rect x="${index % 64 * 16}" y="${Math.floor(index / 64) * 16}" width="16" height="16" fill="#${((index * 2654435761) >>> 0).toString(16).padStart(8, "0").slice(0, 6)}"/>`,
    ).join("");
    const encoded = await encodeListingHeroImage(Buffer.from(`<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">${cells}</svg>`));
    expect(encoded.info.format).toBe("webp");
    expect(encoded.info.width).toBeLessThanOrEqual(480);
    expect(encoded.data.byteLength).toBeLessThanOrEqual(20 * 1024);
  });

  it("tries recorded variants of the same photo after 404 and 410 responses", async () => {
    const primary = "https://images.nettiauto.com/live/photo-large.jpg";
    const fallback = "https://images.nettiauto.com/live/photo-289x217.webp";
    const fetchImplementation = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 410 }));
    const archiver = createListingHeroImageArchiver({
      sql: vi.fn(async () => [{ exists: false }]) as unknown as SqlClient,
      enabled: true, storagePath: "unused", maxSourceBytes: 1024,
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    });
    expect(await archiver.archive({ listingId: "listing", sourceRawListingRecordId: "raw", sourceImageUrl: primary,
      fallbackImageUrls: ["https://images.nettiauto.com/live/different-large.jpg", fallback] })).toBe("skipped");
    expect(fetchImplementation.mock.calls.map(([url]) => url)).toEqual([primary, fallback]);
  });

  it("preserves an existing hero without fetching or re-encoding it", async () => {
    const fetchImplementation = vi.fn();
    const archiver = createListingHeroImageArchiver({
      sql: vi.fn(async () => [{ exists: true }]) as unknown as SqlClient,
      enabled: true, storagePath: "unused", maxSourceBytes: 1024,
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    });
    expect(await archiver.archive({ listingId: "listing", sourceRawListingRecordId: "raw",
      sourceImageUrl: "https://images.nettiauto.com/live/photo-large.jpg" })).toBe("exists");
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
