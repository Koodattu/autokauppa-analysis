import { describe, expect, it } from "vitest";
import { firstAvailableListingImageUrl, isAllowedListingImageUrl } from "./listing-images";

describe("listing image URL allowlist", () => {
  it("accepts a locally archived hero image", () => {
    expect(isAllowedListingImageUrl("/media/heroes/ab/content-hash.webp")).toBe(true);
  });

  it.each([
    "https://images.nettiauto.com/live/12345/vehicle.jpg",
    "https://www.nettiauto.com/images/vehicle.jpg",
  ])("accepts a known Nettiauto image URL %s", (value) => {
    expect(isAllowedListingImageUrl(value)).toBe(true);
  });

  it.each([
    "http://images.nettiauto.com/live/12345/vehicle.jpg",
    "https://images.nettiauto.com/other/vehicle.jpg",
    "https://www.nettiauto.com/live/vehicle.jpg",
    "https://images.example.test/live/vehicle.jpg",
    "https://images.nettiauto.com/live/vehicle.jpg?size=large",
    "https://images.nettiauto.com/live/vehicle.jpg#preview",
    "/images/vehicle.jpg",
    "not-a-url",
  ])("rejects an unsupported image URL %s", (value) => {
    expect(isAllowedListingImageUrl(value)).toBe(false);
  });
});

describe("listing image fallbacks", () => {
  it("promotes the next allowed variant after an image fails", () => {
    const primary = "https://images.nettiauto.com/live/12345/vehicle-large.jpg";
    const fallback = "https://images.nettiauto.com/live/12345/vehicle-289x217.webp";
    expect(
      firstAvailableListingImageUrl(
        { imageUrl: primary, fallbackImageUrls: [fallback] },
        new Set([primary]),
      ),
    ).toBe(fallback);
  });

  it("returns null after all allowed variants fail", () => {
    const imageUrl = "https://images.nettiauto.com/live/12345/vehicle.jpg";
    expect(
      firstAvailableListingImageUrl({ imageUrl, fallbackImageUrls: [] }, new Set([imageUrl])),
    ).toBeNull();
  });
});
