export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export interface CoverageMetadata {
  lastRelevantCrawlAt: string | null;
  sampleSize: number;
  includesCurrent: boolean;
  includesSold: boolean;
  dataSource: "search_result_data";
  completeness: "complete" | "partial" | "unknown";
}

export interface FilterMetadata {
  makes: string[];
  models: string[];
  yearRange: { min: number | null; max: number | null };
  sellerTypes: string[];
  availability: Array<"current" | "sold" | "all">;
  coverage: CoverageMetadata;
}

export interface AnalyticsTrendResponse {
  coverage: CoverageMetadata;
  summary: {
    listingCount: number;
    activeCount: number;
    soldCount: number;
    medianAskingPriceEur: number | null;
    medianObservedSoldPriceEur: number | null;
    medianMileageKm: number | null;
  };
  timeSeries: Array<{
    bucket: string;
    listingCount: number;
    medianAskingPriceEur: number | null;
    medianObservedSoldPriceEur: number | null;
  }>;
  breakdowns: {
    byMake: Array<{ make: string; count: number }>;
  };
}

export interface ListingTableItem {
  listingId: string;
  sourceListingId: string;
  make: string | null;
  model: string | null;
  yearModel: number | null;
  availability: string;
  askingPriceEur: number | null;
  observedSoldPriceEur: number | null;
  mileageKm: number | null;
  seller: string | null;
  sellerType: string | null;
  lastSeenAt: string;
  sourceUrl: string | null;
}

export interface ListingSearchResponse {
  items: ListingTableItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  sort: string;
  coverage: CoverageMetadata;
}

export interface PublicListingDetailResponse {
  listing: ListingTableItem & {
    firstSeenAt: string;
    sourceAttribution: {
      source: "Nettiauto";
      sourceUrl: string | null;
      sourceListingId: string;
      observedDataLabel: string;
    };
  };
  priceHistory: Array<{
    observedAt: string;
    askingPriceEur: number | null;
    observedSoldPriceEur: number | null;
  }>;
  mileageHistory: Array<{ observedAt: string; mileageKm: number | null }>;
  availabilityHistory: Array<{ observedAt: string; availability: string }>;
  imageMetadata: Array<{ imageUrl: string; role: string | null; position: number | null }>;
  coverage: CoverageMetadata;
}

export interface AdminCrawlerStatusResponse {
  crawlerState: {
    enabled: boolean;
    paused: boolean;
    delayMs: number;
    maxPagesPerRun: number;
  };
  lastSuccessfulCrawls: Array<{
    crawlKind: "current" | "sold";
    finishedAt: string | null;
    parsedListingCount: number;
  }>;
  recentRuns: Array<{
    id: string;
    crawlKind: "current" | "sold";
    status: string;
    startedAt: string | null;
    finishedAt: string | null;
    fetchedPageCount: number;
    parsedListingCount: number;
    failureReason: string | null;
  }>;
  freshnessBySegment: Array<{
    crawlKind: "current" | "sold";
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    enabled: boolean;
  }>;
  queueBacklog: {
    pendingJobs: number;
    failedJobs: number;
  };
  failureCounts: Array<{ failureReason: string; count: number }>;
  latestParserErrorSummaries: Array<{
    capturedAt: string;
    parserVersion: string;
    parseError: string;
  }>;
}

export function apiPath(path: string) {
  return `${process.env.INTERNAL_API_BASE_URL ?? "http://localhost:3001"}${path}`;
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiPath(path), {
    ...init,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new ApiError(`API request failed: ${path}`, response.status);
  }

  return response.json() as Promise<T>;
}

export function searchParamsToQueryString(searchParams: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item) {
          params.append(key, item);
        }
      }
    } else if (value) {
      params.set(key, value);
    }
  }

  return params.toString();
}
