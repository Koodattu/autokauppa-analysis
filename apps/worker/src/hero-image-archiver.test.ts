import { describe, expect, it } from "vitest";
import { encodeListingHeroImage } from "./hero-image-archiver";

describe("listing hero image encoding", () => {
  it("creates a 960px-bounded WebP without enlarging the source", async () => {
    const source = Buffer.from(
      '<svg width="1600" height="1200" xmlns="http://www.w3.org/2000/svg">' +
        '<rect width="1600" height="1200" fill="#285a8c"/></svg>',
    );

    const encoded = await encodeListingHeroImage(source);

    expect(encoded.info.format).toBe("webp");
    expect(encoded.info.width).toBe(960);
    expect(encoded.info.height).toBe(720);
    expect(encoded.data.byteLength).toBeGreaterThan(0);
  });
});
