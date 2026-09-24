export const CRAWLER_DISALLOWED_PATHS = ["/admin", "/api/", "/analyze", "/compare", "/*?"];

export function crawlerName(userAgent: string): string | null {
  if (/\bGPTBot\b/i.test(userAgent)) return "GPTBot";
  if (/\bOAI-SearchBot\b/i.test(userAgent)) return "OAI-SearchBot";
  return /bot\b|crawler|spider|slurp/i.test(userAgent) ? "other-crawler" : null;
}

type Decision = { status: 403 | 429; reason: string; retryAfter?: number };

// The single web process admits at most 60 crawler pages/minute, 20 per address.
// Checking the total first bounds this map to 60 entries; no persistent cache.
export function createCrawlerPolicy(now = Date.now) {
  let resetAt = 0;
  let total = 0;
  const clients = new Map<string, number>();

  return (url: URL, headers: Headers): Decision | null => {
    if (url.pathname === "/robots.txt") return null;
    const crawler = crawlerName(headers.get("user-agent") ?? "");
    if (!crawler) return null;
    if (crawler === "GPTBot") return { status: 403, reason: "training-crawl-disallowed" };
    if (url.search || /^\/(admin|api|analyze|compare)(\/|$)/.test(url.pathname)) {
      return { status: 403, reason: "crawl-path-disallowed" };
    }

    const time = now();
    if (time >= resetAt) {
      resetAt = time + 60_000;
      total = 0;
      clients.clear();
    }
    // Public ingress must overwrite untrusted X-Forwarded-For (Caddy default).
    const address = headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() || "unknown";
    const count = clients.get(address) ?? 0;
    if (total >= 60 || count >= 20) {
      return { status: 429, reason: "crawler-budget-exceeded", retryAfter: Math.max(1, Math.ceil((resetAt - time) / 1000)) };
    }
    total += 1;
    clients.set(address, count + 1);
    return null;
  };
}
