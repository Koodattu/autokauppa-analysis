import { describe, expect, it } from "vitest";
import { listingFiltersQuerySchema, listingIdSchema, listingSearchQuerySchema } from "./index";

describe("listing query schemas", () => {
  it("parses the primary analytics dimensions", () => {
    expect(
      listingFiltersQuerySchema.parse({
        make: "Ford",
        model: "Mondeo",
        modelYear: "2018",
        transmission: "Automatic",
      }),
    ).toMatchObject({
      make: "Ford",
      model: "Mondeo",
      modelYear: 2018,
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
    expect(listingSearchQuerySchema.safeParse({ page: "1001" }).success).toBe(false);
  });

  it("validates public listing identifiers", () => {
    expect(listingIdSchema.safeParse("not-a-listing-id").success).toBe(false);
    expect(listingIdSchema.safeParse("d9428888-122b-11e1-b85c-61cd3cbb3210").success).toBe(true);
  });
});
