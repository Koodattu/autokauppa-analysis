import { headers } from "next/headers";
import {
  adminCrawlerStatusResponseSchema,
  adminDetailBackfillStatusResponseSchema,
  analyticsSnapshotResponseSchema,
  analyticsTimeSeriesResponseSchema,
  filterMetadataResponseSchema,
  listingSearchResponseSchema,
  publicListingDetailResponseSchema,
  researchResponseSchema,
  datasetOverviewResponseSchema,
  listingLookupResponseSchema,
} from "@nettiauto/schemas";
import { ApiError } from "./api";

export * from "./api";

export function apiPath(path: string) {
  return `${process.env.INTERNAL_API_BASE_URL ?? "http://localhost:3001"}${path}`;
}

type ResponseSchema<T> = { parse(value: unknown): T };

async function apiGet<T>(path: string, schema: ResponseSchema<T>, init?: RequestInit): Promise<T> {
  const requestInit: RequestInit = { ...init };
  if (requestInit.cache === undefined && !("next" in requestInit)) {
    requestInit.cache = "no-store";
  }

  if (requestInit.cache === "no-store") {
    const clientAddress = (await headers()).get("x-forwarded-for");
    const outboundHeaders = new Headers(requestInit.headers);
    // Caddy supplies this header; keep cached homepage requests independent of visitors.
    if (clientAddress) outboundHeaders.set("x-forwarded-for", clientAddress);
    else outboundHeaders.delete("x-forwarded-for");
    requestInit.headers = outboundHeaders;
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

export function getListingLookup(sourceId: string) {
  return apiGet(`/listings/lookup/${encodeURIComponent(sourceId)}`, listingLookupResponseSchema);
}

export function getPriceResearch(query: string, init?: RequestInit) {
  return apiGet(`/analytics/research${query}`, researchResponseSchema, init);
}

export function getDatasetOverview(init?: RequestInit) {
  return apiGet("/market/dataset", datasetOverviewResponseSchema, init);
}

export function getAdminDetailBackfillStatus(init?: RequestInit) {
  return apiGet(
    "/admin/crawler/detail-backfill",
    adminDetailBackfillStatusResponseSchema,
    init,
  );
}
