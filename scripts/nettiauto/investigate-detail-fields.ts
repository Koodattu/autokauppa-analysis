import { writeFileSync } from "node:fs";
import { load } from "../../packages/domain/node_modules/cheerio/dist/esm/slim.js";
import {
  classifyNettiautoResponseBody,
  nettiautoAjaxRequestHeaders,
  nettiautoDetailRequestHeaders,
  parseNettiautoAjaxSearchResult,
  type CrawlKind,
} from "../../packages/domain/src/nettiauto";

type SearchProbe = {
  crawlKind: CrawlKind;
  label: string;
  url: string;
};

type DetailField = {
  label: string;
  value: string;
  source: string;
};

const samplePerProbe = Number(process.env.NETTIAUTO_DETAIL_FIELD_SAMPLE_SIZE ?? "4");
const detailDelayMs = Number(process.env.NETTIAUTO_DETAIL_FIELD_DELAY_MS ?? "700");
const outputPath =
  process.env.NETTIAUTO_DETAIL_FIELD_OUTPUT ?? "C:/tmp/nettiauto-detail-field-report.json";

const probes: SearchProbe[] = [
  {
    crawlKind: "current",
    label: "current-oldest-first",
    url: "https://www.nettiauto.com/vaihtoautot?haku=P3847755184&sortCol=dateCreated&ord=asc",
  },
  {
    crawlKind: "current",
    label: "current-newest-first",
    url: "https://www.nettiauto.com/vaihtoautot?haku=P3847755184&sortCol=dateCreated&ord=desc",
  },
  {
    crawlKind: "sold",
    label: "sold-oldest-first",
    url: "https://www.nettiauto.com/hakutulokset?haku=P4156016713&sortCol=dateCreated&ord=asc",
  },
  {
    crawlKind: "sold",
    label: "sold-newest-first",
    url: "https://www.nettiauto.com/hakutulokset?haku=P4156016713&sortCol=dateCreated&ord=desc",
  },
];

const report = {
  checkedAt: new Date().toISOString(),
  samplePerProbe,
  probes: [] as unknown[],
  detailPages: [] as unknown[],
  aggregate: {} as Record<string, unknown>,
};

for (const probe of probes) {
  const searchHeaders = nettiautoAjaxRequestHeaders(
    new URL(probe.url).pathname,
    new URL(probe.url).searchParams.get("haku") ?? "",
    Object.fromEntries(new URL(probe.url).searchParams),
  );
  const searchResponse = await fetchText(probe.url, searchHeaders);
  const parsedSearch = parseNettiautoAjaxSearchResult(searchResponse.body, {
    crawlKind: probe.crawlKind,
    pageNumber: 1,
  });
  const listings = parsedSearch.listings.filter((listing) => listing.normalized.sourceUrl);
  const sampledListings = pickSamples(listings, samplePerProbe);

  report.probes.push({
    label: probe.label,
    url: probe.url,
    response: summarizeResponse(searchResponse),
    currentPage: parsedSearch.currentPage,
    totalPages: parsedSearch.totalPages,
    totalAds: parsedSearch.totalAds,
    parsedListings: parsedSearch.listings.length,
    sampledListings: sampledListings.map((listing) => ({
      sourceListingId: listing.sourceListingId,
      sourceUrl: listing.normalized.sourceUrl,
      name: listing.sourcePayload.item_name,
      status: listing.sourcePayload.item_ad_status,
    })),
  });

  for (const listing of sampledListings) {
    const sourceUrl = listing.normalized.sourceUrl;
    if (!sourceUrl) {
      continue;
    }

    await sleep(detailDelayMs);
    const detailResponse = await fetchText(sourceUrl, nettiautoDetailRequestHeaders(sourceUrl));
    const summary = summarizeDetailPage(detailResponse.body);
    report.detailPages.push({
      searchLabel: probe.label,
      sourceListingId: listing.sourceListingId,
      sourceUrl,
      searchPayload: listing.sourcePayload,
      response: summarizeResponse(detailResponse),
      ...summary,
    });
  }
}

report.aggregate = aggregateReport(report.detailPages);
writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.aggregate, null, 2));
console.log(`Wrote ${outputPath}`);

async function fetchText(url: string, headers: Record<string, string>) {
  const response = await fetch(url, {
    headers,
    redirect: "manual",
  });

  return {
    body: await response.text(),
    contentType: response.headers.get("content-type"),
    location: response.headers.get("location"),
    status: response.status,
    url,
  };
}

function summarizeResponse(response: Awaited<ReturnType<typeof fetchText>>) {
  return {
    status: response.status,
    contentType: response.contentType,
    bodyShape: classifyNettiautoResponseBody(response.body, response.contentType),
    bytes: Buffer.byteLength(response.body, "utf8"),
    location: response.location,
  };
}

function summarizeDetailPage(body: string) {
  const $ = load(body);
  $("script, style, svg, noscript").remove();

  const fields = uniqueFields([
    ...extractDefinitionFields($),
    ...extractTableFields($),
    ...extractLikelySpecFields($),
  ]).slice(0, 140);
  const jsonLd = extractJsonLd(body);
  const meta = extractMeta(body);
  const headings = $("h1,h2,h3")
    .toArray()
    .map((element) => squash($(element).text()))
    .filter(Boolean)
    .slice(0, 40);
  const classNames = topClassNames(body);
  const description = extractDescription($);

  return {
    title: squash($("title").first().text()),
    headerDateLocation: squash($(".page-header__item_date-location").first().text()),
    headings,
    description,
    meta,
    jsonLd,
    fields,
    fieldLabels: fields.map((field) => field.label),
    classNames,
    interestingSnippets: interestingSnippets(body),
  };
}

function extractDefinitionFields($: ReturnType<typeof load>): DetailField[] {
  return $("dt")
    .toArray()
    .flatMap((element) => {
      const label = squash($(element).text());
      const value = squash($(element).next("dd").text());
      return label && value ? [{ label, value, source: "definition-list" }] : [];
    });
}

function extractTableFields($: ReturnType<typeof load>): DetailField[] {
  return $("tr")
    .toArray()
    .flatMap((element) => {
      const cells = $(element)
        .find("th,td")
        .toArray()
        .map((cell) => squash($(cell).text()))
        .filter(Boolean);
      if (cells.length < 2) {
        return [];
      }
      return [{ label: cells[0] ?? "", value: cells.slice(1).join(" "), source: "table-row" }];
    })
    .filter((field) => field.label && field.value);
}

function extractLikelySpecFields($: ReturnType<typeof load>): DetailField[] {
  const fields: DetailField[] = [];
  const selectors = [
    "[class*='spec']",
    "[class*='detail']",
    "[class*='vehicle']",
    "[class*='tech']",
    "[class*='info']",
    "[class*='attribute']",
    "[class*='equipment']",
  ];
  const seenElements = new Set<unknown>();

  for (const selector of selectors) {
    $(selector)
      .toArray()
      .forEach((element) => {
        if (seenElements.has(element)) {
          return;
        }
        seenElements.add(element);

        const children = $(element).children().toArray();
        if (children.length < 2 || children.length > 4) {
          return;
        }

        const childTexts = children.map((child) => squash($(child).text())).filter(Boolean);
        if (childTexts.length !== 2) {
          return;
        }

        const [label, value] = childTexts;
        if (!label || !value || label.length > 80 || value.length > 300 || label === value) {
          return;
        }

        fields.push({ label, value, source: "class-pair" });
      });
  }

  return fields;
}

function extractDescription($: ReturnType<typeof load>) {
  const candidates = [
    "[class*='description']",
    "[class*='Description']",
    "[id*='description']",
    "[id*='Description']",
  ];

  for (const selector of candidates) {
    const text = squash($(selector).first().text());
    if (text.length > 40) {
      return text.slice(0, 1_500);
    }
  }

  return null;
}

function extractJsonLd(body: string) {
  const $ = load(body);
  return $("script[type='application/ld+json']")
    .toArray()
    .flatMap((element) => {
      const parsed = safeJsonParse($(element).text());
      return parsed === null ? [] : summarizeJson(parsed);
    });
}

function summarizeJson(value: unknown) {
  const summaries: Array<{
    type: unknown;
    keys: string[];
    primitiveFields: Array<{ path: string; value: unknown }>;
  }> = [];
  const nodes = Array.isArray(value) ? value : [value];

  for (const node of nodes) {
    if (!isRecord(node)) {
      continue;
    }
    summaries.push({
      type: node["@type"],
      keys: Object.keys(node).sort(),
      primitiveFields: collectPrimitiveFields(node).slice(0, 80),
    });
  }

  return summaries;
}

function collectPrimitiveFields(value: unknown, path = ""): Array<{ path: string; value: unknown }> {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectPrimitiveFields(item, `${path}[${index}]`));
  }
  if (!isRecord(value)) {
    return path ? [{ path, value }] : [];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    collectPrimitiveFields(child, path ? `${path}.${key}` : key),
  );
}

function extractMeta(body: string) {
  const $ = load(body);
  return $("meta")
    .toArray()
    .flatMap((element) => {
      const key = $(element).attr("property") ?? $(element).attr("name");
      const value = $(element).attr("content");
      return key && value && isInterestingMeta(key) ? [{ key, value }] : [];
    })
    .slice(0, 60);
}

function topClassNames(body: string) {
  const counts = new Map<string, number>();
  for (const match of body.matchAll(/\bclass=(["'])(.*?)\1/gi)) {
    for (const className of (match[2] ?? "").split(/\s+/)) {
      if (/(vehicle|detail|spec|tech|info|equipment|description|page-header|ad-|price|seller)/i.test(className)) {
        counts.set(className, (counts.get(className) ?? 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 60)
    .map(([className, count]) => ({ className, count }));
}

function interestingSnippets(body: string) {
  return unique(
    [
      ...body.matchAll(
        /.{0,160}(Ajoneuvon tiedot|Tekniset tiedot|Varusteet|Lisätiedot|Rekisterinumero|VIN|Valmistenumero|Katsastettu|Päivitetty|Käyttöönottopäivä|CO2|Kulutus|Vetotapa|Vaihteisto|Korimalli|Väri|Hinta|Myyjä).{0,220}/gi,
      ),
    ].map((match) => squash(stripTags(match[0] ?? ""))),
  ).slice(0, 40);
}

function aggregateReport(detailPages: unknown[]) {
  const pages = detailPages.filter(isRecord);
  const fieldLabels = countValues(
    pages.flatMap((page) => (Array.isArray(page.fields) ? page.fields : []))
      .filter(isRecord)
      .map((field) => String(field.label ?? "")),
  );
  const jsonLdTypes = countValues(
    pages.flatMap((page) => (Array.isArray(page.jsonLd) ? page.jsonLd : []))
      .filter(isRecord)
      .map((item) => String(item.type ?? "")),
  );
  const metaKeys = countValues(
    pages.flatMap((page) => (Array.isArray(page.meta) ? page.meta : []))
      .filter(isRecord)
      .map((item) => String(item.key ?? "")),
  );
  const classNames = countValues(
    pages.flatMap((page) => (Array.isArray(page.classNames) ? page.classNames : []))
      .filter(isRecord)
      .map((item) => String(item.className ?? "")),
  );

  return {
    detailPageCount: pages.length,
    responseShapes: countValues(
      pages.map((page) =>
        isRecord(page.response) ? String(page.response.bodyShape ?? "unknown") : "unknown",
      ),
    ),
    statuses: countValues(
      pages.map((page) =>
        isRecord(page.response) ? String(page.response.status ?? "unknown") : "unknown",
      ),
    ),
    commonFieldLabels: topEntries(fieldLabels, 80),
    jsonLdTypes: topEntries(jsonLdTypes, 20),
    metaKeys: topEntries(metaKeys, 40),
    classNames: topEntries(classNames, 40),
  };
}

function uniqueFields(fields: DetailField[]) {
  const seen = new Set<string>();
  const result: DetailField[] = [];
  for (const field of fields) {
    const label = squash(field.label);
    const value = squash(field.value);
    const key = `${label}\u0000${value}`;
    if (!label || !value || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({ label, value, source: field.source });
  }
  return result;
}

function pickSamples<T>(items: T[], count: number) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex] as T, copy[index] as T];
  }
  return copy.slice(0, count);
}

function countValues(values: string[]) {
  const counts: Record<string, number> = {};
  for (const value of values) {
    if (value) {
      counts[value] = (counts[value] ?? 0) + 1;
    }
  }
  return counts;
}

function topEntries(values: Record<string, number>, limit: number) {
  return Object.entries(values)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function isInterestingMeta(key: string) {
  return /(title|description|image|price|vehicle|product|og:|twitter:)/i.test(key);
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, " ");
}

function squash(value: string) {
  return decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value: string) {
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

function unique(values: string[]) {
  return [...new Set(values)].filter(Boolean);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
