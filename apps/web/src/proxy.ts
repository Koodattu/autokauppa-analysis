import { NextRequest, NextResponse } from "next/server";
import { createCrawlerPolicy, crawlerName } from "./lib/crawler-policy";

const checkCrawler = createCrawlerPolicy();

export function proxy(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const decision = checkCrawler(request.nextUrl, request.headers);
  if (decision) {
    console.info(JSON.stringify({
      event: "crawler_request_rejected", requestId, path: request.nextUrl.pathname,
      crawler: crawlerName(request.headers.get("user-agent") ?? ""), ...decision,
    }));
    return new NextResponse(decision.status === 429 ? "Too many requests. Please try again later.\n" : "Crawling this resource is not permitted. See /robots.txt.\n", {
      status: decision.status,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
        "X-Request-Id": requestId,
        ...(decision.retryAfter ? { "Retry-After": String(decision.retryAfter) } : {}),
      },
    });
  }
  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|media/|favicon.ico).*)"],
};
