import { describe, expect, it } from "vitest";
import { cloneComparisonHref, comparisonParams, researchHref, researchQuery } from "./research-navigation";
import { parseCompareIds, parseSavedState } from "./saved-views";
import { sourceListingId } from "./listing-lookup";

describe("price research navigation", () => {
  it("keeps car age and observation periods independent and preserves drilldown dates", () => {
    const params = { make: "Honda", model: "Civic", modelYear: "2019", transmission: "Manual", mileageMin: "90000", mileageMax: "110000", from: "2023-01-01", to: "2023-12-31", comparing: "1", compareFrom: "2025-01-01", compareTo: "2025-12-31" };
    const query = researchQuery(params);
    expect(query).toMatchObject({ ok: true, query: { modelYear: 2019, from: "2023-01-01", availability: "current" } });
    const cloned = Object.fromEntries(new URL(cloneComparisonHref(params), "https://example.test").searchParams);
    expect(comparisonParams(cloned)).toMatchObject({ make: "Honda", modelYear: "2019", transmission: "Manual", mileageMin: "90000" });
    expect(researchHref(params, { priceMax: 20000 })).toContain("from=2023-01-01");
    expect(researchQuery({ ...params, make: ["Honda", "Toyota"] }).ok).toBe(false);
    expect(researchQuery({ ...params, comparing: "1", compareFrom: "bad" }, true).ok).toBe(false);
  });
  it("rejects unsafe or oversized saved and comparison state", () => {
    expect(parseCompareIds("bad-id")).toBeNull();
    expect(parseSavedState('{"cars":[],"searches":[{"title":"x","href":"//evil.test"}]}').searches).toEqual([]);
    expect(parseSavedState("bad-json").cars).toEqual([]);
  });
  it("looks up only numeric IDs on the intended source", () => {
    expect(sourceListingId("https://www.nettiauto.com/honda/civic/123456")).toBe("123456");
    expect(sourceListingId("123456")).toBe("123456");
    expect(sourceListingId("https://nettiauto.com.evil.test/123456")).toBeNull();
    expect(sourceListingId("https://user:password@nettiauto.com/123456")).toBeNull();
  });
});
