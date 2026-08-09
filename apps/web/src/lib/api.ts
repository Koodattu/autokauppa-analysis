import {
  adminCrawlerControlResponseSchema,
  adminCrawlerDiagnosticsResponseSchema,
  adminCrawlerRunResponseSchema,
  adminCrawlerStatusResponseSchema,
  analyticsSnapshotResponseSchema,
  analyticsTimeSeriesResponseSchema,
  filterMetadataResponseSchema,
  listingSearchResponseSchema,
  publicListingDetailResponseSchema,
} from "@nettiauto/schemas";

export type {
  AdminCrawlerControlResponse,
  AdminCrawlerDiagnosticsResponse,
  AdminCrawlerRunResponse,
  AdminCrawlerRunTarget,
  AdminCrawlerStatusResponse,
  AnalyticsSnapshotResponse,
  AnalyticsTimeSeriesResponse,
  AnalyticsTrendResponse,
  CoverageMetadata,
  FilterMetadata,
  ListingSearchResponse,
  ListingTableItem,
  MarketOverviewResponse,
  PublicListingDetailResponse,
  PublicVehicleDetails,
} from "@nettiauto/schemas";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export function apiPath(path: string) {
  return `${process.env.INTERNAL_API_BASE_URL ?? "http://localhost:3001"}${path}`;
}

type ResponseSchema<T> = { parse(value: unknown): T };

async function apiGet<T>(path: string, schema: ResponseSchema<T>, init?: RequestInit): Promise<T> {
  const requestInit: RequestInit = { ...init };
  if (requestInit.cache === undefined && !("next" in requestInit)) {
    requestInit.cache = "no-store";
  }

  const response = await fetch(apiPath(path), requestInit);

  if (!response.ok) {
    throw new ApiError(`API request failed: ${path}`, response.status);
  }

  return schema.parse(await response.json());
}

export function getFilterMetadata(query: string, init?: RequestInit) {
  return apiGet(`/filters${query}`, filterMetadataResponseSchema, init);
}

export function getAnalyticsSnapshot(query: string, init?: RequestInit) {
  return apiGet(`/analytics/snapshot${query}`, analyticsSnapshotResponseSchema, init);
}

export function getAnalyticsTimeSeries(query: string, init?: RequestInit) {
  return apiGet(`/analytics/time-series${query}`, analyticsTimeSeriesResponseSchema, init);
}

export function getListings(query: string, init?: RequestInit) {
  return apiGet(`/listings${query}`, listingSearchResponseSchema, init);
}

export function getPublicListingDetail(listingId: string, init?: RequestInit) {
  return apiGet(
    `/listings/${encodeURIComponent(listingId)}`,
    publicListingDetailResponseSchema,
    init,
  );
}

export function getAdminCrawlerStatus(init?: RequestInit) {
  return apiGet("/admin/crawler/status", adminCrawlerStatusResponseSchema, init);
}

export function parseAdminCrawlerStatus(value: unknown) {
  return adminCrawlerStatusResponseSchema.parse(value);
}

export function parseAdminCrawlerDiagnostics(value: unknown) {
  return adminCrawlerDiagnosticsResponseSchema.parse(value);
}

export function parseAdminCrawlerRun(value: unknown) {
  return adminCrawlerRunResponseSchema.parse(value);
}

export function parseAdminCrawlerControl(value: unknown) {
  return adminCrawlerControlResponseSchema.parse(value);
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

export function listingDetailHref(
  listingId: string,
  searchParams: Record<string, string | string[] | undefined>,
) {
  const query = new URLSearchParams(searchParamsToQueryString(searchParams));
  query.delete("returnTo");
  const value = query.toString();
  const returnTo = value ? `/listings?${value}` : "/listings";
  return `/listings/${encodeURIComponent(listingId)}?returnTo=${encodeURIComponent(returnTo)}`;
}

export function safeListingsReturnHref(value: string | string[] | undefined) {
  const rawPath = typeof value === "string" ? value.split(/[?#]/, 1)[0] : "";
  if (!value || Array.isArray(value) || rawPath !== "/listings" || value.includes("\\")) {
    return "/listings";
  }

  try {
    const base = "https://scope.invalid";
    const url = new URL(value, base);
    if (url.origin !== base || url.pathname !== "/listings" || url.hash) {
      return "/listings";
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return "/listings";
  }
}

export function filterMetadataQueryString(queryString: string) {
  const source = new URLSearchParams(queryString);
  const result = new URLSearchParams();
  for (const key of ["make", "model"]) {
    const value = source.get(key);
    if (value) {
      result.set(key, value);
    }
  }
  return result.toString();
}

export function singleSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
