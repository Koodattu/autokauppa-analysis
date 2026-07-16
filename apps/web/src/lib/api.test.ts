import { describe, expect, it } from "vitest";
import { listingDetailHref, safeListingsReturnHref } from "./api";

describe("listing scope links", () => {
  it("carries the complete listing query into the detail link", () => {
    expect(listingDetailHref("abc 1", {
      make: "Honda",
      model: "Civic",
      page: "2",
      returnTo: "/discarded",
    })).toBe(
      "/listings/abc%201?returnTo=%2Flistings%3Fmake%3DHonda%26model%3DCivic%26page%3D2",
    );
  });

  it("accepts only the listing index as a return destination", () => {
    expect(safeListingsReturnHref("/listings?make=Honda&model=Civic&page=2")).toBe(
      "/listings?make=Honda&model=Civic&page=2",
    );
    expect(safeListingsReturnHref("/listings")).toBe("/listings");
  });

  it.each([
    "https://example.test/listings",
    "//example.test/listings",
    "/listings/123",
    "/listings-elsewhere",
    "/listings/%2e%2e/listings",
    "/listings?make=Honda#results",
    "\\listings",
  ])("rejects unsafe return destination %s", (value) => {
    expect(safeListingsReturnHref(value)).toBe("/listings");
  });

  it("rejects repeated and missing return destinations", () => {
    expect(safeListingsReturnHref(["/listings", "/listings?make=Honda"])).toBe("/listings");
    expect(safeListingsReturnHref(undefined)).toBe("/listings");
  });
});
