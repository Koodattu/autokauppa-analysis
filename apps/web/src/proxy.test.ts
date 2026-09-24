import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

afterEach(() => vi.restoreAllMocks());

describe("public crawler responses", () => {
  it("returns a non-cacheable 403 before rendering GPTBot pages", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const response = proxy(new NextRequest("https://site.test/listings", { headers: { "user-agent": "GPTBot/1.4" } }));
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(response.headers.get("x-middleware-next")).toBeNull();
  });

  it("delivers a real 429 and Retry-After instead of entering SSR", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const request = () => new NextRequest("https://site.test/methodology", { headers: { "user-agent": "OAI-SearchBot/1.0", "x-forwarded-for": "192.0.2.10" } });
    for (let i = 0; i < 20; i++) expect(proxy(request()).headers.get("x-middleware-next")).toBe("1");
    const response = proxy(request());
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-middleware-next")).toBeNull();
  });

  it("replaces caller-supplied request IDs and preserves navigation headers", () => {
    const response = proxy(new NextRequest("https://site.test/listings?_rsc=abc", { headers: { "x-request-id": "untrusted", rsc: "1" } }));
    const requestId = response.headers.get("x-request-id");
    expect(requestId).not.toBe("untrusted");
    expect(response.headers.get("x-middleware-request-x-request-id")).toBe(requestId);
    expect(response.headers.get("x-middleware-request-rsc")).toBe("1");
  });
});
