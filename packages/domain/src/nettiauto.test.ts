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
    expect(page.normalizedData.sourceUpdatedDate).toBe("2026-07-07");
  });

  it("parses the current detail header date and location markup", () => {
    const page = parseNettiautoDetailPage(
      '<html><body><div class="details-page-header__item_date-location"><span class="details-page-header__item_date">Päivitetty 05.07.2026</span><span class="details-page-header__item_location">Kurikka, Etelä-Pohjanmaa</span></div></body></html>',
      { sourceListingId: "15784076" },
    );

    expect(page.sourceUpdatedDate).toBe("2026-07-05");
    expect(page.sourceUpdatedDateSource).toBe("detail_header");
    expect(page.normalizedData.sourceLocationLabel).toBe("Kurikka, Etelä-Pohjanmaa");
    expect(page.sourceHtmlFragment).toContain("details-page-header__item_location");
  });

  it("parses detail page vehicle fields, JSON-LD, and detail images", () => {
    const box = (label: string, value: string) =>
      `<div class="vehicle-info-box"><span class="vehicle-info-box__vehicle-info">${label}</span><span class="vehicle-info-box__vehicle-det">${value}</span></div>`;
    const page = parseNettiautoDetailPage(
      `<html><head>
        <title>Volkswagen Transporter 2016 - Vaihtoauto - Nettiauto</title>
        <meta name="description" content="Nyt myynnissä Volkswagen Transporter, 120 000 km, 2016 - Kuopio">
        <script type="application/ld+json">${JSON.stringify({
          "@context": "https://schema.org",
          "@type": ["Product", "Car"],
          name: "Volkswagen Transporter 2016",
          brand: { "@type": "Brand", name: "Volkswagen" },
          model: "Transporter",
          color: "Valkoinen",
          vehicleIdentificationNumber: "WV1ZZZ7HZGH061848",
          vehicleModelDate: 2016,
          mileageFromOdometer: { "@type": "QuantitativeValue", value: 120000, unitText: "KM" },
          image: [
            "https://images.nettiauto.com/live/15848827/front-large.jpg",
            "https://images.nettiauto.com/live/15848827/side-large.jpg",
          ],
          offers: {
            "@type": "Offer",
            price: 17099,
            priceCurrency: "EUR",
            availability: "https://schema.org/InStock",
            seller: { "@type": "Organization", name: "Autoliike Malli" },
          },
        })}</script>
      </head><body>
        <h1 class="details-page-header__item-title">Volkswagen Transporter</h1>
        <div class="details-page-header__item-price-main">17 099 €</div>
        <div class="details-page-header__item-type">Pitkä 2,0 TDI</div>
        <div class="unique-selling-point">Rahoitus saatavilla</div>
        ${box("Päivitetty 07.07.2026", "Kuopio, Pohjois-Savo")}
        ${box("Rekisterinumero", "GLU-494")}
        ${box("Mittarilukema", "120 000 km")}
        ${box("Moottori", "2,0 l, Diesel")}
        ${box("Vuosimalli", "2016 (ensirek. 12-2015)")}
        ${box("Käyttöönottopäivä", "16.12.2015")}
        ${box("Vaihteisto", "Manuaali")}
        ${box("Vetotapa", "Etuveto")}
        ${box("Toimistomaksu", "299 €")}
        ${box("Katsastettu", "9/2025")}
        ${box("Korimalli", "Muu")}
        ${box("Auton tyyppi", "Pakettiauto")}
        ${box("Väri", "Valkoinen")}
        <div class="vehicle-info-box">
          <span class="vehicle-info-box__vehicle-info">VIN-numero <span>Ajoneuvon yksilöllinen valmistenumero.</span></span>
          <span class="vehicle-info-box__vehicle-det">WV1ZZZ7HZGH061848</span>
        </div>
        ${box("Teho", "75 kW / 102 Hv")}
        ${box("Huippunopeus", "165 km/h")}
        ${box("Kiihtyvyys (0-100)", "14,9 s")}
        ${box("Henkilömäärä", "3")}
        ${box("Ovien lkm", "6")}
        ${box("Ohjauslaite", "Vasemmalla")}
        ${box("Omamassa", "2 031 kg")}
        ${box("Kokonaismassa", "3 000 kg")}
        ${box("Vetomassa (jarrullinen)", "2 200 kg")}
        ${box("Vetomassa (ei jarruja)", "750 kg")}
        ${box("CO2 -päästöt", "157 g/km")}
        <div class="vehicle-info-box">
          <span class="vehicle-info-box__vehicle-info">Polttoaineen kulutus</span>
          <span class="vehicle-info-box__vehicle-det">
            <div>Kaupunki: 8,2 l/100 km</div>
            <div>Maantie: 5,5 l/100 km</div>
            <div>Yhdistetty: 6 l/100 km</div>
          </span>
        </div>
        ${box("Akseliväli", "3 000 mm")}
        <section id="energyGradeMainSection">
          <button data-grade-number="D">Avaa</button>
        </section>
        <section class="vehicle-all-info__section">
          <div class="vehicle-all-info__title">Sisätilat ja mukavuudet</div>
          <div class="vehicle-all-info__details_block">Nahkaverhoilu</div>
          <div class="vehicle-all-info__details_block">Ohjaustehostin</div>
          <span class="vehicle-all-info__details_block">Nahkaverhoilu</span>
        </section>
        <section class="vehicle-all-info__section">
          <div class="vehicle-all-info__title">Lisätiedot</div>
          <div id="shortNote"><p>Lyhyt katkelma.</p></div>
          <div id="fullNote">
            <p>Siisti paku kahdella rengassarjalla.</p>
            <p>Huollettu säännöllisesti.</p>
          </div>
        </section>
      </body></html>`,
      { sourceListingId: "15848827" },
    );

    expect(page.sourceUpdatedDate).toBe("2026-07-07");
    expect(page.sourceUpdatedDateSource).toBe("detail_field");
    expect(page.normalizedData.sourceLocationLabel).toBe("Kuopio, Pohjois-Savo");
    expect(page.normalizedData.registrationNumber).toBe("GLU-494");
    expect(page.normalizedData.vin).toBe("WV1ZZZ7HZGH061848");
    expect(page.normalizedData.officeFeeEur).toBe(299);
    expect(page.normalizedData.mileageKm).toBe(120000);
    expect(page.normalizedData.engineSourceLabel).toBe("2,0 l, Diesel");
    expect(page.normalizedData.fuelTypeSourceLabel).toBe("Diesel");
    expect(page.normalizedData.firstRegistrationDate).toBe("2015-12-16");
    expect(page.normalizedData.transmissionSourceLabel).toBe("Manuaali");
    expect(page.normalizedData.bodyTypeSourceLabel).toBe("Muu");
    expect(page.normalizedData.colorSourceLabel).toBe("Valkoinen");
    expect(page.normalizedData.powerKw).toBe(75);
    expect(page.normalizedData.powerHp).toBe(102);
    expect(page.normalizedData.acceleration0To100S).toBe(14.9);
    expect(page.normalizedData.co2GKm).toBe(157);
    expect(page.normalizedData.energyEfficiencyClassSourceLabel).toBe("D");
    expect(page.normalizedData.fuelConsumptionSourceLabel).toBe(
      "Kaupunki: 8,2 l/100 km\nMaantie: 5,5 l/100 km\nYhdistetty: 6 l/100 km",
    );
    expect(page.normalizedData.fuelConsumptionCityL100Km).toBe(8.2);
    expect(page.normalizedData.fuelConsumptionHighwayL100Km).toBe(5.5);
    expect(page.normalizedData.fuelConsumptionCombinedL100Km).toBe(6);
    expect(page.normalizedData.detailTitleSourceLabel).toBe("Volkswagen Transporter");
    expect(page.normalizedData.detailSubtitleSourceLabel).toBe("Pitkä 2,0 TDI");
    expect(page.normalizedData.detailPriceSourceLabel).toBe("17 099 €");
    expect(page.normalizedData.uniqueSellingPointSourceLabel).toBe("Rahoitus saatavilla");
    expect(page.normalizedData.sellerNotes).toBe(
      "Siisti paku kahdella rengassarjalla.\n\nHuollettu säännöllisesti.",
    );
    expect(page.normalizedData.equipmentGroups).toEqual([
      {
        label: "Sisätilat ja mukavuudet",
        items: ["Nahkaverhoilu", "Ohjaustehostin"],
      },
    ]);
    expect(page.normalizedData.additionalSourceFields).toEqual([
      { label: "Akseliväli", value: "3 000 mm" },
    ]);
    expect(page.normalizedData.jsonLdPriceEur).toBe(17099);
    expect(page.images.map((image) => image.imageUrl)).toEqual([
      "https://images.nettiauto.com/live/15848827/front-large.jpg",
      "https://images.nettiauto.com/live/15848827/side-large.jpg",
    ]);
    expect(page.sourcePayload.fields).toContainEqual({
      label: "Rekisterinumero",
      value: "GLU-494",
    });
    expect(page.sourcePayload.fields).toContainEqual({
      label: "VIN-numero",
      value: "WV1ZZZ7HZGH061848",
    });
    expect(page.sourcePayload.meta[0]).toEqual({
      key: "description",
      value: "Nyt myynnissä Volkswagen Transporter, 120 000 km, 2016 - Kuopio",
    });
  });

  it("keeps parsing the legacy reversed detail field classes", () => {
    const page = parseNettiautoDetailPage(
      '<html><body><div class="vehicle-info-box"><span class="vehicle-info-box__vehicle-det">Vaihteisto</span><span class="vehicle-info-box__vehicle-info">Automaatti</span></div></body></html>',
      { sourceListingId: "123" },
    );

    expect(page.normalizedData.transmissionSourceLabel).toBe("Automaatti");
    expect(page.sourcePayload.fields).toContainEqual({
      label: "Vaihteisto",
      value: "Automaatti",
    });
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
