import { readFileSync } from "node:fs";

type JsonRecord = Record<string, unknown>;

type DataLayerRecord = JsonRecord & {
  item_ad_status?: string;
  item_brand?: string;
  item_id?: number | string;
  item_list_id?: string;
  item_mileage?: number | string;
  item_name?: string;
  item_power_type?: string;
  item_seller?: string;
  item_variant?: string;
  item_vehicle_price?: number | string;
  item_year_model?: number | string;
  page_number?: number | string;
  position?: number | string;
};

const files = process.argv.slice(2);

if (files.length === 0) {
  console.error(
    "Usage: bun scripts/nettiauto/inspect-fixture.ts <fixture-or-response-file> [...]",
  );
  process.exit(1);
}

for (const file of files) {
  const text = readFileSync(file, "utf8");

  console.log("");
  console.log(`== ${file} ==`);
  console.log(`bytes: ${Buffer.byteLength(text, "utf8")}`);
  console.log(`shape: ${detectShape(text)}`);

  summarizeAjaxJson(text);
  summarizeJsonLd(text);
  summarizeDatalayer("full text", text);
  summarizeHtmlSourceHints(text);
}

function detectShape(text: string): string {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{")) return "json";
  if (/^<script\b/i.test(trimmed)) return "script-fragment";
  if (/^<!doctype html\b|^<html\b/i.test(trimmed)) return "html-document";
  if (/^</.test(trimmed)) return "html-fragment";
  return "unknown";
}

function summarizeAjaxJson(text: string): void {
  const parsed = parseJson(text);
  if (!isRecord(parsed) || typeof parsed.ad_listing_data !== "string") return;

  const keys = Object.keys(parsed);
  console.log("ajax json:");
  console.log(`  keys: ${keys.join(", ")}`);
  console.log(`  total_ads: ${String(parsed.total_ads ?? "")}`);
  console.log(
    `  current_page/total_page: ${String(parsed.current_page ?? "")}/${String(
      parsed.total_page ?? "",
    )}`,
  );
  console.log(
    `  ad_listing_data bytes: ${Buffer.byteLength(parsed.ad_listing_data, "utf8")}`,
  );

  summarizeDatalayer("ajax ad_listing_data", parsed.ad_listing_data);
  summarizeHrefIds(parsed.ad_listing_data);
}

function summarizeJsonLd(text: string): void {
  const blocks = extractJsonLdBlocks(text);
  if (blocks.length === 0) return;

  console.log("json-ld:");
  console.log(`  blocks: ${blocks.length}`);

  for (const [index, block] of blocks.entries()) {
    const parsed = parseJson(block);
    const itemList = findItemList(parsed);
    if (!itemList) continue;

    const elements = Array.isArray(itemList.itemListElement)
      ? itemList.itemListElement
      : [];
    const sample = elements
      .map((element) => (isRecord(element) && isRecord(element.item) ? element.item : null))
      .filter((item): item is JsonRecord => item !== null)
      .slice(0, 5)
      .map((item) => {
        const offers = isRecord(item.offers) ? item.offers : {};
        const mileage = isRecord(item.mileageFromOdometer)
          ? item.mileageFromOdometer.value
          : undefined;

        return {
          sourceListingId: sourceListingIdFromUrl(asString(item.url)),
          name: item.name,
          brand: item.brand,
          model: item.model,
          price: offers.price,
          mileage,
          fuelType: item.fuelType,
          hasVin: Boolean(item.vehicleIdentificationNumber),
          hasImage: Boolean(item.image),
        };
      });

    console.log(`  itemList block: ${index + 1}`);
    console.log(`    numberOfItems: ${String(itemList.numberOfItems ?? "")}`);
    console.log(`    itemListElement count: ${elements.length}`);
    console.log(`    sample: ${JSON.stringify(sample, null, 2)}`);
  }
}

function summarizeDatalayer(label: string, html: string): void {
  const records = extractDatalayerRecords(html);
  if (records.length === 0) return;

  const ids = new Set(
    records.map((record) => record.item_id).filter((id) => id !== undefined).map(String),
  );
  const statuses = countBy(records.map((record) => asString(record.item_ad_status) ?? ""));
  const listIds = countBy(records.map((record) => asString(record.item_list_id) ?? ""));
  const pageNumbers = [
    ...new Set(
      records
        .map((record) => record.page_number)
        .filter((pageNumber) => pageNumber !== undefined)
        .map(String),
    ),
  ];

  const sample = records.slice(0, 5).map((record) => ({
    sourceListingId: record.item_id,
    name: record.item_name,
    brand: record.item_brand,
    model: record.item_variant,
    seller: record.item_seller,
    year: record.item_year_model,
    price: record.item_vehicle_price,
    mileage: record.item_mileage,
    fuel: record.item_power_type,
    availabilityLabel: record.item_ad_status,
    listId: record.item_list_id,
    position: record.position,
    pageNumber: record.page_number,
  }));

  console.log(`datalayer (${label}):`);
  console.log(`  records: ${records.length}`);
  console.log(`  unique item_id: ${ids.size}`);
  console.log(`  statuses: ${formatCounts(statuses)}`);
  console.log(`  list ids: ${formatCounts(listIds)}`);
  console.log(`  page numbers: ${pageNumbers.join(", ")}`);
  console.log(`  sample: ${JSON.stringify(sample, null, 2)}`);
}

function summarizeHrefIds(html: string): void {
  const ids = [
    ...new Set(
      [...html.matchAll(/\bhref=(["'])(?:https:\/\/www\.nettiauto\.com)?\/[^"']+\/[^"']+\/(\d+)(?:[#?][^"']*)?\1/gi)]
        .map((match) => match[2])
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (ids.length === 0) return;

  console.log("listing href ids:");
  console.log(`  unique ids: ${ids.length}`);
  console.log(`  sample: ${ids.slice(0, 10).join(", ")}`);
}

function summarizeHtmlSourceHints(text: string): void {
  const scriptSrcs = [
    ...text.matchAll(/<script\b[^>]*\bsrc=(["'])(.*?)\1/gi),
  ].map((match) => decodeHtmlEntities(match[2] ?? ""));

  const relevantScriptSrcs = scriptSrcs.filter((src) =>
    /ad_listing|advance_search|jquery|search/i.test(src),
  );

  const hints = [
    ["listingData container", /id=(["'])listingData\1/.test(text)],
    ["pageNavigation links", /\bpageNavigation\b/.test(text)],
    ["quick filter links", /\bquickCustomFilter\b/.test(text)],
    ["sorting select", /\bselectNavigation\b/.test(text)],
    ["searchHash references", /\bsearchHash\b/.test(text)],
    ["haku references", /\bhaku=P\d+/.test(text)],
    ["ajax response keys", /\bad_listing_data\b|\bpagination_large_view\b/.test(text)],
    ["ad listing bundle", /ad_listing\.[a-z0-9]+\.js/i.test(text)],
  ];

  if (relevantScriptSrcs.length === 0 && hints.every(([, found]) => !found)) return;

  console.log("source hints:");
  for (const [name, found] of hints) {
    console.log(`  ${name}: ${found ? "yes" : "no"}`);
  }
  if (relevantScriptSrcs.length > 0) {
    console.log("  relevant script srcs:");
    for (const src of relevantScriptSrcs) {
      console.log(`    ${src}`);
    }
  }
}

function extractJsonLdBlocks(text: string): string[] {
  const blocks = [
    ...text.matchAll(
      /<script\b(?=[^>]*\btype=(["'])application\/ld\+json\1)[^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ].map((match) => match[2]?.trim() ?? "");

  if (blocks.length > 0) return blocks;

  const trimmed = text.trim();
  if (/^<script\b/i.test(trimmed)) {
    const match = trimmed.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
    if (match?.[1]) return [match[1].trim()];
  }

  return [];
}

function extractDatalayerRecords(html: string): DataLayerRecord[] {
  const records: DataLayerRecord[] = [];

  for (const match of html.matchAll(/\bdata-datalayer=(["'])([\s\S]*?)\1/gi)) {
    const raw = match[2];
    if (!raw) continue;

    const decoded = decodeHtmlEntities(raw);
    const parsed = parseJson(decoded);

    if (isRecord(parsed)) {
      records.push(parsed as DataLayerRecord);
    }
  }

  return records;
}

function findItemList(value: unknown): JsonRecord | null {
  if (!isRecord(value)) return null;

  const mainEntity = value.mainEntity;
  if (isRecord(mainEntity) && Array.isArray(mainEntity.itemListElement)) {
    return mainEntity;
  }

  if (Array.isArray(value.itemListElement)) return value;

  return null;
}

function sourceListingIdFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.match(/\/(\d+)(?:[#?].*)?$/)?.[1];
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function countBy(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return counts;
}

function formatCounts(counts: Map<string, number>): string {
  if (counts.size === 0) return "(none)";

  return [...counts.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    );
}
