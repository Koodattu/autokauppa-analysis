import { describe, expect, it } from "vitest";
import { isAllowedListingImageUrl } from "./listing-images";

describe("listing image URL allowlist", () => {
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
