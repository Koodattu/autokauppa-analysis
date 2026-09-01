import { parseArgs } from "node:util";
import {
  hasUsableNettiautoDetailEvidence,
  nettiautoDetailRequestHeaders,
  parseNettiautoDetailPage,
  type NettiautoSourceTransport,
} from "@nettiauto/domain";
import {
  createFlareSolverrNettiautoSource,
  createHttpNettiautoSource,
  createImpitNettiautoSource,
} from "./nettiauto-source";

const { values } = parseArgs({
  options: {
    transport: { type: "string" },
    url: { type: "string" },
    timeoutMs: { type: "string", default: "70000" },
    flaresolverrUrl: { type: "string" },
  },
  strict: true,
});

const transport = parseTransport(values.transport);
const sourceUrl = parseSourceUrl(values.url);
const timeoutMs = parseTimeout(values.timeoutMs);
const pacing = { delayMs: 0, jitterMs: 0 };
const source = transport === "impit"
  ? createImpitNettiautoSource(pacing)
  : transport === "flaresolverr"
    ? createFlareSolverrNettiautoSource({
      endpoint: values.flaresolverrUrl ?? "http://localhost:8191/v1",
      sessionId: "nettiauto-operator-probe",
      sessionTtlMinutes: 10,
      pacing,
    })
    : createHttpNettiautoSource(globalThis.fetch, pacing);

try {
  const response = await source.fetchDetailPage({
    sourceUrl: sourceUrl.toString(),
    requestHeaders: nettiautoDetailRequestHeaders(sourceUrl.toString()),
    parentSignal: new AbortController().signal,
    timeoutMs,
  });
  const parsedDetail = response.ok &&
      (response.bodyShape === "html_document" || response.bodyShape === "html_fragment")
    ? parseNettiautoDetailPage(response.body, {
      sourceListingId: sourceUrl.pathname.split("/").filter(Boolean).at(-1) ?? "probe",
    })
    : null;

  console.log(JSON.stringify({
    transport,
    sourceUrl: `${sourceUrl.origin}${sourceUrl.pathname}`,
    ok: response.ok,
    redirected: response.redirected,
    status: response.status,
    contentType: response.contentType,
    bodyShape: response.bodyShape,
    bodyBytes: response.bodyBytes,
    bodySha256: response.bodySha256,
    durationMs: response.durationMs,
    diagnostics: response.diagnostics,
    parser: parsedDetail
      ? {
        version: parsedDetail.parserVersion,
        usableEvidence: hasUsableNettiautoDetailEvidence(parsedDetail),
        fieldCount: parsedDetail.sourcePayload.fields.length,
        imageCount: parsedDetail.images.length,
        vinPresent: parsedDetail.normalizedData.vin !== null,
      }
      : null,
  }, null, 2));
  process.exitCode = response.ok && !response.redirected &&
      parsedDetail !== null && hasUsableNettiautoDetailEvidence(parsedDetail)
    ? 0
    : 2;
} catch (error) {
  const sourceError = error && typeof error === "object"
    ? error as {
      name?: unknown;
      failureReason?: unknown;
      durationMs?: unknown;
      diagnostics?: unknown;
    }
    : {};
  console.error(JSON.stringify({
    transport,
    sourceUrl: `${sourceUrl.origin}${sourceUrl.pathname}`,
    error: sourceError.name ?? "Error",
    failureReason: sourceError.failureReason ?? "unknown",
    durationMs: sourceError.durationMs ?? null,
    diagnostics: sourceError.diagnostics ?? null,
  }, null, 2));
  process.exitCode = 1;
}

function parseTransport(value: string | undefined): NettiautoSourceTransport {
  if (value === "fetch" || value === "impit" || value === "flaresolverr") {
    return value;
  }
  throw new Error("--transport must be fetch, impit, or flaresolverr.");
}

function parseSourceUrl(value: string | undefined) {
  if (!value) {
    throw new Error("--url is required.");
  }
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    (url.hostname !== "nettiauto.com" && !url.hostname.endsWith(".nettiauto.com"))
  ) {
    throw new Error("--url must be an HTTPS Nettiauto URL.");
  }
  return url;
}

function parseTimeout(value: string | undefined) {
  const timeoutMs = Number(value);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
    throw new Error("--timeoutMs must be an integer between 1000 and 120000.");
  }
  return timeoutMs;
}
