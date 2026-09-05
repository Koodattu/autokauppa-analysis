import { describe, expect, it } from "vitest";
import {
  resolveAnalysisNavigation,
  resolveListingNavigation,
  safeListingsReturnHref,
} from "./url-filter-navigation";

describe("URL Filter navigation", () => {
  it("projects an Analysis Query into request, metadata, and Listing View navigation", () => {
    const navigation = resolveAnalysisNavigation({
      model: "Civic",
      make: "Honda",
      from: "2026-01-01",
      to: "2026-08-01",
      interval: "month",
    });

    expect(navigation).not.toBeNull();
    expect(navigation?.queryString).toBe(
      "make=Honda&model=Civic&from=2026-01-01&to=2026-08-01&interval=month",
    );
    expect(navigation?.snapshotQueryString).toBe("make=Honda&model=Civic");
    expect(navigation?.filterMetadataQueryString).toBe("make=Honda&model=Civic");
    expect(navigation?.listingsHref).toBe("/listings?make=Honda&model=Civic");
  });

  it("keeps comparison URL state separate from the primary Analysis Query", () => {
    const navigation = resolveAnalysisNavigation({
      make: "Honda",
      fuelType: "Hybrid",
      compareMake: "Toyota",
      compareModel: "Corolla",
      compareModelYear: "2020",
      compareFuelType: "Petrol",
      compareOptionsForMake: "Toyota",
    });

    expect(navigation?.queryString).toBe("make=Honda&fuelType=Hybrid");
    expect(navigation?.comparisonScope?.queryString).toBe(
      "make=Toyota&model=Corolla&modelYear=2020&fuelType=Petrol",
    );
    expect(navigation?.comparisonClearHref).toBe("/?make=Honda&fuelType=Hybrid");
    expect(navigation?.primaryHiddenInputs).toEqual([
      ["make", "Honda"],
      ["fuelType", "Hybrid"],
    ]);
  });

  it("projects Listing Views into analytics, pagination, and detail links", () => {
    const navigation = resolveListingNavigation({
      make: "Honda",
      model: "Civic",
      page: "2",
      sort: "priceAsc",
    });

    expect(navigation?.queryString).toBe("make=Honda&model=Civic&page=2&sort=priceAsc");
    expect(navigation?.analyticsHref).toBe("/analyze?make=Honda&model=Civic");
    expect(navigation?.pageHref(3)).toBe(
      "/listings?make=Honda&model=Civic&page=3&sort=priceAsc",
    );
    expect(navigation?.detailHref("abc 1")).toBe(
      "/listings/abc%201?returnTo=%2Flistings%3Fmake%3DHonda%26model%3DCivic%26page%3D2%26sort%3DpriceAsc",
    );
  });

  it("rejects duplicate known URL Filters", () => {
    expect(resolveAnalysisNavigation({ make: ["Ford", "Volvo"] })).toBeNull();
    expect(resolveListingNavigation({ page: ["1", "2"] })).toBeNull();
  });

  it("accepts only the Listing View as a return destination", () => {
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
