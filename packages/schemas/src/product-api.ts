import { z } from "zod";

const nullableNumber = z.number().nullable();
const nullableString = z.string().nullable();

export const coverageMetadataResponseSchema = z
  .object({
    lastRelevantCrawlAt: nullableString,
    sampleSize: z.number().int().nonnegative(),
    includesCurrent: z.boolean(),
    includesSold: z.boolean(),
    dataSource: z.enum(["search_result_data", "search_and_detail_data"]),
    completeness: z.enum(["complete", "partial", "unknown"]),
  })
  .strict();

export const filterMetadataResponseSchema = z
  .object({
    makes: z.array(z.string()),
    models: z.array(z.string()),
    yearRange: z.object({ min: nullableNumber, max: nullableNumber }).strict(),
    sellerTypes: z.array(z.string()),
    fuelTypes: z.array(z.string()),
    transmissions: z.array(z.string()),
    bodyTypes: z.array(z.string()).optional(),
    availability: z.array(z.enum(["current", "sold", "all"])),
  })
  .strict();

export const marketOverTimePointSchema = z
  .object({
    bucket: z.string(),
    listingCount: z.number().int().nonnegative(),
    activeCount: nullableNumber,
    soldCount: nullableNumber,
    newListingCount: z.number().int().nonnegative(),
    includesCurrentRun: z.boolean(),
    includesSoldRun: z.boolean(),
    medianAskingPriceEur: nullableNumber,
    medianObservedSoldPriceEur: nullableNumber,
    sampleSize: z.number().int().nonnegative(),
    askingPriceSampleSize: z.number().int().nonnegative(),
    observedSoldPriceSampleSize: z.number().int().nonnegative(),
  })
  .strict();

const priceDistributionFields = {
  listingCount: z.number().int().nonnegative(),
  askingPriceSampleSize: z.number().int().nonnegative(),
  observedSoldPriceSampleSize: z.number().int().nonnegative(),
  askingPriceP25Eur: nullableNumber,
  medianAskingPriceEur: nullableNumber,
  askingPriceP75Eur: nullableNumber,
  observedSoldPriceP25Eur: nullableNumber,
  medianObservedSoldPriceEur: nullableNumber,
  observedSoldPriceP75Eur: nullableNumber,
};

export const priceByYearPointSchema = z
  .object({
    yearModel: z.number().int(),
    ...priceDistributionFields,
    medianMileageKm: nullableNumber,
  })
  .strict();

export const priceByMileageBucketPointSchema = z
  .object({
    bucketStartKm: z.number().int().nonnegative(),
    bucketEndKm: z.number().int().nonnegative(),
    ...priceDistributionFields,
    medianYearModel: nullableNumber,
  })
  .strict();

export const priceByTransmissionPointSchema = z
  .object({
    transmission: z.string(),
    ...priceDistributionFields,
    medianMileageKm: nullableNumber,
  })
  .strict();

export const priceByFuelTypePointSchema = z
  .object({
    fuelType: z.string(),
    ...priceDistributionFields,
    medianMileageKm: nullableNumber,
  })
  .strict();

const analyticsSummarySchema = z
  .object({
    listingCount: z.number().int().nonnegative(),
    activeCount: z.number().int().nonnegative(),
    soldCount: z.number().int().nonnegative(),
    medianAskingPriceEur: nullableNumber,
    medianObservedSoldPriceEur: nullableNumber,
    medianMileageKm: nullableNumber,
    askingPriceSampleSize: z.number().int().nonnegative(),
    observedSoldPriceSampleSize: z.number().int().nonnegative(),
    mileageSampleSize: z.number().int().nonnegative(),
  })
  .strict();

export const listingTableItemResponseSchema = z
  .object({
    listingId: z.string().uuid(),
    sourceListingId: z.string(),
    make: nullableString,
    model: nullableString,
    yearModel: nullableNumber,
    availability: z.string(),
    askingPriceEur: nullableNumber,
    observedSoldPriceEur: nullableNumber,
    mileageKm: nullableNumber,
    seller: nullableString,
    sellerType: nullableString,
    sourceUpdatedDate: nullableString,
    lastSeenAt: z.string(),
    fuelType: nullableString.optional(),
    transmission: nullableString.optional(),
    bodyType: nullableString.optional(),
    firstSeenAt: z.string().optional(),
    thumbnailUrl: nullableString.optional(),
    location: nullableString.optional(),
    priceReductionEur: nullableNumber.optional(),
  })
  .strict();

export const publicVehicleDetailsResponseSchema = z
  .object({
    sourceUpdatedDate: nullableString,
    sourceLocationLabel: nullableString,
    registrationNumber: nullableString,
    officeFeeEur: nullableNumber,
    engineSourceLabel: nullableString,
    fuelTypeSourceLabel: nullableString,
    transmissionSourceLabel: nullableString,
    drivetrainSourceLabel: nullableString,
    firstRegistrationDate: nullableString,
    inspectionDateLabel: nullableString,
    bodyTypeSourceLabel: nullableString,
    vehicleTypeSourceLabel: nullableString,
    colorSourceLabel: nullableString,
    powerKw: nullableNumber,
    powerHp: nullableNumber,
    topSpeedKmh: nullableNumber,
    acceleration0To100S: nullableNumber,
    seatCount: nullableNumber,
    doorCount: nullableNumber,
    steeringSideSourceLabel: nullableString,
    curbWeightKg: nullableNumber,
    grossWeightKg: nullableNumber,
    towingWeightBrakedKg: nullableNumber,
    towingWeightUnbrakedKg: nullableNumber,
    co2GKm: nullableNumber,
    energyEfficiencyClassSourceLabel: nullableString,
    fuelConsumptionSourceLabel: nullableString,
    fuelConsumptionCityL100Km: nullableNumber,
    fuelConsumptionHighwayL100Km: nullableNumber,
    fuelConsumptionCombinedL100Km: nullableNumber,
    sellerNotes: nullableString,
    equipmentGroups: z.array(
      z.object({ label: z.string(), items: z.array(z.string()) }).strict(),
    ),
  })
  .strict();

export const publicListingDetailResponseSchema = z
  .object({
    listing: listingTableItemResponseSchema.extend({
      firstSeenAt: z.string(),
      sourceAttribution: z
        .object({
          source: z.literal("Nettiauto"),
          sourceUrl: nullableString,
          sourceListingId: z.string(),
          observedDataLabel: z.string(),
        })
        .strict(),
    }),
    history: z.array(
      z
        .object({
          observedAt: z.string(),
          sourceUpdatedDate: nullableString,
          availability: z.string(),
          askingPriceEur: nullableNumber,
          observedSoldPriceEur: nullableNumber,
          mileageKm: nullableNumber,
        })
        .strict(),
    ),
    imageMetadata: z.array(
      z
        .object({
          imageUrl: z.string(),
          fallbackImageUrls: z.array(z.string()),
          role: nullableString,
          position: nullableNumber,
          width: nullableNumber,
          height: nullableNumber,
        })
        .strict(),
    ),
    marketContext: z
      .object({
        cohortDescription: z.string(),
        priceBasis: z.enum(["asking", "observed_sold"]).nullable(),
        sampleSize: z.number().int().nonnegative(),
        priceP25Eur: nullableNumber,
        medianPriceEur: nullableNumber,
        priceP75Eur: nullableNumber,
        pricePercentile: nullableNumber,
        observedDays: z.number().int().nonnegative(),
        recordedPriceChangeCount: z.number().int().nonnegative(),
        comparableListings: z.array(listingTableItemResponseSchema).optional(),
        limitations: z.array(z.string()).optional(),
        comparisonHref: z.string().optional(),
      })
      .strict(),
    vehicleDetails: publicVehicleDetailsResponseSchema.nullable(),
  })
  .strict();

export function createProductApiResponseSchemas<TAnalysisQuery extends z.ZodType>(
  analysisQuerySchema: TAnalysisQuery,
) {
  const analyticsTrendResponseSchema = z
    .object({
      appliedFilters: analysisQuerySchema,
      coverage: coverageMetadataResponseSchema,
      summary: analyticsSummarySchema,
      charts: z
        .object({
          marketOverTime: z.array(marketOverTimePointSchema),
          priceByYear: z.array(priceByYearPointSchema),
          priceByMileageBucket: z.array(priceByMileageBucketPointSchema),
          priceByFuelType: z.array(priceByFuelTypePointSchema),
          priceByTransmission: z.array(priceByTransmissionPointSchema),
        })
        .strict(),
    })
    .strict();

  const analyticsSnapshotResponseSchema = analyticsTrendResponseSchema.extend({
    charts: analyticsTrendResponseSchema.shape.charts.omit({ marketOverTime: true }),
  });
  const analyticsTimeSeriesResponseSchema = z
    .object({
      appliedFilters: analysisQuerySchema,
      marketOverTime: z.array(marketOverTimePointSchema),
    })
    .strict();
  const listingSearchResponseSchema = z
    .object({
      items: z.array(listingTableItemResponseSchema),
      pagination: z
        .object({
          page: z.number().int().positive(),
          pageSize: z.number().int().positive(),
          totalItems: z.number().int().nonnegative(),
          totalPages: z.number().int().nonnegative(),
        })
        .strict(),
      sort: z.string(),
      coverage: coverageMetadataResponseSchema,
    })
    .strict();
  const marketOverviewResponseSchema = z
    .object({
      filters: filterMetadataResponseSchema,
      analytics: analyticsTrendResponseSchema,
      listings: listingSearchResponseSchema,
    })
    .strict();

  return {
    analyticsTrendResponseSchema,
    analyticsSnapshotResponseSchema,
    analyticsTimeSeriesResponseSchema,
    listingSearchResponseSchema,
    marketOverviewResponseSchema,
  };
}

export type CoverageMetadata = z.infer<typeof coverageMetadataResponseSchema>;
export type FilterMetadata = z.infer<typeof filterMetadataResponseSchema>;
export type MarketOverTimePoint = z.infer<typeof marketOverTimePointSchema>;
export type PriceByYearPoint = z.infer<typeof priceByYearPointSchema>;
export type PriceByMileageBucketPoint = z.infer<typeof priceByMileageBucketPointSchema>;
export type PriceByTransmissionPoint = z.infer<typeof priceByTransmissionPointSchema>;
export type PriceByFuelTypePoint = z.infer<typeof priceByFuelTypePointSchema>;
export type ListingTableItem = z.infer<typeof listingTableItemResponseSchema>;
export type PublicVehicleDetails = z.infer<typeof publicVehicleDetailsResponseSchema>;
export type PublicListingDetailResponse = z.infer<typeof publicListingDetailResponseSchema>;
