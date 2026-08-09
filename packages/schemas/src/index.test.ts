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

  it("validates public listing identifiers", () => {
    expect(listingIdSchema.safeParse("not-a-listing-id").success).toBe(false);
    expect(listingIdSchema.safeParse("d9428888-122b-11e1-b85c-61cd3cbb3210").success).toBe(true);
  });
});
