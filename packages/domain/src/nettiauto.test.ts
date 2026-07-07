import { describe, expect, it } from "vitest";
import currentFixture from "../fixtures/nettiauto/current-page-1.json";
import malformedFixture from "../fixtures/nettiauto/malformed-page.json";
import soldFixture from "../fixtures/nettiauto/sold-page-1.json";
import {
  issueAdminSessionCookieValue,
  verifyAdminPassword,
  verifyAdminSessionCookieValue,
} from "./auth";
import {
  buildNettiautoSearchUrl,
  classifyNettiautoResponseBody,
  nettiautoAjaxRequestHeaders,
  parseNettiautoDetailPage,
  parseNettiautoAjaxSearchResult,
} from "./nettiauto";
import { shouldScheduleSourceSearchQuery } from "./persistence";

describe("Nettiauto Search Result parser", () => {
  it("builds newest-first AJAX search URLs from stored query params", () => {
    const url = new URL(
      buildNettiautoSearchUrl("/vaihtoautot", "P2236304442", 3, {
        haku: "P2236304442",
        sortCol: "dateCreated",
        ord: "desc",
      }),
    );

    expect(url.pathname).toBe("/vaihtoautot");
    expect(url.searchParams.get("haku")).toBe("P2236304442");
    expect(url.searchParams.get("sortCol")).toBe("dateCreated");
    expect(url.searchParams.get("ord")).toBe("desc");
    expect(url.searchParams.get("page")).toBe("3");
  });

  it("uses browser-like AJAX headers without cookies", () => {
    const headers = nettiautoAjaxRequestHeaders("/vaihtoautot", "P2236304442", {
      haku: "P2236304442",
      sortCol: "dateCreated",
      ord: "desc",
    });

    expect(headers.accept).toBe("*/*");
    expect(headers["x-requested-with"]).toBe("XMLHttpRequest");
    expect(headers["user-agent"]).toContain("Chrome/");
    expect(headers).not.toHaveProperty("cookie");
    expect(new URL(headers.referer).searchParams.get("sortCol")).toBe("dateCreated");
  });

  it("classifies non-JSON response bodies before parser use", () => {
    expect(classifyNettiautoResponseBody('{"ad_listing_data":""}', "application/json")).toBe(
      "ajax_json",
    );
    expect(classifyNettiautoResponseBody("<!doctype html><html></html>", "text/html")).toBe(
      "html_document",
    );
    expect(classifyNettiautoResponseBody("<div>blocked</div>", "text/html")).toBe(
      "html_fragment",
    );
  });

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

  it("extracts the listing URL by source listing id instead of first card link", () => {
    const page = parseNettiautoAjaxSearchResult(
      {
        total_ads: 1,
        current_page: 1,
        total_page: 1,
        ad_listing_data:
          "<article class=\"listing-card\" data-datalayer='{\"item_id\":\"3001\",\"item_name\":\"Corolla\",\"item_brand\":\"Toyota\",\"item_variant\":\"Corolla\",\"item_vehicle_price\":\"18900\",\"item_ad_status\":\"Myynnissä\"}'>" +
          '<a href="https://www.almamedia.fi/markkinapaikkaehdot/#listajarjestys-ja-lisanakyvyys">Terms</a>' +
          '<a href="/toyota/corolla/3001?utm_source=list#details">Toyota Corolla</a>' +
          "</article>",
      },
      {
        crawlKind: "current",
        pageNumber: 1,
      },
    );

    expect(page.issues).toEqual([]);
    expect(page.listings[0]?.normalized.sourceUrl).toBe(
      "https://www.nettiauto.com/toyota/corolla/3001",
    );
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

  it("parses source updated date from detail page header text", () => {
    const page = parseNettiautoDetailPage(
      '<html><body><div class="page-header__item_date-location">Päivitetty 07.07.2026 Jyväskylä, Keski-Suomi ID 15847995</div></body></html>',
      { sourceListingId: "15847995" },
    );

    expect(page.sourceUpdatedDate).toBe("2026-07-07");
    expect(page.sourceUpdatedDateLabel).toBe("Päivitetty 07.07.2026");
    expect(page.sourceUpdatedDateSource).toBe("detail_header");
    expect(page.sourceHtmlFragment).toContain("page-header__item_date-location");
  });

  it("leaves source updated date empty when detail page has no update label", () => {
    const page = parseNettiautoDetailPage(
      '<html><body><div class="page-header__item_date-location">Tuusula, Uusimaa ID 8478272</div></body></html>',
      { sourceListingId: "8478272" },
    );

    expect(page.sourceUpdatedDate).toBeNull();
    expect(page.sourceUpdatedDateLabel).toBeNull();
    expect(page.sourceUpdatedDateSource).toBeNull();
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

describe("Source Search Query scheduling", () => {
  const now = new Date("2026-07-05T12:00:00.000Z");
  const weekSeconds = 7 * 24 * 60 * 60;
  const monthSeconds = 30 * 24 * 60 * 60;

  it("schedules a query that has never been attempted", () => {
    expect(
      shouldScheduleSourceSearchQuery(
        {
          hasActiveCrawlRun: false,
          lastAttemptAt: null,
          targetCadenceSeconds: weekSeconds,
        },
        now,
      ),
    ).toBe(true);
  });

  it("keeps weekly current listings idle until the attempt cadence has elapsed", () => {
    expect(
      shouldScheduleSourceSearchQuery(
        {
          hasActiveCrawlRun: false,
          lastAttemptAt: "2026-06-30T12:00:00.000Z",
          targetCadenceSeconds: weekSeconds,
        },
        now,
      ),
    ).toBe(false);

    expect(
      shouldScheduleSourceSearchQuery(
        {
          hasActiveCrawlRun: false,
          lastAttemptAt: "2026-06-28T12:00:00.000Z",
          targetCadenceSeconds: weekSeconds,
        },
        now,
      ),
    ).toBe(true);
  });

  it("keeps monthly sold listings idle until the attempt cadence has elapsed", () => {
    expect(
      shouldScheduleSourceSearchQuery(
        {
          hasActiveCrawlRun: false,
          lastAttemptAt: "2026-06-15T12:00:00.000Z",
          targetCadenceSeconds: monthSeconds,
        },
        now,
      ),
    ).toBe(false);

    expect(
      shouldScheduleSourceSearchQuery(
        {
          hasActiveCrawlRun: false,
          lastAttemptAt: "2026-06-05T12:00:00.000Z",
          targetCadenceSeconds: monthSeconds,
        },
        now,
      ),
    ).toBe(true);
  });

  it("allows manual force to bypass cadence but not an active crawl run", () => {
    expect(
      shouldScheduleSourceSearchQuery(
        {
          force: true,
          hasActiveCrawlRun: false,
          lastAttemptAt: "2026-07-05T11:00:00.000Z",
          targetCadenceSeconds: weekSeconds,
        },
        now,
      ),
    ).toBe(true);

    expect(
      shouldScheduleSourceSearchQuery(
        {
          force: true,
          hasActiveCrawlRun: true,
          lastAttemptAt: "2026-06-01T12:00:00.000Z",
          targetCadenceSeconds: weekSeconds,
        },
        now,
      ),
    ).toBe(false);
  });
});
