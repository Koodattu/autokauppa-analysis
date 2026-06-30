import { describe, expect, it } from "vitest";
import currentFixture from "../fixtures/nettiauto/current-page-1.json";
import malformedFixture from "../fixtures/nettiauto/malformed-page.json";
import soldFixture from "../fixtures/nettiauto/sold-page-1.json";
import {
  issueAdminSessionCookieValue,
  verifyAdminPassword,
  verifyAdminSessionCookieValue,
} from "./auth";
import { parseNettiautoAjaxSearchResult } from "./nettiauto";

describe("Nettiauto Search Result parser", () => {
  it("parses current AJAX fixture into active normalized listings", () => {
    const page = parseNettiautoAjaxSearchResult(currentFixture, {
      crawlKind: "current",
      pageNumber: 1,
    });

    expect(page.issues).toEqual([]);
    expect(page.listings).toHaveLength(2);
    expect(page.listings[0]?.sourceListingId).toBe("1001");
    expect(page.listings[0]?.normalized.availability).toBe("active");
    expect(page.listings[0]?.normalized.askingPriceEur).toBe(18900);
    expect(page.listings[0]?.normalized.observedSoldPriceEur).toBeNull();
    expect(page.listings[1]?.normalized.sellerTypeSourceLabel).toBe("private");
    expect(page.listings[1]?.images[0]?.imageUrl).toBe("https://www.nettiauto.com/images/1002.jpg");
  });

  it("parses sold AJAX fixture only when sold crawl and sold source label agree", () => {
    const soldPage = parseNettiautoAjaxSearchResult(soldFixture, {
      crawlKind: "sold",
      pageNumber: 1,
    });
    const currentPage = parseNettiautoAjaxSearchResult(soldFixture, {
      crawlKind: "current",
      pageNumber: 1,
    });

    expect(soldPage.listings[0]?.normalized.availability).toBe("sold");
    expect(soldPage.listings[0]?.normalized.observedSoldPriceEur).toBe(11900);
    expect(soldPage.listings[0]?.normalized.askingPriceEur).toBeNull();
    expect(currentPage.listings[0]?.normalized.availability).toBe("unknown");
  });

  it("does not produce listings when source listing identity is missing", () => {
    const page = parseNettiautoAjaxSearchResult(malformedFixture, {
      crawlKind: "current",
      pageNumber: 1,
    });

    expect(page.listings).toEqual([]);
    expect(page.issues[0]?.code).toBe("invalid_datalayer_json");
  });
});

describe("Admin Password Gate", () => {
  it("signs and verifies small stateless admin session cookies", () => {
    const secret = "test-session-secret-that-is-long-enough";
    const cookie = issueAdminSessionCookieValue(secret, new Date("2026-06-30T00:00:00.000Z"));
    const session = verifyAdminSessionCookieValue(
      cookie,
      secret,
      new Date("2026-07-01T00:00:00.000Z"),
    );

    expect(session?.scope).toBe("admin");
    expect(verifyAdminSessionCookieValue(`${cookie}tampered`, secret)).toBeNull();
    expect(verifyAdminSessionCookieValue(cookie, "different-secret")).toBeNull();
    expect(
      verifyAdminSessionCookieValue(cookie, secret, new Date("2026-07-08T00:00:01.000Z")),
    ).toBeNull();
  });

  it("compares admin passwords without plain equality", () => {
    expect(verifyAdminPassword("correct", "correct")).toBe(true);
    expect(verifyAdminPassword("wrong", "correct")).toBe(false);
  });
});
