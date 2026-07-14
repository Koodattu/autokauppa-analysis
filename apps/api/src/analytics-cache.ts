import type { AppLogger } from "@nettiauto/logging";

type ResponseCacheStatus = "hit" | "miss" | "stale";

interface ResponseCacheOptions<Query, Value> {
  name: string;
  ttlMs: number;
  maxEntries: number;
  key: (query: Query) => string;
  loader: (query: Query) => Promise<Value>;
  logger: AppLogger;
  now?: () => number;
}

interface ResponseCacheEntry<Query, Value> {
  query: Query;
  value?: Value;
  refreshedAt: number;
  expiresAt: number;
  lastAccessedAt: number;
  refreshPromise?: Promise<Value>;
  lastError?: string;
}

export interface ResponseCacheResult<Value> {
  value: Value;
  status: ResponseCacheStatus;
  ageMs: number;
}

export class ResponseCache<Query, Value> {
  private readonly entries = new Map<string, ResponseCacheEntry<Query, Value>>();
  private readonly now: () => number;

  constructor(private readonly options: ResponseCacheOptions<Query, Value>) {
    this.now = options.now ?? Date.now;
  }

  async get(query: Query): Promise<ResponseCacheResult<Value>> {
    const key = this.options.key(query);
    const now = this.now();
    const entry = this.entries.get(key);

    if (entry?.value !== undefined) {
      entry.lastAccessedAt = now;
      if (entry.expiresAt <= now) {
        this.refreshInBackground(key, query);
        return {
          value: entry.value,
          status: "stale",
          ageMs: Math.max(0, now - entry.refreshedAt),
        };
      }

      return {
        value: entry.value,
        status: "hit",
        ageMs: Math.max(0, now - entry.refreshedAt),
      };
    }

    const value = await this.refresh(key, query);
    const refreshedEntry = this.entries.get(key);
    return {
      value,
      status: "miss",
      ageMs: refreshedEntry ? Math.max(0, this.now() - refreshedEntry.refreshedAt) : 0,
    };
  }

  async prewarm(query: Query): Promise<void> {
    const key = this.options.key(query);
    const entry = this.entries.get(key);
    if (entry?.value !== undefined && entry.expiresAt > this.now()) {
      return;
    }

    try {
      await this.refresh(key, query);
    } catch {
      // The refresh path logs failures and keeps the previous value when one exists.
    }
  }

  private refreshInBackground(key: string, query: Query) {
    void this.refresh(key, query).catch(() => {
      // The refresh path logs failures and keeps the previous value when one exists.
    });
  }

  private refresh(key: string, query: Query): Promise<Value> {
    const now = this.now();
    const entry = this.ensureEntry(key, query, now);
    if (entry.refreshPromise) {
      return entry.refreshPromise;
    }

    const startedAt = now;
    entry.refreshPromise = this.options
      .loader(query)
      .then((value) => {
        const completedAt = this.now();
        entry.value = value;
        entry.query = query;
        entry.refreshedAt = completedAt;
        entry.expiresAt = completedAt + this.options.ttlMs;
        entry.lastAccessedAt = completedAt;
        entry.lastError = undefined;
        this.prune(key);
        this.options.logger.info(
          {
            cacheName: this.options.name,
            cacheKey: key,
            durationMs: completedAt - startedAt,
            ttlMs: this.options.ttlMs,
          },
          "API response cache refreshed",
        );
        return value;
      })
      .catch((error) => {
        entry.lastError = error instanceof Error ? error.message : String(error);
        this.options.logger.error(
          {
            error,
            cacheName: this.options.name,
            cacheKey: key,
            hadCachedValue: entry.value !== undefined,
          },
          "API response cache refresh failed",
        );
        if (entry.value === undefined) {
          this.entries.delete(key);
        }
        throw error;
      })
      .finally(() => {
        const latestEntry = this.entries.get(key);
        if (latestEntry) {
          latestEntry.refreshPromise = undefined;
        }
      });

    return entry.refreshPromise;
  }

  private ensureEntry(key: string, query: Query, now: number) {
    const existing = this.entries.get(key);
    if (existing) {
      existing.query = query;
      existing.lastAccessedAt = now;
      return existing;
    }

    const entry: ResponseCacheEntry<Query, Value> = {
      query,
      refreshedAt: 0,
      expiresAt: 0,
      lastAccessedAt: now,
    };
    this.entries.set(key, entry);
    return entry;
  }

  private prune(protectedKey: string) {
    if (this.entries.size <= this.options.maxEntries) {
      return;
    }

    const candidates = [...this.entries.entries()]
      .filter(([key, entry]) => key !== protectedKey && !entry.refreshPromise)
      .sort(([, a], [, b]) => a.lastAccessedAt - b.lastAccessedAt);

    for (const [key] of candidates) {
      if (this.entries.size <= this.options.maxEntries) {
        return;
      }
      this.entries.delete(key);
    }
  }
}
