import { describe, expect, it } from "vitest";
import {
  createHttpNettiautoSource,
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
});
