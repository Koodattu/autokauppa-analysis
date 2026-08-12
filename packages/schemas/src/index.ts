import { z } from "zod";
import {
  adminCrawlerControlResponseSchema,
  adminCrawlerDiagnosticsResponseSchema,
  adminCrawlerRunResponseSchema,
  adminCrawlerStatusResponseSchema,
} from "./admin-panel";
import { createProductApiResponseSchemas } from "./product-api";

export * from "./admin-panel";
export * from "./product-api";
export { coverageMetadataResponseSchema as coverageMetadataSchema } from "./product-api";

export const MAX_LISTING_PAGE = 1_000;
export const MAX_ANALYTICS_DATE_RANGE_DAYS = 730;
export const availabilityFilterSchema = z.enum(["current", "sold", "all"]).default("all");
export const listingSortSchema = z
  .enum([
    "lastSeenDesc",
    "sourceUpdatedDesc",
    "priceAsc",
    "priceDesc",
    "mileageAsc",
    "mileageDesc",
    "yearDesc",
  ])
  .default("lastSeenDesc");

const optionalTrimmed = (maxLength = 100) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .transform((value) => (value === "" ? undefined : value))
    .optional();

const optionalInteger = ({ min, max }: { min: number; max: number }) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === "") {
        return undefined;
      }

      if (typeof value === "number") {
        return value;
      }

      if (typeof value !== "string") {
        return value;
      }

      const parsed = Number(value);
      return Number.isInteger(parsed) ? parsed : value;
    },
    z.number().int().min(min).max(max).optional(),
  );

const optionalDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isValidIsoDate, "Date must be a valid calendar date.")
  .optional();

const listingFilterShape = {
  make: optionalTrimmed(80),
  model: optionalTrimmed(120),
  modelYear: optionalInteger({ min: 1886, max: 2100 }),
  modelYearFrom: optionalInteger({ min: 1886, max: 2100 }),
  modelYearTo: optionalInteger({ min: 1886, max: 2100 }),
  priceMin: optionalInteger({ min: 0, max: 100_000_000 }),
  priceMax: optionalInteger({ min: 0, max: 100_000_000 }),
  mileageMin: optionalInteger({ min: 0, max: 2_000_000 }),
  mileageMax: optionalInteger({ min: 0, max: 2_000_000 }),
  availability: availabilityFilterSchema,
  sellerType: optionalTrimmed(80),
  fuelType: optionalTrimmed(80),
  transmission: optionalTrimmed(80),
  from: optionalDate,
  to: optionalDate,
  interval: z.enum(["day", "week", "month"]).default("week"),
};

export const listingFiltersQuerySchema = z.object(listingFilterShape).superRefine(validateRanges);

export const listingSearchQuerySchema = z
  .object({
    ...listingFilterShape,
    page: optionalInteger({ min: 1, max: MAX_LISTING_PAGE }).transform((value) => value ?? 1),
    pageSize: optionalInteger({ min: 1, max: 50 }).transform((value) => value ?? 25),
    sort: listingSortSchema,
  })
  .superRefine(validateRanges);

export const {
  analyticsTrendResponseSchema,
  analyticsSnapshotResponseSchema,
  analyticsTimeSeriesResponseSchema,
  listingSearchResponseSchema,
  marketOverviewResponseSchema,
} = createProductApiResponseSchemas(listingFiltersQuerySchema);

const analysisQueryKeys = [
  "make",
  "model",
  "modelYear",
  "modelYearFrom",
  "modelYearTo",
  "priceMin",
  "priceMax",
  "mileageMin",
  "mileageMax",
  "availability",
  "sellerType",
  "fuelType",
  "transmission",
  "from",
  "to",
  "interval",
] as const;

const listingViewKeys = [...analysisQueryKeys, "page", "pageSize", "sort"] as const;

type AnalysisProjectionPolicy = {
  readonly [Key in keyof ListingFiltersQuery]: {
    listingSearch: "retain" | "drop";
    filterMetadata: "retain" | "drop";
  };
};

const ANALYSIS_PROJECTION_POLICY: AnalysisProjectionPolicy = {
  make: { listingSearch: "retain", filterMetadata: "retain" },
  model: { listingSearch: "retain", filterMetadata: "retain" },
  modelYear: { listingSearch: "retain", filterMetadata: "drop" },
  modelYearFrom: { listingSearch: "retain", filterMetadata: "drop" },
  modelYearTo: { listingSearch: "retain", filterMetadata: "drop" },
  priceMin: { listingSearch: "retain", filterMetadata: "drop" },
  priceMax: { listingSearch: "retain", filterMetadata: "drop" },
  mileageMin: { listingSearch: "retain", filterMetadata: "drop" },
  mileageMax: { listingSearch: "retain", filterMetadata: "drop" },
  availability: { listingSearch: "retain", filterMetadata: "drop" },
  sellerType: { listingSearch: "retain", filterMetadata: "drop" },
  fuelType: { listingSearch: "retain", filterMetadata: "drop" },
  transmission: { listingSearch: "retain", filterMetadata: "drop" },
  from: { listingSearch: "drop", filterMetadata: "drop" },
  to: { listingSearch: "drop", filterMetadata: "drop" },
  interval: { listingSearch: "drop", filterMetadata: "drop" },
};

const LISTING_VIEW_TO_ANALYSIS_POLICY: Record<
  keyof ListingSearchQuery,
  "retain" | "drop"
> = {
  make: "retain",
  model: "retain",
  modelYear: "retain",
  modelYearFrom: "retain",
  modelYearTo: "retain",
  priceMin: "retain",
  priceMax: "retain",
  mileageMin: "retain",
  mileageMax: "retain",
  availability: "retain",
  sellerType: "retain",
  fuelType: "retain",
  transmission: "retain",
  from: "retain",
  to: "retain",
  interval: "retain",
  page: "drop",
  pageSize: "drop",
  sort: "drop",
};

export interface UrlFilterIssue {
  code: string;
  path: PropertyKey[];
  message: string;
}

export type UrlFilterParseResult<T> =
  | { ok: true; query: T }
  | { ok: false; issues: UrlFilterIssue[] };

export const analysisQueryUrlFilter = {
  parse(input: URLSearchParams): UrlFilterParseResult<ListingFiltersQuery> {
    return parseUrlFilter(input, analysisQueryKeys, listingFiltersQuerySchema);
  },
  format(query: ListingFiltersQuery) {
    return formatUrlFilter(query, analysisQueryKeys);
  },
  toListingSearch(query: ListingFiltersQuery): ListingSearchQuery {
    return listingSearchQuerySchema.parse(
      Object.fromEntries(
        analysisQueryKeys.flatMap((key) =>
          ANALYSIS_PROJECTION_POLICY[key]!.listingSearch === "retain"
            ? [[key, query[key]]]
            : [],
        ),
      ),
    );
  },
  formatForFilterMetadata(query: ListingFiltersQuery) {
    const keys = analysisQueryKeys.filter(
      (key) => ANALYSIS_PROJECTION_POLICY[key]!.filterMetadata === "retain",
    );
    return formatUrlFilter(query, keys);
  },
};

export const listingSearchUrlFilter = {
  parse(input: URLSearchParams): UrlFilterParseResult<ListingSearchQuery> {
    return parseUrlFilter(input, listingViewKeys, listingSearchQuerySchema);
  },
  format(query: ListingSearchQuery) {
    return formatUrlFilter(query, listingViewKeys);
  },
  toAnalysisQuery(query: ListingSearchQuery): ListingFiltersQuery {
    return listingFiltersQuerySchema.parse(
      Object.fromEntries(
        listingViewKeys.flatMap((key) =>
          LISTING_VIEW_TO_ANALYSIS_POLICY[key] === "retain" ? [[key, query[key]]] : [],
        ),
      ),
    );
  },
  withPage(query: ListingSearchQuery, page: number): ListingSearchQuery {
    return listingSearchQuerySchema.parse({ ...query, page });
  },
};

export const listingIdSchema = z.string().uuid();

export const adminLoginRequestSchema = z.object({
  password: z.string().min(1),
});

export const adminCrawlerRunRequestSchema = z.object({
  crawlKind: z.enum(["all", "current", "sold"]).default("all"),
});

export const adminCrawlerControlRequestSchema = z.object({
  action: z.enum(["pause", "resume"]),
  crawlKind: z.enum(["all", "current", "sold"]).default("all"),
  pauseMinutes: z.coerce.number().int().min(1).max(7 * 24 * 60).default(6 * 60),
});

export const nettiautoCrawlKindSchema = z.enum(["current", "sold"]);
export const nettiautoAvailabilitySchema = z.enum(["active", "sold", "unknown"]);

export const nettiautoAjaxResponseSchema = z.object({
  total_ads: z.coerce.number().int().nonnegative().optional(),
  ad_listing_data: z.string(),
  current_page: z.coerce.number().int().positive().optional(),
  total_page: z.coerce.number().int().positive().optional(),
  pagination_small_view: z.unknown().optional(),
  pagination_large_view: z.unknown().optional(),
  quick_filter_option: z.unknown().optional(),
});

export const nettiautoDataLayerSchema = z
  .object({
    item_id: z.union([z.string(), z.number()]).transform(String),
    item_name: z.string().optional(),
    item_brand: z.string().optional(),
    item_variant: z.string().optional(),
    item_seller: z.string().optional(),
    item_year_model: z.union([z.string(), z.number()]).optional(),
    item_vehicle_price: z.union([z.string(), z.number()]).optional(),
    item_mileage: z.union([z.string(), z.number()]).optional(),
    item_power_type: z.string().optional(),
    item_ad_status: z.string().optional(),
    item_list_id: z.string().optional(),
    item_list_name: z.string().optional(),
    item_list_location: z.string().optional(),
    position: z.union([z.string(), z.number()]).optional(),
    page_number: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

export type ListingFiltersQuery = z.infer<typeof listingFiltersQuerySchema>;
export type ListingSearchQuery = z.infer<typeof listingSearchQuerySchema>;
export type AnalysisQuery = ListingFiltersQuery;
export type ListingViewQuery = ListingSearchQuery;
export type AnalyticsTrendResponse = z.infer<typeof analyticsTrendResponseSchema>;
export type AnalyticsSnapshotResponse = z.infer<typeof analyticsSnapshotResponseSchema>;
export type AnalyticsTimeSeriesResponse = z.infer<typeof analyticsTimeSeriesResponseSchema>;
export type ListingSearchResponse = z.infer<typeof listingSearchResponseSchema>;
export type MarketOverviewResponse = z.infer<typeof marketOverviewResponseSchema>;
export type AdminCrawlerStatusResponse = z.infer<typeof adminCrawlerStatusResponseSchema>;
export type AdminCrawlerDiagnosticsResponse = z.infer<typeof adminCrawlerDiagnosticsResponseSchema>;
export type AdminCrawlerRunResponse = z.infer<typeof adminCrawlerRunResponseSchema>;
export type AdminCrawlerControlResponse = z.infer<typeof adminCrawlerControlResponseSchema>;
export type AdminCrawlerRunTarget = AdminCrawlerRunResponse["crawlKind"];
export type AdminLoginRequest = z.infer<typeof adminLoginRequestSchema>;
export type AdminCrawlerRunRequest = z.infer<typeof adminCrawlerRunRequestSchema>;
export type AdminCrawlerControlRequest = z.infer<typeof adminCrawlerControlRequestSchema>;
export type NettiautoAjaxResponse = z.infer<typeof nettiautoAjaxResponseSchema>;
export type NettiautoDataLayer = z.infer<typeof nettiautoDataLayerSchema>;

function validateRanges(
  value: {
    modelYear?: number;
    modelYearFrom?: number;
    modelYearTo?: number;
    priceMin?: number;
    priceMax?: number;
    mileageMin?: number;
    mileageMax?: number;
    from?: string;
    to?: string;
  },
  context: z.RefinementCtx,
) {
  if (value.modelYear !== undefined && (value.modelYearFrom !== undefined || value.modelYearTo !== undefined)) {
    context.addIssue({
      code: "custom",
      path: ["modelYear"],
      message: "Use either an exact model year or a year range, not both.",
    });
  }
  validateRange(value.modelYearFrom, value.modelYearTo, "modelYearTo", "year", context);
  validateRange(value.priceMin, value.priceMax, "priceMax", "price", context);
  validateRange(value.mileageMin, value.mileageMax, "mileageMax", "mileage", context);
  if (value.from && value.to && value.from > value.to) {
    context.addIssue({
      code: "custom",
      path: ["to"],
      message: "End date must be on or after start date.",
    });
  }
  if (value.from && value.to) {
    const fromTime = new Date(`${value.from}T00:00:00Z`).getTime();
    const toTime = new Date(`${value.to}T00:00:00Z`).getTime();
    const rangeDays = (toTime - fromTime) / (24 * 60 * 60 * 1_000);
    if (rangeDays > MAX_ANALYTICS_DATE_RANGE_DAYS) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: `Trend range cannot exceed ${MAX_ANALYTICS_DATE_RANGE_DAYS} days.`,
      });
    }
  } else if (value.from) {
    const fromTime = new Date(`${value.from}T00:00:00Z`).getTime();
    const today = new Date();
    const todayTime = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const rangeDays = (todayTime - fromTime) / (24 * 60 * 60 * 1_000);
    if (rangeDays > MAX_ANALYTICS_DATE_RANGE_DAYS) {
      context.addIssue({
        code: "custom",
        path: ["from"],
        message: `Trend start cannot be more than ${MAX_ANALYTICS_DATE_RANGE_DAYS} days ago.`,
      });
    }
  }
}

function parseUrlFilter<T>(
  input: URLSearchParams,
  keys: readonly string[],
  schema: z.ZodType<T>,
): UrlFilterParseResult<T> {
  const duplicateIssues = keys.flatMap((key) =>
    input.getAll(key).length > 1
      ? [{ code: "duplicate", path: [key], message: `${key} must be provided once.` }]
      : [],
  );
  if (duplicateIssues.length > 0) {
    return { ok: false, issues: duplicateIssues };
  }

  const values = Object.fromEntries(
    keys.flatMap((key) => {
      const value = input.get(key);
      return value === null ? [] : [[key, value]];
    }),
  );
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        code: issue.code,
        path: [...issue.path],
        message: issue.message,
      })),
    };
  }
  return { ok: true, query: parsed.data };
}

function formatUrlFilter(
  query: Record<string, unknown>,
  keys: readonly string[],
) {
  const result = new URLSearchParams();
  for (const key of keys) {
    const value = query[key];
    if (
      value === undefined ||
      value === "" ||
      (key === "availability" && value === "all") ||
      (key === "interval" && value === "week") ||
      (key === "page" && value === 1) ||
      (key === "pageSize" && value === 25) ||
      (key === "sort" && value === "lastSeenDesc")
    ) {
      continue;
    }
    result.set(key, String(value));
  }
  return result;
}

function validateRange(
  minimum: number | undefined,
  maximum: number | undefined,
  path: string,
  label: string,
  context: z.RefinementCtx,
) {
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
    context.addIssue({
      code: "custom",
      path: [path],
      message: `Maximum ${label} must be at least the minimum ${label}.`,
    });
  }
}

function isValidIsoDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
