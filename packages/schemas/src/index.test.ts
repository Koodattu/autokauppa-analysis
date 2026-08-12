import { describe, expect, it } from "vitest";
import {
  analysisQueryUrlFilter,
  listingFiltersQuerySchema,
  listingIdSchema,
  listingSearchQuerySchema,
  listingSearchUrlFilter,
} from "./index";

describe("listing query schemas", () => {
  it("parses the primary analytics dimensions", () => {
    expect(
      listingFiltersQuerySchema.parse({
        make: "Ford",
        model: "Mondeo",
        modelYear: "2018",
        fuelType: "Diesel",
        transmission: "Automatic",
      }),
    ).toMatchObject({
      make: "Ford",
      model: "Mondeo",
      modelYear: 2018,
      fuelType: "Diesel",
      transmission: "Automatic",
      availability: "all",
      interval: "week",
    });
  });

  it("rejects reversed ranges and unreasonable public-query values", () => {
    expect(
      listingFiltersQuerySchema.safeParse({ priceMin: "20000", priceMax: "10000" }).success,
    ).toBe(false);
    expect(listingFiltersQuerySchema.safeParse({ mileageMax: "3000000" }).success).toBe(false);
    expect(listingFiltersQuerySchema.safeParse({ from: "2026-99-99" }).success).toBe(false);
    expect(
      listingFiltersQuerySchema.safeParse({ from: "2020-01-01", to: "2023-01-01" }).success,
    ).toBe(false);
    expect(listingSearchQuerySchema.safeParse({ page: "1001" }).success).toBe(false);
  });

  it("rejects combining an exact model year with a model-year range", () => {
    expect(
      listingFiltersQuerySchema.safeParse({ modelYear: "2020", modelYearFrom: "2018" }).success,
    ).toBe(false);
  });

  it("parses and formats canonical analysis-query URLs", () => {
    const parsed = analysisQueryUrlFilter.parse(
      new URLSearchParams("model=Mondeo&make=Ford&priceMin=10000&availability=all"),
    );

    expect(parsed).toEqual({
      ok: true,
      query: expect.objectContaining({
        make: "Ford",
        model: "Mondeo",
        priceMin: 10_000,
        availability: "all",
        interval: "week",
      }),
    });
    if (parsed.ok) {
      expect(analysisQueryUrlFilter.format(parsed.query).toString()).toBe(
        "make=Ford&model=Mondeo&priceMin=10000",
      );
    }
  });

  it("rejects duplicate known filters and ignores unrelated URL state", () => {
    expect(analysisQueryUrlFilter.parse(new URLSearchParams("make=Ford&make=Volvo"))).toEqual({
      ok: false,
      issues: [{ code: "duplicate", path: ["make"], message: "make must be provided once." }],
    });
    expect(analysisQueryUrlFilter.parse(new URLSearchParams("compare=price"))).toEqual({
      ok: true,
      query: expect.objectContaining({ availability: "all", interval: "week" }),
    });
  });

  it("omits listing-view defaults while retaining explicit paging and sorting", () => {
    const defaults = listingSearchQuerySchema.parse({});
    expect(listingSearchUrlFilter.format(defaults).toString()).toBe("");

    const customized = listingSearchQuerySchema.parse({ page: "2", sort: "priceAsc" });
    expect(listingSearchUrlFilter.format(customized).toString()).toBe("page=2&sort=priceAsc");
  });

  it("projects Analysis Queries into Listing Views and filter metadata", () => {
    const analysis = listingFiltersQuerySchema.parse({
      make: "Ford",
      model: "Mondeo",
      modelYearFrom: 2018,
      priceMax: 25_000,
      mileageMax: 150_000,
      availability: "current",
      sellerType: "dealer",
      fuelType: "Diesel",
      transmission: "Automatic",
      from: "2026-01-01",
      to: "2026-08-01",
      interval: "month",
    });

    const listing = analysisQueryUrlFilter.toListingSearch(analysis);

    expect(listing).toMatchObject({
      make: "Ford",
      model: "Mondeo",
      modelYearFrom: 2018,
      priceMax: 25_000,
      mileageMax: 150_000,
      availability: "current",
      sellerType: "dealer",
      fuelType: "Diesel",
      transmission: "Automatic",
      page: 1,
      pageSize: 25,
      sort: "lastSeenDesc",
      interval: "week",
    });
    expect(listing.from).toBeUndefined();
    expect(listing.to).toBeUndefined();
    expect(analysisQueryUrlFilter.formatForFilterMetadata(analysis).toString()).toBe(
      "make=Ford&model=Mondeo",
    );
  });

  it("projects Listing Views into Analysis Queries and changes only the page", () => {
    const listing = listingSearchQuerySchema.parse({
      make: "Volvo",
      from: "2026-01-01",
      to: "2026-02-01",
      interval: "day",
      page: 3,
      pageSize: 50,
      sort: "priceAsc",
    });

    const analysis = listingSearchUrlFilter.toAnalysisQuery(listing);
    const nextPage = listingSearchUrlFilter.withPage(listing, 4);

    expect(analysis).toMatchObject({
      make: "Volvo",
      from: "2026-01-01",
      to: "2026-02-01",
      interval: "day",
    });
    expect("page" in analysis).toBe(false);
    expect(nextPage).toEqual({ ...listing, page: 4 });
    expect(listing.page).toBe(3);
  });

  it("validates public listing identifiers", () => {
    expect(listingIdSchema.safeParse("not-a-listing-id").success).toBe(false);
    expect(listingIdSchema.safeParse("d9428888-122b-11e1-b85c-61cd3cbb3210").success).toBe(true);
  });
});
