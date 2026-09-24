import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { headers } from "next/headers";
import { getListingLookup, getDatasetOverview, getFilterMetadata } from "./server-api";

vi.mock("next/headers", () => ({ headers: vi.fn() }));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async () => Response.json({ listingId: "24223ef3-266a-4a53-a4a7-063f77390a95" }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe("server API client identity", () => {
  it("correlates an upstream 429 and retains its retry hint without logging filters", async () => {
    vi.mocked(headers).mockResolvedValue(new Headers({ "x-request-id": "page-request", "user-agent": "OAI-SearchBot/1.0" }) as Awaited<ReturnType<typeof headers>>);
    fetchMock.mockResolvedValue(new Response(null, { status: 429, headers: { "retry-after": "42", "x-request-id": "page-request" } }));
    await expect(getFilterMetadata("?make=private-filter")).rejects.toMatchObject({ status: 429, retryAfter: "42", requestId: "page-request" });
    const outgoing = new Headers(fetchMock.mock.lastCall![1].headers);
    expect(outgoing.get("x-request-id")).toBe("page-request");
    expect(outgoing.get("user-agent")).toBe("OAI-SearchBot/1.0");
    expect(JSON.parse(vi.mocked(console.warn).mock.lastCall![0])).toMatchObject({ event: "ssr_api_failure", status: 429, requestId: "page-request", retryAfter: "42" });
    expect(vi.mocked(console.warn).mock.lastCall![0]).not.toContain("private-filter");
  });

  it.each([
    new TypeError("fetch failed"),
    new DOMException("deadline exceeded", "TimeoutError"),
  ])("turns transport failure into a retryable API error (%s)", async (error) => {
    vi.mocked(headers).mockResolvedValue(new Headers() as Awaited<ReturnType<typeof headers>>);
    fetchMock.mockRejectedValue(error);
    await expect(getListingLookup("12345678")).rejects.toMatchObject({ status: 503 });
    expect(fetchMock.mock.lastCall![1].signal).toBeInstanceOf(AbortSignal);
  });

  it("forwards each visitor's proxy address on uncached requests", async () => {
    for (const address of ["192.0.2.1", "2001:db8::2"]) {
      vi.mocked(headers).mockResolvedValue(new Headers({ "x-forwarded-for": address }) as Awaited<ReturnType<typeof headers>>);
      await getListingLookup("12345678");
      const init = fetchMock.mock.lastCall![1] as RequestInit;
      expect(new Headers(init.headers).get("x-forwarded-for")).toBe(address);
      expect(init.cache).toBe("no-store");
    }
  });

  it("keeps shared homepage cache keys independent of visitor headers", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    await expect(getDatasetOverview({ next: { revalidate: 300 } })).rejects.toMatchObject({ status: 503 });
    expect(headers).not.toHaveBeenCalled();
    expect(fetchMock.mock.lastCall![1]).toEqual({ next: { revalidate: 300 } });
  });
});
