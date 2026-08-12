import {
  classifyNettiautoResponseBody,
  sha256,
  type NettiautoResponseBodyShape,
} from "@nettiauto/domain";
import { classifyRequestError, createNettiautoRequestSignal } from "./nettiauto-fetch-policy";

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
}

export interface NettiautoSource {
  fetchSearchResultPage(request: NettiautoSourceRequest): Promise<NettiautoSourceResponse>;
  fetchDetailPage(request: NettiautoSourceRequest): Promise<NettiautoSourceResponse>;
}

export class NettiautoSourceError extends Error {
  constructor(
    public readonly failureReason: string,
    public readonly durationMs: number,
  ) {
    super(`Nettiauto source request failed (${failureReason}).`);
    this.name = "NettiautoSourceError";
  }
}

export function createHttpNettiautoSource(
  fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
): NettiautoSource {
  return {
    fetchSearchResultPage(request) {
      return fetchNettiautoPage(fetchImplementation, request);
    },
    fetchDetailPage(request) {
      return fetchNettiautoPage(fetchImplementation, request);
    },
  };
}

async function fetchNettiautoPage(
  fetchImplementation: typeof globalThis.fetch,
  request: NettiautoSourceRequest,
): Promise<NettiautoSourceResponse> {
  const startedAt = Date.now();
  const { signal, timeoutSignal } = createNettiautoRequestSignal(
    request.parentSignal,
    request.timeoutMs,
  );
  let response: Response;
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
    );
  }

  const contentType = response.headers.get("content-type");
  return {
    ok: response.ok,
    redirected: response.redirected,
    status: response.status,
    contentType,
    body,
    bodyShape: classifyNettiautoResponseBody(body, contentType),
    bodySha256: sha256(body),
    bodyBytes: new TextEncoder().encode(body).byteLength,
    durationMs: Date.now() - startedAt,
  };
}
