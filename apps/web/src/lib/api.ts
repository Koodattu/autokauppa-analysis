import {
  adminCrawlerControlResponseSchema,
  adminCrawlerDiagnosticsResponseSchema,
  adminCrawlerRunResponseSchema,
  adminCrawlerStatusResponseSchema,
  adminDetailBackfillStartResponseSchema,
  adminDetailBackfillControlResponseSchema,
  adminDetailBackfillStatusResponseSchema,
} from "@nettiauto/schemas";

export type {
  AdminCrawlerControlResponse,
  AdminCrawlerDiagnosticsResponse,
  AdminCrawlerRunResponse,
  AdminCrawlerRunTarget,
  AdminCrawlerStatusResponse,
  AdminDetailBackfillStartResponse,
  AdminDetailBackfillControlResponse,
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
  ResearchResponse,
  DatasetOverviewResponse,
} from "@nettiauto/schemas";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
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

export function parseAdminDetailBackfillControl(value: unknown) {
  return adminDetailBackfillControlResponseSchema.parse(value);
}
