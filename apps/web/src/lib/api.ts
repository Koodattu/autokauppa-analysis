import {
  adminCrawlerControlResponseSchema,
  adminCrawlerDiagnosticsResponseSchema,
  adminCrawlerRunResponseSchema,
  adminCrawlerStatusResponseSchema,
  adminDetailBackfillStartResponseSchema,
  adminDetailBackfillStatusResponseSchema,
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
  AdminDetailBackfillStartResponse,
  AdminDetailBackfillStatusResponse,
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

export function getAdminDetailBackfillStatus(init?: RequestInit) {
  return apiGet(
    "/admin/crawler/detail-backfill",
    adminDetailBackfillStatusResponseSchema,
    init,
  );
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

export function parseAdminDetailBackfillStatus(value: unknown) {
  return adminDetailBackfillStatusResponseSchema.parse(value);
}

export function parseAdminDetailBackfillStart(value: unknown) {
  return adminDetailBackfillStartResponseSchema.parse(value);
}
