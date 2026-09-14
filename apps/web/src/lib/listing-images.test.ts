import { describe, expect, it } from "vitest";
import { availableListingGalleryImages, firstAvailableListingImageUrl, isAllowedListingImageUrl } from "./listing-images";

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
  const primary = "https://images.nettiauto.com/live/12345/vehicle-large.jpg";
  const thumbnail = "https://images.nettiauto.com/live/12345/vehicle-289x217.webp";

  it("uses the remote photo before its archived hero", () => {
    const image = { imageUrl: "/media/heroes/ab/hero.webp", fallbackImageUrls: [primary, thumbnail] };
    expect(availableListingGalleryImages([image], new Set())[0]?.displayUrl).toBe(primary);
    expect(availableListingGalleryImages([image], new Set([primary]))[0]?.displayUrl).toBe(thumbnail);
  });

  it("keeps the full-size image usable when only its thumbnail has disappeared", () => {
    const image = { imageUrl: primary, fallbackImageUrls: [thumbnail] };
    expect(availableListingGalleryImages([image], new Set([thumbnail]))[0]?.displayUrl).toBe(primary);
    expect(availableListingGalleryImages([image], new Set([primary, thumbnail]))).toEqual([]);
  });

  it("shows one archived hero only after every remote photo fails", () => {
    const hero = "/media/heroes/ab/content-hash.webp";
    const second = "https://images.nettiauto.com/live/12345/second-large.jpg";
    const images = [{ imageUrl: hero, fallbackImageUrls: [primary, thumbnail] }, { imageUrl: second }];
    expect(availableListingGalleryImages(images, new Set([primary, thumbnail])).map((image) => image.displayUrl)).toEqual([second]);
    expect(availableListingGalleryImages(images, new Set([primary, thumbnail, second])).map((image) => image.displayUrl)).toEqual([hero]);
    expect(availableListingGalleryImages(images, new Set([primary, thumbnail, second, hero]))).toEqual([]);
  });

  it("does not invent a thumbnail or use one from an unapproved host", () => {
    expect(availableListingGalleryImages([{ imageUrl: primary }], new Set())[0]?.displayUrl).toBe(primary);
    expect(availableListingGalleryImages([{
      imageUrl: primary,
      fallbackImageUrls: ["https://example.test/vehicle-289x217.webp"],
    }], new Set([primary]))).toEqual([]);
  });

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
