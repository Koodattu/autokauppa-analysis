import { createHash } from "node:crypto";
import { load } from "cheerio/slim";
import {
  nettiautoAjaxResponseSchema,
  nettiautoDataLayerSchema,
  type NettiautoDataLayer,
} from "@nettiauto/schemas";

export const NETTIAUTO_SOURCE = "nettiauto" as const;
export const NETTIAUTO_PARSER_VERSION = "nettiauto-search-result-v1";
export const NETTIAUTO_DETAIL_PARSER_VERSION = "nettiauto-detail-v1";
export const NETTIAUTO_BASE_URL = "https://www.nettiauto.com";
export const NETTIAUTO_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

export type CrawlKind = "current" | "sold";
export type ListingAvailability = "active" | "sold" | "unknown";
export type NettiautoQueryParams = Record<string, unknown>;
export type NettiautoResponseBodyShape =
  | "ajax_json"
  | "html_document"
  | "html_fragment"
  | "redirect"
  | "blocked"
  | "unknown";

export interface ParsedImageMetadata {
  imageUrl: string;
  imageRole: string | null;
  position: number | null;
  width: number | null;
  height: number | null;
}

export interface NormalizedListingData {
  source: typeof NETTIAUTO_SOURCE;
  sourceListingId: string;
  sourceUrl: string | null;
  availability: ListingAvailability;
  sourceStatusLabel: string | null;
  askingPriceEur: number | null;
  observedSoldPriceEur: number | null;
  priceSourceLabel: string | null;
  mileageKm: number | null;
  mileageSourceLabel: string | null;
  yearModel: number | null;
  makeSourceLabel: string | null;
  modelSourceLabel: string | null;
  fuelTypeSourceLabel: string | null;
  transmissionSourceLabel: string | null;
  bodyTypeSourceLabel: string | null;
  colorSourceLabel: string | null;
  sellerSourceLabel: string | null;
  sellerTypeSourceLabel: string | null;
  pageNumber: number | null;
  position: number | null;
  sourceListId: string | null;
  sourceListName: string | null;
  sourceListLocation: string | null;
}

export interface ParsedListingCard {
  sourceListingId: string;
  sourcePayload: NettiautoDataLayer;
  sourceHtmlFragment: string;
  sourcePayloadSha256: string;
  parserVersion: typeof NETTIAUTO_PARSER_VERSION;
  normalized: NormalizedListingData;
  images: ParsedImageMetadata[];
  changeHash: string;
}

export interface ParseIssue {
  code: "invalid_ajax_json" | "invalid_datalayer_json" | "missing_source_listing_id";
  message: string;
}

export type NettiautoDetailUpdatedDateSource = "detail_header" | "detail_field" | "detail_body";

export interface ParsedNettiautoDetailField {
  label: string;
  value: string;
}

export interface ParsedNettiautoDetailMeta {
  key: string;
  value: string;
}

export interface NettiautoDetailNormalizedData {
  detailParserVersion: typeof NETTIAUTO_DETAIL_PARSER_VERSION;
  sourceUpdatedDate: string | null;
  sourceUpdatedDateLabel: string | null;
  sourceUpdatedDateSource: NettiautoDetailUpdatedDateSource | null;
  sourceLocationLabel: string | null;
  registrationNumber: string | null;
  vin: string | null;
  mileageKm: number | null;
  engineSourceLabel: string | null;
  fuelTypeSourceLabel: string | null;
  yearModel: number | null;
  firstRegistrationDate: string | null;
  transmissionSourceLabel: string | null;
  drivetrainSourceLabel: string | null;
  inspectionDateLabel: string | null;
  bodyTypeSourceLabel: string | null;
  vehicleTypeSourceLabel: string | null;
  colorSourceLabel: string | null;
  powerKw: number | null;
  powerHp: number | null;
  topSpeedKmh: number | null;
  acceleration0To100S: number | null;
  seatCount: number | null;
  doorCount: number | null;
  steeringSideSourceLabel: string | null;
  curbWeightKg: number | null;
  grossWeightKg: number | null;
  towingWeightBrakedKg: number | null;
  towingWeightUnbrakedKg: number | null;
  co2GKm: number | null;
  fuelConsumptionSourceLabel: string | null;
  sellerNotes: string | null;
  jsonLdAvailability: string | null;
  jsonLdPriceEur: number | null;
  jsonLdSellerName: string | null;
}

export interface ParsedNettiautoDetailSourcePayload {
  title: string | null;
  sourceUpdatedDate: string | null;
  sourceUpdatedDateLabel: string | null;
  sourceUpdatedDateSource: NettiautoDetailUpdatedDateSource | null;
  sourceLocationLabel: string | null;
  meta: ParsedNettiautoDetailMeta[];
  jsonLd: Record<string, unknown>[];
  fields: ParsedNettiautoDetailField[];
  images: ParsedImageMetadata[];
  normalizedData: NettiautoDetailNormalizedData;
}

export interface ParsedSearchResultPage {
  source: typeof NETTIAUTO_SOURCE;
  crawlKind: CrawlKind;
  parserVersion: typeof NETTIAUTO_PARSER_VERSION;
  currentPage: number | null;
  totalPages: number | null;
  totalAds: number | null;
  listings: ParsedListingCard[];
  issues: ParseIssue[];
}

export interface ParsedNettiautoDetailPage {
  source: typeof NETTIAUTO_SOURCE;
  sourceListingId: string;
  parserVersion: typeof NETTIAUTO_DETAIL_PARSER_VERSION;
  sourceUpdatedDate: string | null;
  sourceUpdatedDateLabel: string | null;
  sourceUpdatedDateSource: NettiautoDetailUpdatedDateSource | null;
  sourceHtmlFragment: string | null;
  sourcePayload: ParsedNettiautoDetailSourcePayload;
  normalizedData: NettiautoDetailNormalizedData;
  images: ParsedImageMetadata[];
}

export function buildNettiautoSearchUrl(
  entryPath: string,
  sourceSearchHash: string,
  pageNumber: number,
  queryParams: NettiautoQueryParams = {},
) {
  const url = new URL(entryPath, NETTIAUTO_BASE_URL);
  applyNettiautoQueryParams(url, sourceSearchHash, queryParams);
  url.searchParams.set("page", String(pageNumber));
  return url.toString();
}

export function nettiautoAjaxRequestHeaders(
  entryPath: string,
  sourceSearchHash: string,
  queryParams: NettiautoQueryParams = {},
) {
  const referer = new URL(entryPath, NETTIAUTO_BASE_URL);
  applyNettiautoQueryParams(referer, sourceSearchHash, queryParams);

  return {
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9,fi;q=0.8,fi-FI;q=0.7",
    "cache-control": "no-cache",
    pragma: "no-cache",
    "user-agent": NETTIAUTO_BROWSER_USER_AGENT,
    "x-requested-with": "XMLHttpRequest",
    referer: referer.toString(),
  };
}

export function nettiautoDetailRequestHeaders(sourceUrl: string) {
  return {
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9,fi;q=0.8,fi-FI;q=0.7",
    "cache-control": "no-cache",
    pragma: "no-cache",
    "user-agent": NETTIAUTO_BROWSER_USER_AGENT,
    "x-requested-with": "XMLHttpRequest",
    referer: sourceUrl,
  };
}

export function emptyNettiautoSearchResultPage(
  options: { crawlKind: CrawlKind; pageNumber?: number },
): ParsedSearchResultPage {
  return {
    source: NETTIAUTO_SOURCE,
    crawlKind: options.crawlKind,
    parserVersion: NETTIAUTO_PARSER_VERSION,
    currentPage: options.pageNumber ?? null,
    totalPages: null,
    totalAds: null,
    listings: [],
    issues: [],
  };
}

export function classifyNettiautoResponseBody(
  body: string,
  contentType: string | null,
): NettiautoResponseBodyShape {
  const normalizedContentType = contentType ?? "";
  const trimmed = body.trimStart();

  if (normalizedContentType.includes("application/json") || trimmed.startsWith("{")) {
    return "ajax_json";
  }

  if (/^<!doctype html\b|^<html\b/i.test(trimmed)) {
    return "html_document";
  }

  if (trimmed.startsWith("<")) {
    return "html_fragment";
  }

  return "unknown";
}

function applyNettiautoQueryParams(
  url: URL,
  sourceSearchHash: string,
  queryParams: NettiautoQueryParams,
) {
  for (const [key, value] of Object.entries(queryParams)) {
    if (key === "page" || value === null || value === undefined || value === "") {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  if (!url.searchParams.has("haku")) {
    url.searchParams.set("haku", sourceSearchHash);
  }
}

export function parseNettiautoAjaxSearchResult(
  body: unknown,
  options: { crawlKind: CrawlKind; pageNumber?: number },
): ParsedSearchResultPage {
  const parsedJson = typeof body === "string" ? safeJsonParse(body) : body;
  const ajaxResult = nettiautoAjaxResponseSchema.safeParse(parsedJson);
  if (!ajaxResult.success) {
    return {
      source: NETTIAUTO_SOURCE,
      crawlKind: options.crawlKind,
      parserVersion: NETTIAUTO_PARSER_VERSION,
      currentPage: options.pageNumber ?? null,
      totalPages: null,
      totalAds: null,
      listings: [],
      issues: [
        {
          code: "invalid_ajax_json",
          message: ajaxResult.error.issues.map((issue) => issue.message).join("; "),
        },
      ],
    };
  }

  const $ = load(ajaxResult.data.ad_listing_data);
  const listings: ParsedListingCard[] = [];
  const issues: ParseIssue[] = [];

  $("[data-datalayer]").each((_, element) => {
    const dataLayerJson = $(element).attr("data-datalayer");
    if (!dataLayerJson) {
      issues.push({
        code: "missing_source_listing_id",
        message: "Listing card had no data-datalayer payload.",
      });
      return;
    }

    const rawPayload = safeJsonParse(dataLayerJson);
    const payloadResult = nettiautoDataLayerSchema.safeParse(rawPayload);
    if (!payloadResult.success) {
      issues.push({
        code: "invalid_datalayer_json",
        message: payloadResult.error.issues.map((issue) => issue.message).join("; "),
      });
      return;
    }

    const payload = payloadResult.data;
    if (!payload.item_id.trim()) {
      issues.push({
        code: "missing_source_listing_id",
        message: "Listing card data-datalayer payload had an empty item_id.",
      });
      return;
    }

    const sourceHtmlFragment = $.html(element);
    const normalized = normalizeNettiautoListing(payload, {
      crawlKind: options.crawlKind,
      sourceUrl: listingUrlForSourceId($, element, payload.item_id),
      fallbackPageNumber: options.pageNumber ?? null,
    });
    const sourcePayloadSha256 = sha256(stableStringify(payload));
    const changeHash = sha256(
      stableStringify({
        availability: normalized.availability,
        askingPriceEur: normalized.askingPriceEur,
        observedSoldPriceEur: normalized.observedSoldPriceEur,
        mileageKm: normalized.mileageKm,
        yearModel: normalized.yearModel,
        makeSourceLabel: normalized.makeSourceLabel,
        modelSourceLabel: normalized.modelSourceLabel,
        fuelTypeSourceLabel: normalized.fuelTypeSourceLabel,
        sellerSourceLabel: normalized.sellerSourceLabel,
      }),
    );

    listings.push({
      sourceListingId: payload.item_id,
      sourcePayload: payload,
      sourceHtmlFragment,
      sourcePayloadSha256,
      parserVersion: NETTIAUTO_PARSER_VERSION,
      normalized,
      images: extractImages($, element),
      changeHash,
    });
  });

  return {
    source: NETTIAUTO_SOURCE,
    crawlKind: options.crawlKind,
    parserVersion: NETTIAUTO_PARSER_VERSION,
    currentPage: ajaxResult.data.current_page ?? options.pageNumber ?? null,
    totalPages: ajaxResult.data.total_page ?? null,
    totalAds: ajaxResult.data.total_ads ?? null,
    listings,
    issues,
  };
}

export function parseNettiautoDetailPage(
  body: string,
  options: { sourceListingId: string },
): ParsedNettiautoDetailPage {
  const $ = load(body);
  const fields = extractDetailFields($);
  const jsonLd = extractJsonLdRecords($);
  const carJsonLd = findCarJsonLdRecord(jsonLd);
  const meta = extractDetailMeta($);
  const images = extractDetailPageImages(carJsonLd);
  const updatedDate = extractSourceUpdatedDate($, fields);
  const headerDateElement = $(".page-header__item_date-location").first();
  const normalizedData = normalizeNettiautoDetailData(fields, carJsonLd, updatedDate);
  const title = squash($("title").first().text()) || null;
  const sourcePayload: ParsedNettiautoDetailSourcePayload = {
    title,
    sourceUpdatedDate: normalizedData.sourceUpdatedDate,
    sourceUpdatedDateLabel: normalizedData.sourceUpdatedDateLabel,
    sourceUpdatedDateSource: normalizedData.sourceUpdatedDateSource,
    sourceLocationLabel: normalizedData.sourceLocationLabel,
    meta,
    jsonLd,
    fields,
    images,
    normalizedData,
  };

  return {
    source: NETTIAUTO_SOURCE,
    sourceListingId: options.sourceListingId,
    parserVersion: NETTIAUTO_DETAIL_PARSER_VERSION,
    sourceUpdatedDate: normalizedData.sourceUpdatedDate,
    sourceUpdatedDateLabel: normalizedData.sourceUpdatedDateLabel,
    sourceUpdatedDateSource: normalizedData.sourceUpdatedDateSource,
    sourceHtmlFragment: headerDateElement.length > 0 ? $.html(headerDateElement) : null,
    sourcePayload,
    normalizedData,
    images,
  };
}

function extractDetailFields($: ReturnType<typeof load>): ParsedNettiautoDetailField[] {
  const fields: ParsedNettiautoDetailField[] = [];
  const pushField = (label: string, value: string) => {
    const normalizedLabel = squash(label);
    const normalizedValue = squash(value);
    if (
      !normalizedLabel ||
      !normalizedValue ||
      normalizedLabel === normalizedValue ||
      normalizedLabel.length > 100 ||
      normalizedValue.length > 3_000
    ) {
      return;
    }
    fields.push({ label: normalizedLabel, value: normalizedValue });
  };

  $(".vehicle-info-box").each((_, element) => {
    pushField(
      $(element).find(".vehicle-info-box__vehicle-det").first().text(),
      $(element).find(".vehicle-info-box__vehicle-info").first().text(),
    );
  });

  $("dt").each((_, element) => {
    pushField($(element).text(), $(element).next("dd").text());
  });

  return uniqueDetailFields(fields);
}

function extractJsonLdRecords($: ReturnType<typeof load>) {
  return $("script[type='application/ld+json']")
    .toArray()
    .flatMap((element) => collectJsonLdRecords(safeJsonParse($(element).text())));
}

function collectJsonLdRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectJsonLdRecords(item));
  }

  if (!isRecord(value)) {
    return [];
  }
  if (Object.keys(value).length === 0) {
    return [];
  }

  const graph = value["@graph"];
  if (Array.isArray(graph)) {
    return [
      value,
      ...graph.flatMap((item) => collectJsonLdRecords(item)),
    ];
  }

  return [value];
}

function findCarJsonLdRecord(records: Record<string, unknown>[]) {
  return records.find((record) => jsonLdTypeIncludes(record, "Car")) ?? records[0] ?? null;
}

function jsonLdTypeIncludes(record: Record<string, unknown>, expectedType: string) {
  const type = record["@type"];
  if (Array.isArray(type)) {
    return type.some((item) => String(item).toLowerCase() === expectedType.toLowerCase());
  }

  return String(type).toLowerCase() === expectedType.toLowerCase();
}

function extractDetailMeta($: ReturnType<typeof load>): ParsedNettiautoDetailMeta[] {
  return $("meta")
    .toArray()
    .flatMap((element) => {
      const key = $(element).attr("property") ?? $(element).attr("name");
      const value = $(element).attr("content");
      return key && value && /(title|description|image|price|vehicle|product|og:|twitter:)/i.test(key)
        ? [{ key, value }]
        : [];
    });
}

function extractDetailPageImages(carJsonLd: Record<string, unknown> | null): ParsedImageMetadata[] {
  const imageValue = carJsonLd?.image;
  const imageValues = Array.isArray(imageValue) ? imageValue : [imageValue];
  return imageValues.flatMap((value, index) => {
    const imageUrl = typeof value === "string" ? normalizeImageUrl(value) : null;
    return imageUrl
      ? [
          {
            imageUrl,
            imageRole: "detail",
            position: index + 1,
            width: null,
            height: null,
          },
        ]
      : [];
  });
}

function extractSourceUpdatedDate(
  $: ReturnType<typeof load>,
  fields: ParsedNettiautoDetailField[],
): {
  date: string | null;
  label: string | null;
  source: NettiautoDetailUpdatedDateSource | null;
  locationLabel: string | null;
} {
  const headerText = squash($(".page-header__item_date-location").first().text());
  const headerDate = parseUpdatedDateLabel(headerText);
  if (headerDate.date) {
    return { ...headerDate, source: "detail_header", locationLabel: null };
  }

  for (const field of fields) {
    const fieldDate = parseUpdatedDateLabel(field.label);
    if (fieldDate.date) {
      return {
        ...fieldDate,
        source: "detail_field",
        locationLabel: field.value,
      };
    }
  }

  const bodyDate = parseUpdatedDateLabel(squash($("body").text()));
  return bodyDate.date
    ? { ...bodyDate, source: "detail_body", locationLabel: null }
    : { date: null, label: null, source: null, locationLabel: null };
}

function parseUpdatedDateLabel(text: string) {
  const dateMatch = text.match(/\bPäivitetty\s+(\d{1,2})\.(\d{1,2})\.(\d{4})\b/i);
  const date = dateMatch ? datePartsToIsoDate(dateMatch[1], dateMatch[2], dateMatch[3]) : null;
  return {
    date,
    label: date ? (dateMatch?.[0] ?? null) : null,
  };
}

function normalizeNettiautoDetailData(
  fields: ParsedNettiautoDetailField[],
  carJsonLd: Record<string, unknown> | null,
  updatedDate: {
    date: string | null;
    label: string | null;
    source: NettiautoDetailUpdatedDateSource | null;
    locationLabel: string | null;
  },
): NettiautoDetailNormalizedData {
  const engineSourceLabel = detailFieldValue(fields, "Moottori");
  const powerLabel = detailFieldValue(fields, "Teho");

  return {
    detailParserVersion: NETTIAUTO_DETAIL_PARSER_VERSION,
    sourceUpdatedDate: updatedDate.date,
    sourceUpdatedDateLabel: updatedDate.label,
    sourceUpdatedDateSource: updatedDate.source,
    sourceLocationLabel: updatedDate.locationLabel,
    registrationNumber: detailFieldValue(fields, "Rekisterinumero"),
    vin: jsonLdString(carJsonLd, "vehicleIdentificationNumber"),
    mileageKm:
      parseInteger(jsonLdValue(carJsonLd, "mileageFromOdometer.value")) ??
      parseInteger(detailFieldValue(fields, "Mittarilukema")),
    engineSourceLabel,
    fuelTypeSourceLabel: extractFuelTypeSourceLabel(engineSourceLabel),
    yearModel:
      parseInteger(jsonLdValue(carJsonLd, "vehicleModelDate")) ??
      parseYearModel(detailFieldValue(fields, "Vuosimalli")),
    firstRegistrationDate: parseFinnishDate(detailFieldValue(fields, "Käyttöönottopäivä")),
    transmissionSourceLabel: detailFieldValue(fields, "Vaihteisto"),
    drivetrainSourceLabel: detailFieldValue(fields, "Vetotapa"),
    inspectionDateLabel: detailFieldValue(fields, "Katsastettu"),
    bodyTypeSourceLabel: detailFieldValue(fields, "Korimalli"),
    vehicleTypeSourceLabel: detailFieldValue(fields, "Auton tyyppi"),
    colorSourceLabel: detailFieldValue(fields, "Väri") ?? jsonLdString(carJsonLd, "color"),
    powerKw: parseIntegerFromMatch(powerLabel, /(\d+)\s*kW/i),
    powerHp: parseIntegerFromMatch(powerLabel, /(\d+)\s*Hv/i),
    topSpeedKmh: parseInteger(detailFieldValue(fields, "Huippunopeus")),
    acceleration0To100S: parseDecimal(detailFieldValue(fields, "Kiihtyvyys (0-100)")),
    seatCount: parseInteger(detailFieldValue(fields, "Henkilömäärä")),
    doorCount: parseInteger(detailFieldValue(fields, "Ovien lkm")),
    steeringSideSourceLabel: detailFieldValue(fields, "Ohjauslaite"),
    curbWeightKg: parseInteger(detailFieldValue(fields, "Omamassa")),
    grossWeightKg: parseInteger(detailFieldValue(fields, "Kokonaismassa")),
    towingWeightBrakedKg: parseInteger(detailFieldValue(fields, "Vetomassa (jarrullinen)")),
    towingWeightUnbrakedKg: parseInteger(detailFieldValue(fields, "Vetomassa (ei jarruja)")),
    co2GKm: parseInteger(detailFieldValue(fields, "CO2 -päästöt")),
    fuelConsumptionSourceLabel: detailFieldValue(fields, "Polttoaineen kulutus"),
    sellerNotes: detailFieldValue(fields, "Lisätiedot"),
    jsonLdAvailability: jsonLdString(carJsonLd, "offers.availability"),
    jsonLdPriceEur: parseInteger(jsonLdValue(carJsonLd, "offers.price")),
    jsonLdSellerName: jsonLdString(carJsonLd, "offers.seller.name"),
  };
}

function detailFieldValue(fields: ParsedNettiautoDetailField[], label: string) {
  return fields.find((field) => normalizeLabel(field.label) === normalizeLabel(label))?.value ?? null;
}

function jsonLdValue(record: Record<string, unknown> | null, path: string): unknown {
  if (!record) {
    return null;
  }

  return path.split(".").reduce<unknown>((value, key) => {
    if (!isRecord(value)) {
      return null;
    }
    return value[key] ?? null;
  }, record);
}

function jsonLdString(record: Record<string, unknown> | null, path: string) {
  const value = jsonLdValue(record, path);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractFuelTypeSourceLabel(engineSourceLabel: string | null) {
  if (!engineSourceLabel) {
    return null;
  }

  const [, fuelType] = engineSourceLabel.split(/,\s+/, 2);
  return fuelType?.trim() || engineSourceLabel.trim() || null;
}

function parseYearModel(value: string | null) {
  const match = value?.match(/\b(19|20)\d{2}\b/);
  return match?.[0] ? Number(match[0]) : null;
}

function parseFinnishDate(value: string | null) {
  const match = value?.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
  return match ? datePartsToIsoDate(match[1], match[2], match[3]) : null;
}

function parseDecimal(value: string | null) {
  const match = value?.match(/-?\d+(?:[,.]\d+)?/);
  if (!match?.[0]) {
    return null;
  }

  const parsed = Number(match[0].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIntegerFromMatch(value: string | null, pattern: RegExp) {
  const match = value?.match(pattern);
  return parseInteger(match?.[1]);
}

function uniqueDetailFields(fields: ParsedNettiautoDetailField[]) {
  const seen = new Set<string>();
  const result: ParsedNettiautoDetailField[] = [];
  for (const field of fields) {
    const key = `${field.label}\u0000${field.value}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(field);
  }
  return result;
}

function normalizeNettiautoListing(
  payload: NettiautoDataLayer,
  options: { crawlKind: CrawlKind; sourceUrl: string | null; fallbackPageNumber: number | null },
): NormalizedListingData {
  const statusLabel = payload.item_ad_status ?? null;
  const availability = normalizeAvailability(statusLabel, options.crawlKind);
  const price = parseInteger(payload.item_vehicle_price);
  const mileage = parseInteger(payload.item_mileage);
  const pageNumber = parseInteger(payload.page_number) ?? options.fallbackPageNumber;

  return {
    source: NETTIAUTO_SOURCE,
    sourceListingId: payload.item_id,
    sourceUrl: options.sourceUrl,
    availability,
    sourceStatusLabel: statusLabel,
    askingPriceEur: availability === "active" ? price : null,
    observedSoldPriceEur: availability === "sold" ? price : null,
    priceSourceLabel: sourceLabel(payload.item_vehicle_price),
    mileageKm: mileage,
    mileageSourceLabel: sourceLabel(payload.item_mileage),
    yearModel: parseInteger(payload.item_year_model),
    makeSourceLabel: payload.item_brand ?? null,
    modelSourceLabel: payload.item_variant ?? payload.item_name ?? null,
    fuelTypeSourceLabel: payload.item_power_type ?? null,
    transmissionSourceLabel: null,
    bodyTypeSourceLabel: null,
    colorSourceLabel: null,
    sellerSourceLabel: payload.item_seller ?? null,
    sellerTypeSourceLabel: inferSellerType(payload.item_seller),
    pageNumber,
    position: parseInteger(payload.position),
    sourceListId: payload.item_list_id ?? null,
    sourceListName: payload.item_list_name ?? null,
    sourceListLocation: payload.item_list_location ?? null,
  };
}

function normalizeAvailability(statusLabel: string | null, crawlKind: CrawlKind): ListingAvailability {
  const normalized = normalizeLabel(statusLabel);
  if (crawlKind === "sold" && normalized === "myyty") {
    return "sold";
  }

  if (crawlKind === "current" && normalized === "myynnissa") {
    return "active";
  }

  return "unknown";
}

function listingUrlForSourceId(
  $: ReturnType<typeof load>,
  element: unknown,
  sourceListingId: string,
) {
  const expectedLastPathSegment = sourceListingId.trim();
  if (!expectedLastPathSegment) {
    return null;
  }

  const baseOrigin = new URL(NETTIAUTO_BASE_URL).origin;
  let sourceUrl: string | null = null;
  $(element as Parameters<typeof $>[0])
    .find("a[href]")
    .each((_, link) => {
      if (sourceUrl) {
        return;
      }

      const href = $(link).attr("href");
      if (!href) {
        return;
      }

      try {
        const url = new URL(href, NETTIAUTO_BASE_URL);
        const lastPathSegment = url.pathname.split("/").filter(Boolean).at(-1);
        if (url.origin === baseOrigin && lastPathSegment === expectedLastPathSegment) {
          url.search = "";
          url.hash = "";
          sourceUrl = url.toString();
        }
      } catch {
        // Ignore malformed ancillary links inside listing cards.
      }
    });

  return sourceUrl;
}

function extractImages($: ReturnType<typeof load>, element: unknown): ParsedImageMetadata[] {
  const imageUrls = new Map<string, ParsedImageMetadata>();
  const addImage = (value: string | undefined, role: string | null, position: number | null) => {
    const imageUrl = normalizeImageUrl(value);
    if (!imageUrl || imageUrls.has(imageUrl)) {
      return;
    }

    imageUrls.set(imageUrl, {
      imageUrl,
      imageRole: role,
      position,
      width: null,
      height: null,
    });
  };

  $(element as Parameters<typeof $>[0])
    .find("source[srcset]")
    .each((index, image) => addImage($(image).attr("srcset"), "source", index + 1));
  $(element as Parameters<typeof $>[0])
    .find("img")
    .each((index, image) => {
      addImage($(image).attr("src") ?? $(image).attr("data-src"), "thumbnail", index + 1);
    });

  return [...imageUrls.values()];
}

function normalizeImageUrl(value: string | undefined) {
  const first = value?.split(",")[0]?.trim().split(/\s+/)[0];
  if (!first) {
    return null;
  }

  try {
    return new URL(first, NETTIAUTO_BASE_URL).toString();
  } catch {
    return null;
  }
}

function squash(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeLabel(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .normalize("NFC")
    .trim()
    .toLowerCase();
}

function parseInteger(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : null;
  }

  const digits = String(value).replace(/[^\d-]/g, "");
  if (!digits) {
    return null;
  }

  const parsed = Number(digits);
  return Number.isInteger(parsed) ? parsed : null;
}

function datePartsToIsoDate(
  dayValue: string | undefined,
  monthValue: string | undefined,
  yearValue: string | undefined,
) {
  const day = Number(dayValue);
  const month = Number(monthValue);
  const year = Number(yearValue);
  if (
    !Number.isInteger(day) ||
    !Number.isInteger(month) ||
    !Number.isInteger(year) ||
    year < 1900 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function sourceLabel(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value);
}

function inferSellerType(value: string | undefined) {
  if (!value) {
    return null;
  }

  const normalized = normalizeLabel(value);
  if (normalized.includes("autoliike") || normalized.includes("dealer")) {
    return "dealer";
  }

  if (normalized.includes("yksityinen") || normalized.includes("private")) {
    return "private";
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
