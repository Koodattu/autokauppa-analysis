import { describe, expect, it, vi } from "vitest";
import {
  createFlareSolverrNettiautoSource,
  createHttpNettiautoSource,
  createImpitNettiautoSource,
  NettiautoSourceError,
} from "./nettiauto-source";

const request = {
  sourceUrl: "https://www.nettiauto.com/search",
  requestHeaders: { accept: "application/json" },
  parentSignal: new AbortController().signal,
  timeoutMs: 0,
};

describe("HTTP Nettiauto Source adapter", () => {
  it("returns classified response evidence", async () => {
    const source = createHttpNettiautoSource(async () =>
      new Response(JSON.stringify({ ad_listing_data: "" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await source.fetchSearchResultPage(request);

    expect(response).toMatchObject({
      ok: true,
      status: 200,
      contentType: "application/json",
      bodyShape: "ajax_json",
    });
    expect(response.bodyBytes).toBeGreaterThan(0);
    expect(response.bodySha256).toHaveLength(64);
    expect(response.diagnostics).toEqual({ transport: "fetch" });
  });

  it("extracts bounded Cloudflare challenge diagnostics without retaining the body", async () => {
    const source = createHttpNettiautoSource(async () =>
      new Response(
        '<!doctype html><html><head><title> Just a moment... </title></head>' +
          '<body><script src="https://challenges.cloudflare.com/test"></script></body></html>',
        {
          status: 403,
          headers: {
            "content-type": "text/html; charset=UTF-8",
            server: "cloudflare",
            "cf-ray": "test-ray-TLL",
          },
        },
      ),
    );

    const response = await source.fetchDetailPage(request);

    expect(response.diagnostics).toEqual({
      transport: "fetch",
      classification: "cloudflare_challenge",
      title: "Just a moment...",
      server: "cloudflare",
      cfRay: "test-ray-TLL",
    });
    expect(response.diagnostics).not.toHaveProperty("body");
  });

  it("captures redirect and retry headers as compact diagnostics", async () => {
    const source = createHttpNettiautoSource(async () =>
      new Response("", {
        status: 302,
        headers: {
          location: "https://www.nettiauto.com/redirected?temporary=secret",
          "retry-after": "120",
        },
      }),
    );

    const response = await source.fetchDetailPage(request);

    expect(response.diagnostics).toEqual({
      transport: "fetch",
      retryAfter: "120",
      location: "https://www.nettiauto.com/redirected",
    });
  });

  it("does not classify generic Cloudflare markup on a normal page as a challenge", async () => {
    const finalUrl = "https://www.nettiauto.com/canonical-listing";
    const source = createHttpNettiautoSource(async () => ({
      ok: true,
      status: 200,
      url: finalUrl,
      redirected: true,
      headers: new Headers({
        "content-type": "text/html; charset=UTF-8",
        server: "cloudflare",
      }),
      text: async () =>
        '<!doctype html><html><title>Nettiauto</title><script src="/cdn-cgi/challenge-platform/script.js"></script></html>',
    }));

    const response = await source.fetchDetailPage(request);

    expect(response.redirected).toBe(true);
    expect(response.diagnostics).toEqual({
      transport: "fetch",
      title: "Nettiauto",
      server: "cloudflare",
      location: finalUrl,
    });
  });

  it("converts transport failures into a stable source error", async () => {
    const source = createHttpNettiautoSource(async () => {
      throw new Error("socket closed");
    });

    await expect(source.fetchDetailPage(request)).rejects.toMatchObject<NettiautoSourceError>({
      name: "NettiautoSourceError",
      failureReason: "network_error",
    });
  });

  it("paces every completed source attempt with jitter", async () => {
    const wait = vi.fn(async () => undefined);
    const source = createHttpNettiautoSource(
      async () => new Response("upstream failure", { status: 502 }),
      { delayMs: 2_500, jitterMs: 1_000, random: () => 0.5, wait },
    );

    await source.fetchSearchResultPage(request);

    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledWith(3_000);
  });
});

describe("impit Nettiauto Source adapter", () => {
  it("uses a reusable browser-profile client without overriding its user agent", async () => {
    const fetch = vi.fn(async () =>
      new Response("<!doctype html><html><body>listing</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );
    const loadClient = vi.fn(async () => ({ fetch }));
    const source = createImpitNettiautoSource(
      { delayMs: 0, jitterMs: 0 },
      loadClient,
    );
    const impitRequest = {
      ...request,
      requestHeaders: {
        accept: "text/html",
        "user-agent": "stale browser fingerprint",
      },
    };

    const first = await source.fetchDetailPage(impitRequest);
    await source.fetchDetailPage(impitRequest);

    expect(first.diagnostics).toEqual({ transport: "impit" });
    expect(loadClient).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      headers: { accept: "text/html" },
      redirect: "follow",
    });
  });

  it("accepts a response that returned to the requested URL after an intermediate redirect", async () => {
    const sourceUrl = "https://www.nettiauto.com/en/tesla/model-3/14667409";
    const source = createImpitNettiautoSource(
      { delayMs: 0, jitterMs: 0 },
      async () => ({
        fetch: async () => ({
          ok: true,
          status: 200,
          url: sourceUrl,
          redirected: true,
          headers: new Headers({
            "content-type": "text/html; charset=UTF-8",
            server: "cloudflare",
          }),
          text: async () =>
            "<!doctype html><html><title>New and Second hand cars - Nettiauto</title></html>",
        }),
      }),
    );

    const response = await source.fetchDetailPage({
      sourceUrl,
      requestHeaders: { "user-agent": "ignored" },
      parentSignal: new AbortController().signal,
      timeoutMs: 5_000,
    });

    expect(response.ok).toBe(true);
    expect(response.redirected).toBe(false);
    expect(response.diagnostics).toEqual({ transport: "impit" });
  });
});

describe("FlareSolverr Nettiauto Source adapter", () => {
  it("uses a bounded persistent browser session and returns the rendered source", async () => {
    const fetchImplementation = vi.fn(async () =>
      Response.json({
        status: "ok",
        message: "",
        solution: {
          url: request.sourceUrl,
          status: 200,
          headers: { "content-type": "text/html; charset=UTF-8" },
          response: "<!doctype html><html><body>rendered listing</body></html>",
        },
      })
    );
    const source = createFlareSolverrNettiautoSource({
      endpoint: "http://flaresolverr:8191/v1",
      sessionId: "nettiauto-worker",
      sessionTtlMinutes: 30,
      fetchImplementation,
    });

    const response = await source.fetchDetailPage({ ...request, timeoutMs: 30_000 });

    expect(response).toMatchObject({
      ok: true,
      status: 200,
      bodyShape: "html_document",
      diagnostics: { transport: "flaresolverr" },
    });
    const init = fetchImplementation.mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body))).toEqual({
      cmd: "request.get",
      url: request.sourceUrl,
      session: "nettiauto-worker",
      session_ttl_minutes: 30,
      maxTimeout: 29_000,
      disableMedia: true,
    });
  });

  it("returns bounded solver diagnostics without leaking a response body", async () => {
    const fetchImplementation = vi.fn(async () =>
      Response.json(
        { status: "error", message: "Error solving the challenge. Timeout after 29 seconds." },
        { status: 500 },
      )
    );
    const source = createFlareSolverrNettiautoSource({
      endpoint: "http://flaresolverr:8191/v1",
      sessionId: "nettiauto-worker",
      sessionTtlMinutes: 30,
      fetchImplementation,
    });

    await expect(source.fetchDetailPage({ ...request, timeoutMs: 30_000 })).rejects.toMatchObject({
      failureReason: "flaresolverr_error",
      diagnostics: {
        transport: "flaresolverr",
        solverMessage: "Error solving the challenge. Timeout after 29 seconds.",
      },
    });
  });

  it("refuses non-Nettiauto targets before calling the internal browser service", async () => {
    const fetchImplementation = vi.fn();
    const source = createFlareSolverrNettiautoSource({
      endpoint: "http://flaresolverr:8191/v1",
      sessionId: "nettiauto-worker",
      sessionTtlMinutes: 30,
      fetchImplementation,
    });

    await expect(source.fetchDetailPage({
      ...request,
      sourceUrl: "http://169.254.169.254/latest/meta-data",
    })).rejects.toMatchObject({ failureReason: "invalid_source_url" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
