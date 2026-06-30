import { createHash } from "node:crypto";
import { load } from "cheerio/slim";
import {
  nettiautoAjaxResponseSchema,
  nettiautoDataLayerSchema,
  type NettiautoDataLayer,
} from "@nettiauto/schemas";

export const NETTIAUTO_SOURCE = "nettiauto" as const;
export const NETTIAUTO_PARSER_VERSION = "nettiauto-search-result-v1";
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
      sourceUrl: firstListingUrl($, element),
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

function firstListingUrl($: ReturnType<typeof load>, element: unknown) {
  const href = $(element as Parameters<typeof $>[0])
    .find("a[href]")
    .first()
    .attr("href");
  if (!href) {
    return null;
  }

  try {
    return new URL(href, NETTIAUTO_BASE_URL).toString();
  } catch {
    return null;
  }
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
