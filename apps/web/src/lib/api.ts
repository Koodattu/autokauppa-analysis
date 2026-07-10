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
  dataSource: "search_result_data" | "search_and_detail_data";
  completeness: "complete" | "partial" | "unknown";
}

export interface FilterMetadata {
  makes: string[];
  models: string[];
  yearRange: { min: number | null; max: number | null };
  sellerTypes: string[];
  transmissions: string[];
  availability: Array<"current" | "sold" | "all">;
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
    askingPriceSampleSize: number;
    observedSoldPriceSampleSize: number;
    mileageSampleSize: number;
  };
  charts: {
    marketOverTime: Array<{
      bucket: string;
      listingCount: number;
      activeCount: number;
      soldCount: number;
      newListingCount: number;
      medianAskingPriceEur: number | null;
      medianObservedSoldPriceEur: number | null;
      sampleSize: number;
      askingPriceSampleSize: number;
      observedSoldPriceSampleSize: number;
    }>;
    priceByYear: Array<{
      yearModel: number;
      listingCount: number;
      askingPriceSampleSize: number;
      observedSoldPriceSampleSize: number;
      medianMileageKm: number | null;
      askingPriceP25Eur: number | null;
      medianAskingPriceEur: number | null;
      askingPriceP75Eur: number | null;
      observedSoldPriceP25Eur: number | null;
      medianObservedSoldPriceEur: number | null;
      observedSoldPriceP75Eur: number | null;
    }>;
    priceByMileageBucket: Array<{
      bucketStartKm: number;
      bucketEndKm: number;
      listingCount: number;
      askingPriceSampleSize: number;
      observedSoldPriceSampleSize: number;
      medianYearModel: number | null;
      askingPriceP25Eur: number | null;
      medianAskingPriceEur: number | null;
      askingPriceP75Eur: number | null;
      observedSoldPriceP25Eur: number | null;
      medianObservedSoldPriceEur: number | null;
      observedSoldPriceP75Eur: number | null;
    }>;
    priceByTransmission: Array<{
      transmission: string;
      listingCount: number;
      askingPriceSampleSize: number;
      observedSoldPriceSampleSize: number;
      medianMileageKm: number | null;
      askingPriceP25Eur: number | null;
      medianAskingPriceEur: number | null;
      askingPriceP75Eur: number | null;
      observedSoldPriceP25Eur: number | null;
      medianObservedSoldPriceEur: number | null;
      observedSoldPriceP75Eur: number | null;
    }>;
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
  sourceUpdatedDate: string | null;
  lastSeenAt: string;
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

export interface MarketOverviewResponse {
  filters: FilterMetadata;
  analytics: AnalyticsTrendResponse;
  listings: ListingSearchResponse;
}

export interface PublicVehicleDetails {
  sourceUpdatedDate: string | null;
  sourceLocationLabel: string | null;
  registrationNumber: string | null;
  engineSourceLabel: string | null;
  fuelTypeSourceLabel: string | null;
  transmissionSourceLabel: string | null;
  drivetrainSourceLabel: string | null;
  firstRegistrationDate: string | null;
  inspectionDateLabel: string | null;
  bodyTypeSourceLabel: string | null;
  vehicleTypeSourceLabel: string | null;
  colorSourceLabel: string | null;
  powerKw: number | null;
  powerHp: number | null;
  topSpeedKmh: number | null;
  acceleration0To100S: number | null;
  seatCount: number | null;
  doorCount: number | null;
  steeringSideSourceLabel: string | null;
  curbWeightKg: number | null;
  grossWeightKg: number | null;
  towingWeightBrakedKg: number | null;
  towingWeightUnbrakedKg: number | null;
  co2GKm: number | null;
  fuelConsumptionSourceLabel: string | null;
  sellerNotes: string | null;
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
  history: Array<{
    observedAt: string;
    sourceUpdatedDate: string | null;
    availability: string;
    askingPriceEur: number | null;
    observedSoldPriceEur: number | null;
    mileageKm: number | null;
  }>;
  imageMetadata: Array<{
    imageUrl: string;
    role: string | null;
    position: number | null;
    width: number | null;
    height: number | null;
  }>;
  vehicleDetails: PublicVehicleDetails | null;
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
    lockedJobs: number;
    failedJobs: number;
  };
}

export interface AdminCrawlerDiagnosticsResponse {
  failureCounts: Array<{ failureReason: string; count: number }>;
  latestSourceFetchFailures: Array<{
    fetchedAt: string;
    fetchKind: string;
    pageNumber: number | null;
    sourceUrl: string;
    responseStatus: number | null;
    responseBodyShape: string;
    errorType: string;
    errorMessage: string | null;
  }>;
  latestParserErrorSummaries: Array<{
    capturedAt: string;
    parserVersion: string;
    parseError: string;
  }>;
  latestFailedJobs: Array<{
    id: string;
    taskIdentifier: string;
    attempts: number;
    maxAttempts: number;
    runAt: string | null;
    lastError: string | null;
    createdAt: string;
    updatedAt: string | null;
  }>;
}

export type AdminCrawlerRunTarget = "all" | "current" | "sold";

export interface AdminCrawlerRunResponse {
  ok: boolean;
  task: "schedule_nettiauto_crawl";
  crawlKind: AdminCrawlerRunTarget;
  jobId: string | null;
  runAt: string | null;
}

export function apiPath(path: string) {
  return `${process.env.INTERNAL_API_BASE_URL ?? "http://localhost:3001"}${path}`;
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const requestInit: RequestInit = { ...init };
  if (requestInit.cache === undefined && !("next" in requestInit)) {
    requestInit.cache = "no-store";
  }

  const response = await fetch(apiPath(path), requestInit);

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

export function singleSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
