import { describe, expect, it } from "vitest";
import {
  resolveAnalysisNavigation,
  resolveListingNavigation,
  safeListingsReturnHref,
} from "./url-filter-navigation";

describe("URL Filter navigation", () => {
  it("keeps current + sold and recently observed sorting when following page and detail links", () => {
    const navigation = resolveListingNavigation({ availability: "all", sort: "lastSeenDesc" })!;
    const next = new URL(navigation.pageHref(2), "https://example.test");
    expect(next.searchParams.get("availability")).toBe("all");
    expect(next.searchParams.get("sort")).toBe("lastSeenDesc");
    expect(new URL(navigation.analyticsHref, "https://example.test").searchParams.get("availability")).toBe("all");
    const detail = new URL(navigation.detailHref("example"), "https://example.test");
    const back = new URL(detail.searchParams.get("returnTo")!, "https://example.test");
    expect(back.searchParams.get("availability")).toBe("all");
    expect(back.searchParams.get("sort")).toBe("lastSeenDesc");
    expect(back.hash).toBe("#listing-results");
  });

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
    expect(navigation?.listingsHref).toBe("/listings?make=Honda&model=Civic&availability=all&sort=lastSeenDesc");
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
    expect(navigation?.analyticsHref).toBe("/analyze?make=Honda&model=Civic&availability=all");
    expect(navigation?.pageHref(3)).toBe(
      "/listings?make=Honda&model=Civic&page=3&sort=priceAsc&availability=all",
    );
    expect(navigation?.detailHref("abc 1")).toBe(
      "/listings/abc%201?returnTo=%2Flistings%3Fmake%3DHonda%26model%3DCivic%26page%3D2%26sort%3DpriceAsc%26availability%3Dall%23listing-results",
    );
  });

  it("rejects duplicate known URL Filters", () => {
    expect(resolveAnalysisNavigation({ make: ["Ford", "Volvo"] })).toBeNull();
    expect(resolveListingNavigation({ page: ["1", "2"] })).toBeNull();
  });

  it("retains listing filters and the known results anchor in a return destination", () => {
    expect(safeListingsReturnHref("/listings?make=Honda&model=Civic&page=2")).toBe(
      "/listings?make=Honda&model=Civic&page=2",
    );
    expect(safeListingsReturnHref("/listings")).toBe("/listings");
    expect(safeListingsReturnHref("/listings?make=Toyota&page=2#listing-results")).toBe("/listings?make=Toyota&page=2#listing-results");
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

  it("returns only to the local comparison view and its known evidence anchor", () => {
    const href = "/compare?ids=a,b&reference=b&differences=1#car-comparison";
    expect(safeListingsReturnHref(href)).toBe(href);
    for (const rejected of ["https://example.test/compare", "//example.test/compare", "/compare/../admin", "/compare#unknown", "/compare/elsewhere"]) {
      expect(safeListingsReturnHref(rejected)).toBe("/listings");
    }
  });

  it("allows workspace returns on the overview and comparison without widening them to arbitrary pages", () => {
    for (const href of ["/#saved-workspace", "/compare#saved-workspace", "/compare?ids=a,b&reference=b&differences=1#saved-workspace"]) {
      expect(safeListingsReturnHref(href)).toBe(href);
    }
    for (const href of ["/#unknown", "/?make=Toyota#saved-workspace", "https://example.test/#saved-workspace", "//example.test/#saved-workspace", "/admin#saved-workspace"]) {
      expect(safeListingsReturnHref(href)).toBe("/listings");
    }
  });
});
