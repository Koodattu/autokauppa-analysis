import type { AnalyticsTimeSeriesResponse } from "@nettiauto/domain";
import type { AppLogger } from "@nettiauto/logging";
import type { ListingFiltersQuery } from "@nettiauto/schemas";

type AnalyticsCacheStatus = "hit" | "miss" | "stale";

type AnalyticsTrendLoader = (query: ListingFiltersQuery) => Promise<AnalyticsTimeSeriesResponse>;

interface AnalyticsTrendCacheOptions {
  ttlMs: number;
  maxEntries: number;
  loader: AnalyticsTrendLoader;
  logger: AppLogger;
  now?: () => number;
}

interface AnalyticsTrendCacheEntry {
  query: ListingFiltersQuery;
  value?: AnalyticsTimeSeriesResponse;
  refreshedAt: number;
  expiresAt: number;
  lastAccessedAt: number;
  refreshPromise?: Promise<AnalyticsTimeSeriesResponse>;
  lastError?: string;
}

export interface AnalyticsTrendCacheResult {
  value: AnalyticsTimeSeriesResponse;
  status: AnalyticsCacheStatus;
  ageMs: number;
}

export class AnalyticsTrendCache {
  private readonly entries = new Map<string, AnalyticsTrendCacheEntry>();
  private readonly now: () => number;

  constructor(private readonly options: AnalyticsTrendCacheOptions) {
    this.now = options.now ?? Date.now;
  }

  async get(query: ListingFiltersQuery): Promise<AnalyticsTrendCacheResult> {
    const key = analyticsTrendCacheKey(query);
    const now = this.now();
    const entry = this.entries.get(key);

    if (entry?.value) {
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

  prewarm(query: ListingFiltersQuery) {
    const key = analyticsTrendCacheKey(query);
    const entry = this.entries.get(key);
    if (entry?.value && entry.expiresAt > this.now()) {
      return;
    }

    this.refreshInBackground(key, query);
  }

  private refreshInBackground(key: string, query: ListingFiltersQuery) {
    void this.refresh(key, query).catch(() => {
      // The refresh path logs failures and keeps the previous value when one exists.
    });
  }

  private refresh(key: string, query: ListingFiltersQuery): Promise<AnalyticsTimeSeriesResponse> {
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
            cacheKey: key,
            durationMs: completedAt - startedAt,
            ttlMs: this.options.ttlMs,
          },
          "Analytics cache refreshed",
        );
        return value;
      })
      .catch((error) => {
        entry.lastError = error instanceof Error ? error.message : String(error);
        this.options.logger.error(
          {
            error,
            cacheKey: key,
            hadCachedValue: entry.value !== undefined,
          },
          "Analytics cache refresh failed",
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

  private ensureEntry(key: string, query: ListingFiltersQuery, now: number) {
    const existing = this.entries.get(key);
    if (existing) {
      existing.query = query;
      existing.lastAccessedAt = now;
      return existing;
    }

    const entry: AnalyticsTrendCacheEntry = {
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

function analyticsTrendCacheKey(query: ListingFiltersQuery) {
  return JSON.stringify({
    make: query.make ?? null,
    model: query.model ?? null,
    modelYear: query.modelYear ?? null,
    modelYearFrom: query.modelYearFrom ?? null,
    modelYearTo: query.modelYearTo ?? null,
    priceMin: query.priceMin ?? null,
    priceMax: query.priceMax ?? null,
    mileageMin: query.mileageMin ?? null,
    mileageMax: query.mileageMax ?? null,
    availability: query.availability,
    sellerType: query.sellerType ?? null,
    transmission: query.transmission ?? null,
    from: query.from ?? null,
    to: query.to ?? null,
    interval: query.interval,
  });
}
