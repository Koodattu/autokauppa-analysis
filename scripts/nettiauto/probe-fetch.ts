type Scenario = {
  headers: Record<string, string>;
  name: string;
};

export {};

const urls =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : ["https://www.nettiauto.com/vaihtoautot?haku=P2236304442&page=1"];

const delayMs = Number(process.env.NETTIAUTO_PROBE_DELAY_MS ?? "1500");
const cookie = process.env.NETTIAUTO_COOKIE;
const scenarioFilter = new Set(
  (process.env.NETTIAUTO_PROBE_SCENARIOS ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean),
);

for (const url of urls) {
  console.log("");
  console.log(`== ${url} ==`);

  for (const scenario of scenariosFor(url).filter(
    (scenario) => scenarioFilter.size === 0 || scenarioFilter.has(scenario.name),
  )) {
    await probe(url, scenario);
    await sleep(delayMs);
  }
}

function scenariosFor(url: string): Scenario[] {
  const referer = refererFor(url);
  const commonHeaders = {
    "accept-language": "en-US,en;q=0.9,fi;q=0.8,fi-FI;q=0.7",
    "cache-control": "no-cache",
    pragma: "no-cache",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    ...(cookie ? { cookie } : {}),
  };

  return [
    {
      name: "document-navigation",
      headers: {
        ...commonHeaders,
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "upgrade-insecure-requests": "1",
      },
    },
    {
      name: "jquery-get-x-requested-with",
      headers: {
        ...commonHeaders,
        accept: "*/*",
        referer,
        "x-requested-with": "XMLHttpRequest",
      },
    },
    {
      name: "json-accept-only",
      headers: {
        ...commonHeaders,
        accept: "application/json, text/javascript, */*; q=0.01",
        referer,
      },
    },
    {
      name: "x-requested-with-html-accept",
      headers: {
        ...commonHeaders,
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        referer,
        "x-requested-with": "XMLHttpRequest",
      },
    },
  ];
}

async function probe(url: string, scenario: Scenario): Promise<void> {
  const startedAt = performance.now();
  const response = await fetch(url, {
    headers: scenario.headers,
    redirect: "manual",
  });
  const body = await response.text();
  const durationMs = Math.round(performance.now() - startedAt);
  const contentType = response.headers.get("content-type") ?? "";
  const location = response.headers.get("location");
  const classification = classifyBody(body, contentType);

  console.log(`-- ${scenario.name}`);
  console.log(`  status: ${response.status}`);
  console.log(`  content-type: ${contentType || "(none)"}`);
  console.log(`  body: ${classification}, ${Buffer.byteLength(body, "utf8")} bytes`);
  console.log(`  durationMs: ${durationMs}`);
  if (location) console.log(`  location: ${location}`);

  const parsed = parseJson(body);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    console.log(`  json keys: ${Object.keys(parsed).join(", ")}`);
    summarizeAjaxPayload(parsed);
  } else if (classification.startsWith("html")) {
    const title = body.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
    if (title) console.log(`  html title: ${squash(title)}`);
  }

  console.log(`  first bytes: ${squash(body.slice(0, 180))}`);
}

function summarizeAjaxPayload(parsed: Record<string, unknown>): void {
  if (typeof parsed.ad_listing_data !== "string") return;

  const records = extractDatalayerRecords(parsed.ad_listing_data);
  const statuses = countBy(
    records.map((record) =>
      typeof record.item_ad_status === "string" ? record.item_ad_status : "",
    ),
  );
  const listIds = countBy(
    records.map((record) =>
      typeof record.item_list_id === "string" ? record.item_list_id : "",
    ),
  );

  console.log(`  total_ads: ${String(parsed.total_ads ?? "")}`);
  console.log(
    `  current_page/total_page: ${String(parsed.current_page ?? "")}/${String(
      parsed.total_page ?? "",
    )}`,
  );
  console.log(`  datalayer records: ${records.length}`);
  console.log(`  statuses: ${formatCounts(statuses)}`);
  console.log(`  list ids: ${formatCounts(listIds)}`);
}

function classifyBody(body: string, contentType: string): string {
  const trimmed = body.trimStart();

  if (contentType.includes("application/json") || trimmed.startsWith("{")) {
    return "json";
  }

  if (/^<!doctype html\b|^<html\b/i.test(trimmed)) {
    return "html-document";
  }

  if (trimmed.startsWith("<")) {
    return "html-fragment";
  }

  return "unknown";
}

function parseJson(body: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function extractDatalayerRecords(html: string): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];

  for (const match of html.matchAll(/\bdata-datalayer=(["'])([\s\S]*?)\1/gi)) {
    const raw = match[2];
    if (!raw) continue;

    const decoded = decodeHtmlEntities(raw);
    const parsed = parseJson(decoded);
    if (parsed) records.push(parsed);
  }

  return records;
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

function refererFor(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.delete("page");
  return parsed.toString();
}

function squash(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
