type SearchProbe = {
  label: string;
  url: string;
};

type DataLayerRecord = Record<string, unknown> & {
  item_ad_status?: string;
  item_id?: number | string;
  item_name?: string;
  item_vehicle_price?: number | string;
};

const probes: SearchProbe[] = [
  {
    label: "sold-oldest-first",
    url: "https://www.nettiauto.com/hakutulokset?haku=P4156016713&sortCol=dateCreated&ord=asc",
  },
  {
    label: "sold-newest-first",
    url: "https://www.nettiauto.com/hakutulokset?haku=P4156016713&sortCol=dateCreated&ord=desc",
  },
];

const detailSampleSize = Number(process.env.NETTIAUTO_DATE_DETAIL_SAMPLE_SIZE ?? "5");
const detailDelayMs = Number(process.env.NETTIAUTO_DATE_DETAIL_DELAY_MS ?? "800");
const includeDetailDocumentNavigation =
  process.env.NETTIAUTO_DATE_INCLUDE_DETAIL_DOCUMENTS !== "false";
const userAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

const report = {
  checkedAt: new Date().toISOString(),
  searchProbes: [] as unknown[],
  detailProbes: [] as unknown[],
  summary: {} as Record<string, unknown>,
};

for (const probe of probes) {
  const ajax = await fetchText(probe.url, {
    accept: "*/*",
    referer: withoutPage(probe.url),
    "x-requested-with": "XMLHttpRequest",
  });
  const document = await fetchText(probe.url, {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  });

  const search = summarizeSearchAjax(probe, ajax);
  report.searchProbes.push({
    ...search,
    documentNavigation: summarizeResponse(document),
  });

  for (const listing of search.sampleListings.slice(0, detailSampleSize)) {
    if (!listing.sourceUrl) {
      continue;
    }

    await sleep(detailDelayMs);
    const detail = await fetchText(listing.sourceUrl, {
      accept: "*/*",
      referer: withoutPage(probe.url),
      "x-requested-with": "XMLHttpRequest",
    });
    report.detailProbes.push({
      searchLabel: probe.label,
      sourceListingId: listing.sourceListingId,
      sourceUrl: listing.sourceUrl,
      ajaxDetail: summarizeDetail(detail),
      documentNavigation: includeDetailDocumentNavigation
        ? summarizeResponse(
            await fetchText(listing.sourceUrl, {
              accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            }),
          )
        : null,
    });
  }
}

report.summary = summarizeReport(report);
console.log(JSON.stringify(report, null, 2));

function summarizeSearchAjax(probe: SearchProbe, response: FetchTextResult) {
  const parsed = parseJson(response.body);
  const adListingData = isRecord(parsed) && typeof parsed.ad_listing_data === "string"
    ? parsed.ad_listing_data
    : "";
  const records = extractDatalayerRecords(adListingData);
  const dateLikeDataLayerKeys = unique(
    records.flatMap((record) => Object.keys(record).filter(isDateLikeKey)),
  );
  const htmlDateSnippets = extractDateSnippets(adListingData);
  const sampleListings = records.map((record) => {
    const sourceListingId = String(record.item_id ?? "");
    return {
      sourceListingId,
      sourceUrl: sourceListingId ? findListingUrl(adListingData, sourceListingId) : null,
      status: asString(record.item_ad_status),
      price: record.item_vehicle_price ?? null,
      dateLikePayloadKeys: Object.keys(record).filter(isDateLikeKey),
      htmlDateSnippetsNearListing: sourceListingId
        ? extractDateSnippets(nearListingSnippet(adListingData, sourceListingId))
        : [],
    };
  });

  return {
    label: probe.label,
    url: probe.url,
    ajaxResponse: summarizeResponse(response),
    totalAds: isRecord(parsed) ? parsed.total_ads ?? null : null,
    currentPage: isRecord(parsed) ? parsed.current_page ?? null : null,
    totalPage: isRecord(parsed) ? parsed.total_page ?? null : null,
    listingRecordCount: records.length,
    statuses: countBy(records.map((record) => asString(record.item_ad_status) ?? "")),
    dateLikeDataLayerKeys,
    htmlDateSnippets,
    sampleListings,
  };
}

function summarizeDetail(response: FetchTextResult) {
  const body = response.body;
  const dataLayerRecords = extractDatalayerRecords(body);
  const jsonLdDateFields = extractJsonLdDateFields(body);
  const headerDateText = extractHeaderDateText(body);
  const updateDateMatch = headerDateText.match(/Päivitetty\s+\d{1,2}\.\d{1,2}\.\d{4}/i);

  return {
    ...summarizeResponse(response),
    title: extractTitle(body),
    headerDateText,
    parsedUpdatedDateLabel: updateDateMatch?.[0] ?? null,
    dataLayerRecordCount: dataLayerRecords.length,
    dateLikeDataLayerKeys: unique(
      dataLayerRecords.flatMap((record) => Object.keys(record).filter(isDateLikeKey)),
    ),
    jsonLdDateFields,
    dateSnippets: extractDateSnippets(body).slice(0, 10),
  };
}

function summarizeReport(input: typeof report) {
  const detailProbes = input.detailProbes as Array<{
    ajaxDetail?: {
      dateLikeDataLayerKeys?: string[];
      jsonLdDateFields?: Array<{ path: string; value: unknown }>;
      parsedUpdatedDateLabel?: string | null;
      status?: number;
    };
    searchLabel?: string;
  }>;
  const bySearchLabel: Record<
    string,
    {
      ajax200: number;
      detailProbes: number;
      missingUpdatedDate: number;
      nonVehicleModelJsonLdDateFields: number;
      updatedDateFound: number;
      withDateLikeDataLayerKeys: number;
    }
  > = {};

  for (const detailProbe of detailProbes) {
    const label = detailProbe.searchLabel ?? "unknown";
    bySearchLabel[label] ??= {
      ajax200: 0,
      detailProbes: 0,
      missingUpdatedDate: 0,
      nonVehicleModelJsonLdDateFields: 0,
      updatedDateFound: 0,
      withDateLikeDataLayerKeys: 0,
    };
    const summary = bySearchLabel[label];
    const ajaxDetail = detailProbe.ajaxDetail;
    summary.detailProbes += 1;
    if (ajaxDetail?.status === 200) {
      summary.ajax200 += 1;
    }
    if (ajaxDetail?.parsedUpdatedDateLabel) {
      summary.updatedDateFound += 1;
    } else {
      summary.missingUpdatedDate += 1;
    }
    if ((ajaxDetail?.dateLikeDataLayerKeys?.length ?? 0) > 0) {
      summary.withDateLikeDataLayerKeys += 1;
    }
    const nonVehicleModelFields =
      ajaxDetail?.jsonLdDateFields?.filter((field) => field.path !== "vehicleModelDate") ?? [];
    if (nonVehicleModelFields.length > 0) {
      summary.nonVehicleModelJsonLdDateFields += 1;
    }
  }

  return {
    bySearchLabel,
  };
}

type FetchTextResult = {
  body: string;
  contentType: string | null;
  location: string | null;
  status: number;
  url: string;
};

async function fetchText(url: string, headers: Record<string, string>): Promise<FetchTextResult> {
  const response = await fetch(url, {
    headers: {
      "accept-language": "en-US,en;q=0.9,fi;q=0.8,fi-FI;q=0.7",
      "cache-control": "no-cache",
      pragma: "no-cache",
      "user-agent": userAgent,
      ...headers,
    },
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

function summarizeResponse(response: FetchTextResult) {
  return {
    status: response.status,
    contentType: response.contentType,
    bodyShape: classifyBody(response.body, response.contentType),
    bytes: Buffer.byteLength(response.body, "utf8"),
    location: response.location,
  };
}

function classifyBody(body: string, contentType: string | null): string {
  const trimmed = body.trimStart();
  if ((contentType ?? "").includes("json") || trimmed.startsWith("{")) {
    return "json";
  }

  if (/^<!doctype html\b|^<html\b/i.test(trimmed)) {
    return "html-document";
  }

  if (trimmed.startsWith("<")) {
    return "html-fragment";
  }

  return trimmed ? "unknown" : "empty";
}

function extractDatalayerRecords(html: string): DataLayerRecord[] {
  const records: DataLayerRecord[] = [];

  for (const match of html.matchAll(/\bdata-datalayer=(["'])([\s\S]*?)\1/gi)) {
    const decoded = decodeHtmlEntities(match[2] ?? "");
    const parsed = parseJson(decoded);
    if (isRecord(parsed)) {
      records.push(parsed as DataLayerRecord);
    }
  }

  return records;
}

function extractJsonLdDateFields(html: string) {
  const fields: Array<{ path: string; value: unknown }> = [];
  const blocks = [
    ...html.matchAll(
      /<script\b(?=[^>]*\btype=(["'])application\/ld\+json\1)[^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];

  for (const block of blocks) {
    const parsed = parseJson(block[2]?.trim() ?? "");
    collectDateFields(parsed, "", fields);
  }

  return fields;
}

function collectDateFields(
  value: unknown,
  path: string,
  fields: Array<{ path: string; value: unknown }>,
) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectDateFields(item, `${path}[${index}]`, fields));
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (isDateLikeKey(key)) {
      fields.push({ path: childPath, value: child });
    }
    collectDateFields(child, childPath, fields);
  }
}

function extractHeaderDateText(html: string) {
  const classMatch = html.match(
    /class=(["'])[^"']*page-header__item_date-location[^"']*\1[^>]*>([\s\S]{0,500})/i,
  );
  return classMatch ? squash(stripTags(classMatch[2] ?? "")) : "";
}

function extractDateSnippets(html: string) {
  return unique(
    [
      ...html.matchAll(
        /.{0,120}(Päivitetty\s+\d{1,2}\.\d{1,2}\.\d{4}|PÄIVITETTY\s+\d+H|dateCreated|dateModified|datePublished|datetime=|<time\b|created_at|updated_at|published|posted).{0,120}/gi,
      ),
    ].map((match) => squash(stripTags(match[0] ?? ""))),
  );
}

function nearListingSnippet(html: string, sourceListingId: string) {
  const index = html.indexOf(sourceListingId);
  if (index < 0) {
    return "";
  }

  return html.slice(Math.max(0, index - 2_000), index + 4_000);
}

function findListingUrl(html: string, sourceListingId: string) {
  for (const match of html.matchAll(/\bhref=(["'])(.*?)\1/gi)) {
    const href = decodeHtmlEntities(match[2] ?? "");
    try {
      const url = new URL(href, "https://www.nettiauto.com");
      const lastPathSegment = url.pathname.split("/").filter(Boolean).at(-1);
      if (url.origin === "https://www.nettiauto.com" && lastPathSegment === sourceListingId) {
        url.search = "";
        url.hash = "";
        return url.toString();
      }
    } catch {
      // Ignore non-URL hrefs.
    }
  }

  return null;
}

function isDateLikeKey(key: string) {
  return /(date|time|created|updated|posted|published|sold|first|last|valid)/i.test(key);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function countBy(values: string[]) {
  const counts: Record<string, number> = {};
  for (const value of values) {
    if (value) {
      counts[value] = (counts[value] ?? 0) + 1;
    }
  }
  return counts;
}

function unique(values: string[]) {
  return [...new Set(values)].filter(Boolean).sort();
}

function withoutPage(value: string) {
  const url = new URL(value);
  url.searchParams.delete("page");
  return url.toString();
}

function extractTitle(html: string) {
  return squash(stripTags(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? ""));
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
