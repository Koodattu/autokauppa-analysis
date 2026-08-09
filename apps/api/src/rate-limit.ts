export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  maxEntries?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();
  private readonly maxEntries: number;

  constructor(private readonly options: RateLimitOptions) {
    this.maxEntries = options.maxEntries ?? 10_000;
  }

  check(key: string, now = Date.now()): RateLimitResult {
    let entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + this.options.windowMs };
      this.entries.set(key, entry);
    }

    entry.count += 1;
    if (this.entries.size > this.maxEntries) {
      this.prune(now);
    }

    return {
      allowed: entry.count <= this.options.limit,
      remaining: Math.max(0, this.options.limit - entry.count),
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1_000)),
    };
  }

  private prune(now: number) {
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now || this.entries.size > this.maxEntries) {
        this.entries.delete(key);
      }
    }
  }
}
