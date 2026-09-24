import { describe, expect, it } from "vitest";
import { createCrawlerPolicy } from "./crawler-policy";
import robots from "../app/robots";

const botHeaders = (address = "192.0.2.1", agent = "OAI-SearchBot/1.0") => new Headers({ "user-agent": agent, "x-forwarded-for": address });
const url = (path = "/listings/123") => new URL(path, "https://site.test");

describe("crawler admission before rendering", () => {
  it("blocks GPTBot case-insensitively but keeps robots.txt readable", () => {
    const check = createCrawlerPolicy();
    expect(check(url(), botHeaders(undefined, "Mozilla/5.0 (compatible; gptbot/1.4)"))?.status).toBe(403);
    expect(check(url("/robots.txt"), botHeaders(undefined, "GPTBot/1.4"))).toBeNull();
    expect(robots().rules).toContainEqual({ userAgent: "GPTBot", disallow: "/" });
  });

  it.each(["/analyze", "/compare?ids=123", "/admin/crawler", "/api/listings", "/listings?make=Volvo", "/listings/123?returnTo=%2Flistings", "/listings/123?_rsc=abc"])("rejects crawler navigation/filter variants: %s", (path) => {
    expect(createCrawlerPolicy()(url(path), botHeaders())?.status).toBe(403);
  });

  it("does not alter human navigation, RSC requests or user-initiated ChatGPT visits", () => {
    const check = createCrawlerPolicy(() => 0);
    for (const agent of ["Mozilla/5.0", "ChatGPT-User/1.0"]) {
      for (let i = 0; i < 150; i++) expect(check(url("/analyze?make=Volvo&_rsc=abc"), botHeaders(undefined, agent))).toBeNull();
    }
  });

  it("shares a per-address budget across crawler names and paths, resets without extending on rejection", () => {
    let time = 0;
    const check = createCrawlerPolicy(() => time);
    for (let i = 0; i < 20; i++) expect(check(url(`/listings/${i}`), botHeaders())).toBeNull();
    time = 1000;
    expect(check(url("/"), botHeaders(undefined, "Googlebot/2.1"))).toMatchObject({ status: 429, retryAfter: 59 });
    expect(check(url(), botHeaders("2001:db8::1"))).toBeNull();
    time = 60_000;
    expect(check(url(), botHeaders())).toBeNull();
  });

  it("bounds aggregate crawler work across rotating addresses without throttling humans", () => {
    const check = createCrawlerPolicy(() => 0);
    for (let i = 0; i < 60; i++) expect(check(url(), botHeaders(`192.0.2.${i}`))).toBeNull();
    expect(check(url(), botHeaders("2001:db8::99"))).toMatchObject({ status: 429, retryAfter: 60 });
    expect(check(url(), botHeaders(undefined, "Mozilla/5.0"))).toBeNull();
    expect(check(url("/robots.txt"), botHeaders())).toBeNull();
  });
});
