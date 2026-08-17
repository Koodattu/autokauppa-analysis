import { describe, expect, it } from "vitest";
import {
  nettiautoImageAssetKey,
  nettiautoImageUrls,
  parseNettiautoImageAsset,
  selectCompactPublicListingImages,
  selectPublicListingImages,
  type StoredListingImageRow,
} from "./listing-images";

function row(overrides: Partial<StoredListingImageRow> = {}): StoredListingImageRow {
  return {
    imageUrl: "https://images.nettiauto.com/live/2026/08/09/photo-289x217.webp",
    role: "gallery",
    position: 1,
    width: null,
    height: null,
    cohortId: "new",
    recordKind: "search_result_card",
    capturedAt: "2026-08-09T10:00:00Z",
    lastSeenAt: "2026-08-09T10:00:00Z",
    ...overrides,
  };
}

describe("public listing image selection", () => {
  it("deduplicates resolution variants into one physical photo", () => {
    expect(
      nettiautoImageAssetKey(
        "https://images.nettiauto.com/live/2026/08/09/photo-large.jpg",
      ),
    ).toBe(
      nettiautoImageAssetKey(
        "https://images.nettiauto.com/live/2026/08/09/photo-289x217.webp",
      ),
    );
  });

  it("uses the newest cohort keyset and an older large variant as a fallback-capable primary", () => {
    const images = selectPublicListingImages([
      row(),
      row({
        imageUrl: "https://images.nettiauto.com/live/2026/08/09/photo-large.jpg",
        cohortId: "detail",
        recordKind: "detail_page",
        capturedAt: "2026-08-08T10:00:00Z",
      }),
      row({
        imageUrl: "https://images.nettiauto.com/live/2026/08/09/old-large.jpg",
        cohortId: "old",
        recordKind: "detail_page",
        capturedAt: "2026-08-07T10:00:00Z",
      }),
    ]);

    expect(images).toHaveLength(1);
    expect(images[0]?.imageUrl).toBe(
      "https://images.nettiauto.com/live/2026/08/09/photo-large.jpg",
    );
    expect(images[0]?.fallbackImageUrls).toEqual([
      "https://images.nettiauto.com/live/2026/08/09/photo-289x217.webp",
    ]);
  });

  it("orders physical photos by the selected cohort and excludes unsupported assets", () => {
    const images = selectPublicListingImages([
      row({ imageUrl: "https://images.nettiauto.com/live/2026/08/09/two-large.jpg", position: 2 }),
      row({ imageUrl: "https://images.nettiauto.com/live/2026/08/09/one-large.jpg", position: 1 }),
      row({ imageUrl: "https://assets.nettiauto.com/logo.png", position: 0 }),
      row({ imageUrl: "https://images.nettiauto.com/live/photo.jpg?size=large", position: 0 }),
    ]);

    expect(images.map((image) => image.position)).toEqual([1, 2]);
  });

  it("stores only a compact asset path and variant bitmask", () => {
    expect(
      parseNettiautoImageAsset(
        "https://images.nettiauto.com/live/2026/08/09/photo-289x217.webp",
      ),
    ).toEqual({ assetPath: "/live/2026/08/09/photo", variantMask: 4 });
    expect(nettiautoImageUrls("/live/2026/08/09/photo", 5)).toEqual([
      "https://images.nettiauto.com/live/2026/08/09/photo-large.jpg",
      "https://images.nettiauto.com/live/2026/08/09/photo-289x217.webp",
    ]);
    expect(parseNettiautoImageAsset("https://signed.example.com/photo.jpg?token=secret")).toBeNull();
  });

  it("prefers the archived hero and keeps the source CDN image as fallback", () => {
    expect(
      selectCompactPublicListingImages(
        [{
          assetPath: "/live/2026/08/09/photo",
          variantMask: 5,
          role: "detail",
          position: 1,
          cohortId: "detail",
          capturedAt: "2026-08-09T10:00:00Z",
          lastSeenAt: "2026-08-09T10:00:00Z",
        }],
        { objectKey: "ab/hero.webp", width: 960, height: 720 },
      )[0],
    ).toMatchObject({
      imageUrl: "/media/heroes/ab/hero.webp",
      fallbackImageUrls: [
        "https://images.nettiauto.com/live/2026/08/09/photo-large.jpg",
        "https://images.nettiauto.com/live/2026/08/09/photo-289x217.webp",
      ],
    });
  });
});
