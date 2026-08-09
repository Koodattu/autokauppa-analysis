import { describe, expect, it } from "vitest";
import {
  createHttpNettiautoSearchPageSource,
  NettiautoSearchPageSourceError,
} from "./nettiauto-search-page-source";

const request = {
  sourceUrl: "https://www.nettiauto.com/search",
  requestHeaders: { accept: "application/json" },
  parentSignal: new AbortController().signal,
  timeoutMs: 0,
};

describe("HTTP Nettiauto search-page source", () => {
  it("returns classified response evidence", async () => {
    const source = createHttpNettiautoSearchPageSource(async () =>
      new Response(JSON.stringify({ ad_listing_data: "" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await source.fetchPage(request);

    expect(response).toMatchObject({
      ok: true,
      status: 200,
      contentType: "application/json",
      bodyShape: "ajax_json",
    });
    expect(response.bodyBytes).toBeGreaterThan(0);
    expect(response.bodySha256).toHaveLength(64);
  });

  it("converts transport failures into a stable source error", async () => {
    const source = createHttpNettiautoSearchPageSource(async () => {
      throw new Error("socket closed");
    });

    await expect(source.fetchPage(request)).rejects.toMatchObject<NettiautoSearchPageSourceError>({
      name: "NettiautoSearchPageSourceError",
      failureReason: "network_error",
    });
  });
});
