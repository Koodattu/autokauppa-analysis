import { describe, expect, it } from "vitest";
import {
  APP_LOCALE,
  formatCompactNumber,
  formatCurrency,
  formatListingPrice,
  formatDate,
  formatDateTime,
  formatMonthDay,
  formatMonthYear,
  formatNumber,
} from "./format";

describe("public English formatting", () => {
  it("distinguishes unpriced listings from real zero fees and price differences", () => {
    expect(formatListingPrice(0)).toBe("Not recorded");
    expect(formatListingPrice(null)).toBe("Not recorded");
    expect(formatListingPrice(-100)).toBe("Not recorded");
    expect(formatListingPrice(20000)).toBe("20\u00a0000 €");
    expect(formatCurrency(0)).toBe("0 €");
  });
  it("uses English content with Finnish regional punctuation", () => {
    expect(APP_LOCALE).toBe("en-FI");
    expect(formatNumber(1_234_567)).toBe("1 234 567");
    expect(formatCompactNumber(14_900)).toBe("14,9K");
  });

  it("uses English date labels in Helsinki time", () => {
    expect(formatDate("2026-07-16")).toBe("16 Jul 2026");
    expect(formatDateTime("2026-07-16T13:20:00Z")).toBe("16 Jul 2026, 16.20");
    expect(formatMonthYear("2026-07-16")).toBe("Jul 26");
    expect(formatMonthDay("2026-07-16")).toBe("16 Jul");
  });

  it("does not shift date-only values across a day boundary", () => {
    expect(formatDate("2026-01-01")).toBe("1 Jan 2026");
    expect(formatDate(null)).toBe("–");
  });
});
