import { z } from "zod";

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

export const listingIdSchema = z.string().uuid();

export const adminLoginRequestSchema = z.object({
  password: z.string().min(1),
});

export const adminCrawlerRunRequestSchema = z.object({
  crawlKind: z.enum(["all", "current", "sold"]).default("all"),
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

export const coverageMetadataSchema = z.object({
  lastRelevantCrawlAt: z.string().nullable(),
  sampleSize: z.number().int().nonnegative(),
  includesCurrent: z.boolean(),
  includesSold: z.boolean(),
  dataSource: z.enum(["search_result_data", "search_and_detail_data"]),
  completeness: z.enum(["complete", "partial", "unknown"]),
});

export type ListingFiltersQuery = z.infer<typeof listingFiltersQuerySchema>;
export type ListingSearchQuery = z.infer<typeof listingSearchQuerySchema>;
export type AdminLoginRequest = z.infer<typeof adminLoginRequestSchema>;
export type AdminCrawlerRunRequest = z.infer<typeof adminCrawlerRunRequestSchema>;
export type NettiautoAjaxResponse = z.infer<typeof nettiautoAjaxResponseSchema>;
export type NettiautoDataLayer = z.infer<typeof nettiautoDataLayerSchema>;
export type CoverageMetadata = z.infer<typeof coverageMetadataSchema>;

function validateRanges(
  value: {
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
