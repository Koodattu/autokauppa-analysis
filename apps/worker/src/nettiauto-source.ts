import { setTimeout as wait } from "node:timers/promises";
import {
  NETTIAUTO_BASE_URL,
  classifyNettiautoResponseBody,
  sha256,
  type NettiautoResponseDiagnostics,
  type NettiautoResponseBodyShape,
  type NettiautoSourceTransport,
} from "@nettiauto/domain";
import { z } from "zod";
import {
  classifyRequestError,
  createNettiautoRequestSignal,
  nettiautoRequestDelayMs,
} from "./nettiauto-fetch-policy";

export interface NettiautoSourceRequest {
  sourceUrl: string;
  requestHeaders: Record<string, string>;
  parentSignal: AbortSignal;
  timeoutMs: number;
}

export interface NettiautoSourceResponse {
  ok: boolean;
  redirected: boolean;
  status: number;
  contentType: string | null;
  body: string;
  bodyShape: NettiautoResponseBodyShape;
  bodySha256: string;
  bodyBytes: number;
  durationMs: number;
  diagnostics: NettiautoResponseDiagnostics;
}

export interface NettiautoSource {
  fetchSearchResultPage(request: NettiautoSourceRequest): Promise<NettiautoSourceResponse>;
  fetchDetailPage(request: NettiautoSourceRequest): Promise<NettiautoSourceResponse>;
}

export interface NettiautoSourcePacing {
  delayMs: number;
  jitterMs: number;
  random?: () => number;
  wait?: (delayMs: number) => Promise<void>;
}

interface FetchLikeResponse {
  ok: boolean;
  status: number;
  url?: string;
  redirected?: boolean;
  headers: Headers;
  text(): Promise<string>;
}

interface FetchLikeRequestInit {
  headers: Record<string, string>;
  redirect: "manual" | "follow";
  signal: AbortSignal;
}

type FetchLikeImplementation = (
  url: string,
  init: FetchLikeRequestInit,
) => Promise<FetchLikeResponse>;

export interface ImpitClient {
  fetch(url: string, init: FetchLikeRequestInit): Promise<FetchLikeResponse>;
}

export interface FlareSolverrNettiautoSourceOptions {
  endpoint: string;
  sessionId: string;
  sessionTtlMinutes: number;
  pacing?: NettiautoSourcePacing;
  fetchImplementation?: typeof globalThis.fetch;
}

const flaresolverrResponseSchema = z.object({
  status: z.string(),
  message: z.string().optional().default(""),
  solution: z.object({
    url: z.string().url(),
    status: z.number().int(),
    headers: z.record(z.string(), z.unknown()).optional().default({}),
    response: z.string(),
  }).optional(),
});

export class NettiautoSourceError extends Error {
  constructor(
    public readonly failureReason: string,
    public readonly durationMs: number,
    public readonly transport: NettiautoSourceTransport = "fetch",
    public readonly diagnostics: NettiautoResponseDiagnostics = { transport },
  ) {
    super(`Nettiauto source request failed (${failureReason}).`);
    this.name = "NettiautoSourceError";
  }
}

export function createHttpNettiautoSource(
  fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  pacing: NettiautoSourcePacing = { delayMs: 0, jitterMs: 0 },
): NettiautoSource {
  return createFetchBasedNettiautoSource("fetch", fetchImplementation, pacing);
}

export function createImpitNettiautoSource(
  pacing: NettiautoSourcePacing = { delayMs: 0, jitterMs: 0 },
  loadClient: () => Promise<ImpitClient> = loadDefaultImpitClient,
): NettiautoSource {
  let client: Promise<ImpitClient> | undefined;
  const fetchImplementation: FetchLikeImplementation = async (url, init) => {
    client ??= loadClient();
    const { "user-agent": _userAgent, ...coherentHeaders } = init.headers;
    return (await client).fetch(url, {
      ...init,
      headers: coherentHeaders,
      redirect: "follow",
    });
  };

  return createFetchBasedNettiautoSource("impit", fetchImplementation, pacing);
}

export function createFlareSolverrNettiautoSource(
  options: FlareSolverrNettiautoSourceOptions,
): NettiautoSource {
  const pacing = options.pacing ?? { delayMs: 0, jitterMs: 0 };
  const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
  const source: NettiautoSource = {
    fetchSearchResultPage(request) {
      return fetchFlareSolverrPageWithPacing(fetchImplementation, request, options, pacing);
    },
    fetchDetailPage(request) {
      return fetchFlareSolverrPageWithPacing(fetchImplementation, request, options, pacing);
    },
  };

  return serializeNettiautoSource(source);
}

function createFetchBasedNettiautoSource(
  transport: NettiautoSourceTransport,
  fetchImplementation: FetchLikeImplementation,
  pacing: NettiautoSourcePacing,
): NettiautoSource {
  return {
    fetchSearchResultPage(request) {
      return fetchNettiautoPageWithPacing(transport, fetchImplementation, request, pacing);
    },
    fetchDetailPage(request) {
      return fetchNettiautoPageWithPacing(transport, fetchImplementation, request, pacing);
    },
  };
}

async function fetchNettiautoPageWithPacing(
  transport: NettiautoSourceTransport,
  fetchImplementation: FetchLikeImplementation,
  request: NettiautoSourceRequest,
  pacing: NettiautoSourcePacing,
) {
  try {
    return await fetchNettiautoPage(transport, fetchImplementation, request);
  } finally {
    await paceSourceAttempt(pacing);
  }
}

async function fetchNettiautoPage(
  transport: NettiautoSourceTransport,
  fetchImplementation: FetchLikeImplementation,
  request: NettiautoSourceRequest,
): Promise<NettiautoSourceResponse> {
  const startedAt = Date.now();
  const { signal, timeoutSignal } = createNettiautoRequestSignal(
    request.parentSignal,
    request.timeoutMs,
  );
  let response: FetchLikeResponse;
  let body: string;
  try {
    response = await fetchImplementation(request.sourceUrl, {
      headers: request.requestHeaders,
      redirect: "manual",
      signal,
    });
    body = await response.text();
  } catch {
    throw new NettiautoSourceError(
      classifyRequestError({
        timeoutAborted: timeoutSignal?.aborted ?? false,
        workerAborted: request.parentSignal.aborted,
      }),
      Date.now() - startedAt,
      transport,
    );
  }

  const contentType = response.headers.get("content-type");
  const redirected = Boolean(
    response.url && stripHash(response.url) !== stripHash(request.sourceUrl),
  );
  return {
    ok: response.ok,
    redirected,
    status: response.status,
    contentType,
    body,
    bodyShape: classifyNettiautoResponseBody(body, contentType),
    bodySha256: sha256(body),
    bodyBytes: new TextEncoder().encode(body).byteLength,
    durationMs: Date.now() - startedAt,
    diagnostics: response.ok && !redirected
      ? { transport }
      : extractResponseDiagnostics(response.headers, body, transport, response.status, response.url),
  };
}

async function fetchFlareSolverrPageWithPacing(
  fetchImplementation: typeof globalThis.fetch,
  request: NettiautoSourceRequest,
  options: FlareSolverrNettiautoSourceOptions,
  pacing: NettiautoSourcePacing,
) {
  try {
    return await fetchFlareSolverrPage(fetchImplementation, request, options);
  } finally {
    await paceSourceAttempt(pacing);
  }
}

async function fetchFlareSolverrPage(
  fetchImplementation: typeof globalThis.fetch,
  request: NettiautoSourceRequest,
  options: FlareSolverrNettiautoSourceOptions,
): Promise<NettiautoSourceResponse> {
  assertNettiautoSourceUrl(request.sourceUrl);
  const startedAt = Date.now();
  const { signal, timeoutSignal } = createNettiautoRequestSignal(
    request.parentSignal,
    request.timeoutMs,
  );

  let apiResponse: Response;
  let responsePayload: unknown;
  try {
    apiResponse = await fetchImplementation(options.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cmd: "request.get",
        url: request.sourceUrl,
        session: options.sessionId,
        session_ttl_minutes: options.sessionTtlMinutes,
        maxTimeout: Math.max(1_000, request.timeoutMs - 1_000),
        disableMedia: true,
      }),
      signal,
    });
    responsePayload = await apiResponse.json();
  } catch {
    throw new NettiautoSourceError(
      classifyRequestError({
        timeoutAborted: timeoutSignal?.aborted ?? false,
        workerAborted: request.parentSignal.aborted,
      }),
      Date.now() - startedAt,
      "flaresolverr",
    );
  }

  const parsed = flaresolverrResponseSchema.safeParse(responsePayload);
  if (!apiResponse.ok || !parsed.success || parsed.data.status !== "ok" || !parsed.data.solution) {
    const solverMessage = parsed.success
      ? boundedValue(parsed.data.message || `FlareSolverr HTTP ${apiResponse.status}.`, 240)
      : "FlareSolverr returned an invalid response.";
    throw new NettiautoSourceError(
      "flaresolverr_error",
      Date.now() - startedAt,
      "flaresolverr",
      compactDiagnostics({ transport: "flaresolverr", solverMessage }),
    );
  }

  const solution = parsed.data.solution;
  const headers = new Headers();
  for (const [name, value] of Object.entries(solution.headers)) {
    if (typeof value === "string") {
      headers.set(name, value);
    }
  }
  const redirected = stripHash(solution.url) !== stripHash(request.sourceUrl);
  const contentType = headers.get("content-type");
  const body = solution.response;
  const ok = solution.status >= 200 && solution.status < 300;

  return {
    ok,
    redirected,
    status: solution.status,
    contentType,
    body,
    bodyShape: classifyNettiautoResponseBody(body, contentType),
    bodySha256: sha256(body),
    bodyBytes: new TextEncoder().encode(body).byteLength,
    durationMs: Date.now() - startedAt,
    diagnostics: ok && !redirected
      ? { transport: "flaresolverr" }
      : extractResponseDiagnostics(headers, body, "flaresolverr", solution.status, solution.url),
  };
}

async function loadDefaultImpitClient(): Promise<ImpitClient> {
  const [{ Impit }, { CookieJar }] = await Promise.all([
    import("impit"),
    import("tough-cookie"),
  ]);
  return new Impit({
    browser: "chrome",
    cookieJar: new CookieJar(),
    followRedirects: true,
    vanillaFallback: false,
  });
}

function serializeNettiautoSource(source: NettiautoSource): NettiautoSource {
  let queue = Promise.resolve();
  const run = <T>(operation: () => Promise<T>) => {
    const result = queue.then(operation, operation);
    queue = result.then(() => undefined, () => undefined);
    return result;
  };

  return {
    fetchSearchResultPage: (request) => run(() => source.fetchSearchResultPage(request)),
    fetchDetailPage: (request) => run(() => source.fetchDetailPage(request)),
  };
}

async function paceSourceAttempt(pacing: NettiautoSourcePacing) {
  const delayMs = nettiautoRequestDelayMs(
    pacing.delayMs,
    pacing.jitterMs,
    pacing.random,
  );
  if (delayMs > 0) {
    await (pacing.wait ?? wait)(delayMs);
  }
}

function extractResponseDiagnostics(
  headers: Headers,
  body: string,
  transport: NettiautoSourceTransport,
  status: number,
  responseUrl?: string,
): NettiautoResponseDiagnostics {
  const server = boundedValue(headers.get("server"), 100);
  const titleMatch = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = boundedValue(titleMatch?.[1]?.replace(/\s+/g, " ").trim() ?? null, 160);
  const unsuccessfulStatus = status < 200 || status >= 300;
  const cloudflareChallenge = server?.toLowerCase() === "cloudflare" &&
    (title?.toLowerCase() === "just a moment..." ||
      unsuccessfulStatus && (
        body.includes("challenges.cloudflare.com") ||
        body.includes("/cdn-cgi/challenge-platform/")
      ));

  return compactDiagnostics({
    transport,
    classification: cloudflareChallenge ? "cloudflare_challenge" : undefined,
    title,
    server,
    cfRay: boundedValue(headers.get("cf-ray"), 100),
    retryAfter: boundedValue(headers.get("retry-after"), 100),
    location: compactLocation(headers.get("location") ?? responseUrl ?? null),
  });
}

function assertNettiautoSourceUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    (url.hostname !== "nettiauto.com" && !url.hostname.endsWith(".nettiauto.com"))
  ) {
    throw new NettiautoSourceError(
      "invalid_source_url",
      0,
      "flaresolverr",
      { transport: "flaresolverr" },
    );
  }
}

function stripHash(value: string) {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}

function boundedValue(value: string | null, maxLength: number) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function compactLocation(value: string | null) {
  const location = boundedValue(value, 2_000);
  if (!location) {
    return undefined;
  }

  try {
    const url = new URL(location, NETTIAUTO_BASE_URL);
    return `${url.origin}${url.pathname}`.slice(0, 500);
  } catch {
    return location.split(/[?#]/, 1)[0]?.slice(0, 500);
  }
}

function compactDiagnostics(
  diagnostics: NettiautoResponseDiagnostics,
): NettiautoResponseDiagnostics {
  return Object.fromEntries(
    Object.entries(diagnostics).filter((entry): entry is [string, string] =>
      typeof entry[1] === "string"
    ),
  );
}
