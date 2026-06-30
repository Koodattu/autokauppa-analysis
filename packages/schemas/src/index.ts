import { z } from "zod";

export const availabilityFilterSchema = z.enum(["current", "sold", "all"]).default("all");
export const listingSortSchema = z
  .enum([
    "lastSeenDesc",
    "priceAsc",
    "priceDesc",
    "mileageAsc",
    "mileageDesc",
    "yearDesc",
  ])
  .default("lastSeenDesc");

const optionalTrimmed = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

const optionalInteger = z
  .preprocess((value) => {
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
  }, z.number().int().optional());

const optionalDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

export const listingFiltersQuerySchema = z.object({
  make: optionalTrimmed,
  model: optionalTrimmed,
  modelYearFrom: optionalInteger,
  modelYearTo: optionalInteger,
  priceMin: optionalInteger,
  priceMax: optionalInteger,
  mileageMin: optionalInteger,
  mileageMax: optionalInteger,
  availability: availabilityFilterSchema,
  sellerType: optionalTrimmed,
  from: optionalDate,
  to: optionalDate,
  interval: z.enum(["day", "week", "month"]).default("week"),
});

export const listingSearchQuerySchema = listingFiltersQuerySchema.extend({
  page: optionalInteger.transform((value) => Math.max(1, value ?? 1)),
  pageSize: optionalInteger.transform((value) => Math.min(50, Math.max(1, value ?? 25))),
  sort: listingSortSchema,
});

export const adminLoginRequestSchema = z.object({
  password: z.string().min(1),
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
  dataSource: z.literal("search_result_data"),
  completeness: z.enum(["complete", "partial", "unknown"]),
});

export type ListingFiltersQuery = z.infer<typeof listingFiltersQuerySchema>;
export type ListingSearchQuery = z.infer<typeof listingSearchQuerySchema>;
export type AdminLoginRequest = z.infer<typeof adminLoginRequestSchema>;
export type NettiautoAjaxResponse = z.infer<typeof nettiautoAjaxResponseSchema>;
export type NettiautoDataLayer = z.infer<typeof nettiautoDataLayerSchema>;
export type CoverageMetadata = z.infer<typeof coverageMetadataSchema>;
