import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  interval,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const jsonbEmptyObject = sql`'{}'::jsonb`;
const createdAtColumn = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAtColumn = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const sourceCodeEnum = pgEnum("source_code", ["nettiauto"]);
export const vehicleCategoryEnum = pgEnum("vehicle_category", ["passenger_car"]);
export const crawlKindEnum = pgEnum("crawl_kind", ["current", "sold"]);
export const listingAvailabilityEnum = pgEnum("listing_availability", [
  "active",
  "sold",
  "stale",
  "removed",
  "unknown",
]);
export const crawlRunStatusEnum = pgEnum("crawl_run_status", [
  "planned",
  "running",
  "completed",
  "partial",
  "failed",
  "cancelled",
]);
export const fetchKindEnum = pgEnum("fetch_kind", ["search_result_page", "detail_page"]);
export const fetchBodyShapeEnum = pgEnum("fetch_body_shape", [
  "ajax_json",
  "html_document",
  "html_fragment",
  "redirect",
  "blocked",
  "unknown",
]);
export const rawListingRecordKindEnum = pgEnum("raw_listing_record_kind", [
  "search_result_card",
  "search_result_json_ld",
  "detail_page",
]);
export const parserStatusEnum = pgEnum("parser_status", ["parsed", "failed", "skipped"]);

export const sourceSearchQueries = pgTable(
  "source_search_queries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: sourceCodeEnum("source").notNull(),
    vehicleCategory: vehicleCategoryEnum("vehicle_category").notNull(),
    crawlKind: crawlKindEnum("crawl_kind").notNull(),
    entryPath: text("entry_path").notNull(),
    sourceSearchHash: text("source_search_hash").notNull(),
    queryParams: jsonb("query_params").notNull().default(jsonbEmptyObject),
    enabled: boolean("enabled").notNull().default(true),
    priority: integer("priority").notNull().default(100),
    targetCadenceInterval: interval("target_cadence_interval"),
    lastCompleteCrawlRunId: uuid("last_complete_crawl_run_id"),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
    pausedUntil: timestamp("paused_until", { withTimezone: true }),
    pauseReason: text("pause_reason"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    notes: text("notes"),
  },
  (table) => [
    uniqueIndex("source_search_queries_source_category_kind_hash_uq").on(
      table.source,
      table.vehicleCategory,
      table.crawlKind,
      table.sourceSearchHash,
    ),
    index("source_search_queries_enabled_priority_idx").on(table.enabled, table.priority),
    index("source_search_queries_source_kind_enabled_idx").on(
      table.source,
      table.crawlKind,
      table.enabled,
    ),
  ],
);

export const crawlRuns = pgTable(
  "crawl_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: sourceCodeEnum("source").notNull(),
    searchQueryId: uuid("search_query_id")
      .notNull()
      .references(() => sourceSearchQueries.id),
    crawlKind: crawlKindEnum("crawl_kind").notNull(),
    vehicleCategory: vehicleCategoryEnum("vehicle_category").notNull(),
    status: crawlRunStatusEnum("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    expectedPageCount: integer("expected_page_count"),
    fetchedPageCount: integer("fetched_page_count").notNull().default(0),
    parsedListingCount: integer("parsed_listing_count").notNull().default(0),
    sourceTotalAds: integer("source_total_ads"),
    detailJobsScheduled: integer("detail_jobs_scheduled").notNull().default(0),
    isComplete: boolean("is_complete").notNull().default(false),
    failureReason: text("failure_reason"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("crawl_runs_search_query_created_idx").on(table.searchQueryId, table.createdAt),
    index("crawl_runs_source_kind_status_created_idx").on(
      table.source,
      table.crawlKind,
      table.status,
      table.createdAt,
    ),
    index("crawl_runs_recent_idx").on(table.createdAt.desc()),
    index("crawl_runs_completed_kind_finished_idx")
      .on(table.crawlKind, table.finishedAt.desc())
      .where(sql`${table.status} = 'completed'`),
    index("crawl_runs_recent_failures_idx")
      .on(table.createdAt.desc(), table.failureReason)
      .where(sql`${table.status} in ('failed', 'partial')`),
  ],
);

export const detailBackfillRuns = pgTable(
  "detail_backfill_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: sourceCodeEnum("source").notNull(),
    targetParserVersion: text("target_parser_version").notNull(),
    selection: text("selection").notNull().default("missing_or_v1"),
    status: text("status").notNull().default("planned"),
    targetCount: integer("target_count").notNull().default(0),
    scheduledCount: integer("scheduled_count").notNull().default(0),
    succeededCount: integer("succeeded_count").notNull().default(0),
    unavailableCount: integer("unavailable_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    attemptedCount: integer("attempted_count").notNull().default(0),
    cancelledCount: integer("cancelled_count").notNull().default(0),
    blockedUntil: timestamp("blocked_until", { withTimezone: true }),
    blockReason: text("block_reason"),
    nextDispatchAt: timestamp("next_dispatch_at", { withTimezone: true }),
    lastProgressAt: timestamp("last_progress_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("detail_backfill_runs_status_created_idx").on(table.status, table.createdAt.desc()),
  ],
);

export const sourceFetches = pgTable(
  "source_fetches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    crawlRunId: uuid("crawl_run_id").references(() => crawlRuns.id),
    detailBackfillRunId: uuid("detail_backfill_run_id").references(() => detailBackfillRuns.id),
    searchQueryId: uuid("search_query_id")
      .notNull()
      .references(() => sourceSearchQueries.id),
    source: sourceCodeEnum("source").notNull(),
    fetchKind: fetchKindEnum("fetch_kind").notNull(),
    pageNumber: integer("page_number"),
    attemptNumber: integer("attempt_number").notNull().default(1),
    sourceUrl: text("source_url").notNull(),
    sourceListingId: text("source_listing_id"),
    requestHeaders: jsonb("request_headers").notNull().default(jsonbEmptyObject),
    responseStatus: integer("response_status"),
    responseContentType: text("response_content_type"),
    responseBodyShape: fetchBodyShapeEnum("response_body_shape").notNull(),
    responseBodySha256: text("response_body_sha256"),
    responseBytes: integer("response_bytes"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    durationMs: integer("duration_ms"),
    errorType: text("error_type"),
    errorMessage: text("error_message"),
  },
  (table) => [
    check(
      "source_fetches_single_run_context_ck",
      sql`num_nonnulls(${table.crawlRunId}, ${table.detailBackfillRunId}) = 1`,
    ),
    uniqueIndex("source_fetches_crawl_run_kind_page_uq").on(
      table.crawlRunId,
      table.fetchKind,
      table.pageNumber,
      table.attemptNumber,
    ),
    index("source_fetches_search_query_page_idx").on(table.searchQueryId, table.pageNumber),
    index("source_fetches_detail_backfill_idx").on(table.detailBackfillRunId, table.fetchedAt),
    index("source_fetches_response_status_idx").on(table.responseStatus),
    index("source_fetches_response_body_shape_idx").on(table.responseBodyShape),
    index("source_fetches_failures_fetched_idx")
      .on(table.fetchedAt.desc())
      .where(sql`${table.errorType} is not null`),
  ],
);

export const rawListingRecords = pgTable(
  "raw_listing_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: sourceCodeEnum("source").notNull(),
    sourceListingId: text("source_listing_id").notNull(),
    crawlRunId: uuid("crawl_run_id").references(() => crawlRuns.id),
    detailBackfillRunId: uuid("detail_backfill_run_id").references(() => detailBackfillRuns.id),
    sourceFetchId: uuid("source_fetch_id")
      .notNull()
      .references(() => sourceFetches.id),
    recordKind: rawListingRecordKindEnum("record_kind").notNull(),
    sourceUrl: text("source_url"),
    sourcePayload: jsonb("source_payload").notNull(),
    sourceHtmlFragment: text("source_html_fragment"),
    sourcePayloadSha256: text("source_payload_sha256").notNull(),
    sourceUpdatedDate: date("source_updated_date"),
    parserVersion: text("parser_version").notNull(),
    parserStatus: parserStatusEnum("parser_status").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    parseError: text("parse_error"),
  },
  (table) => [
    check(
      "raw_listing_records_single_run_context_ck",
      sql`num_nonnulls(${table.crawlRunId}, ${table.detailBackfillRunId}) = 1`,
    ),
    uniqueIndex("raw_listing_records_fetch_listing_kind_uq").on(
      table.sourceFetchId,
      table.sourceListingId,
      table.recordKind,
    ),
    index("raw_listing_records_source_listing_idx").on(table.source, table.sourceListingId),
    index("raw_listing_records_crawl_run_idx").on(table.crawlRunId),
    index("raw_listing_records_detail_backfill_idx").on(table.detailBackfillRunId),
    index("raw_listing_records_parser_status_idx").on(table.parserVersion, table.parserStatus),
    index("raw_listing_records_captured_quality_idx").on(
      table.capturedAt.desc(),
      table.parserVersion,
      table.parserStatus,
    ),
    index("raw_listing_records_failed_captured_idx")
      .on(table.capturedAt.desc())
      .where(sql`${table.parserStatus} = 'failed'`),
  ],
);

export const listings = pgTable(
  "listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: sourceCodeEnum("source").notNull(),
    sourceListingId: text("source_listing_id").notNull(),
    vehicleCategory: vehicleCategoryEnum("vehicle_category").notNull(),
    canonicalSourceUrl: text("canonical_source_url"),
    currentAvailability: listingAvailabilityEnum("current_availability").notNull().default("unknown"),
    availabilityLastConfirmedAt: timestamp("availability_last_confirmed_at", { withTimezone: true }),
    sourceUpdatedDate: date("source_updated_date"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    lastRawListingRecordId: uuid("last_raw_listing_record_id").references(() => rawListingRecords.id),
    latestSnapshotId: uuid("latest_snapshot_id").references(
      (): AnyPgColumn => listingSnapshots.id,
    ),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("listings_source_listing_uq").on(table.source, table.sourceListingId),
    index("listings_availability_last_seen_idx").on(table.currentAvailability, table.lastSeenAt),
    index("listings_category_availability_idx").on(table.vehicleCategory, table.currentAvailability),
    index("listings_last_seen_id_idx").on(table.lastSeenAt.desc(), table.id),
    uniqueIndex("listings_latest_snapshot_id_uq")
      .on(table.latestSnapshotId)
      .where(sql`${table.latestSnapshotId} is not null`),
  ],
);

export const detailBackfillTargets = pgTable(
  "detail_backfill_targets",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => detailBackfillRuns.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    state: text("state").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.listingId] }),
    check("detail_backfill_targets_state_ck", sql`${table.state} in ('pending', 'queued')`),
    index("detail_backfill_targets_dispatch_idx").on(
      table.runId,
      table.state,
      table.nextAttemptAt,
      table.listingId,
    ),
  ],
);

export const listingSightings = pgTable(
  "listing_sightings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    crawlRunId: uuid("crawl_run_id")
      .notNull()
      .references(() => crawlRuns.id),
    searchQueryId: uuid("search_query_id")
      .notNull()
      .references(() => sourceSearchQueries.id),
    sourceFetchId: uuid("source_fetch_id")
      .notNull()
      .references(() => sourceFetches.id),
    rawListingRecordId: uuid("raw_listing_record_id")
      .notNull()
      .references(() => rawListingRecords.id),
    crawlKind: crawlKindEnum("crawl_kind").notNull(),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull(),
    pageNumber: integer("page_number"),
    position: integer("position"),
    sourceListId: text("source_list_id"),
    sourceStatusLabel: text("source_status_label"),
  },
  (table) => [
    uniqueIndex("listing_sightings_run_listing_fetch_uq").on(
      table.crawlRunId,
      table.listingId,
      table.sourceFetchId,
    ),
    index("listing_sightings_listing_seen_idx").on(table.listingId, table.seenAt),
    index("listing_sightings_seen_listing_idx").on(table.seenAt.desc(), table.listingId),
    index("listing_sightings_search_query_seen_idx").on(table.searchQueryId, table.seenAt),
    index("listing_sightings_query_listing_seen_idx").on(
      table.searchQueryId,
      table.listingId,
      table.seenAt.desc(),
    ),
  ],
);

export const listingSnapshots = pgTable(
  "listing_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    rawListingRecordId: uuid("raw_listing_record_id")
      .notNull()
      .references(() => rawListingRecords.id),
    parserVersion: text("parser_version").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    availability: listingAvailabilityEnum("availability").notNull(),
    sourceStatusLabel: text("source_status_label"),
    sourceUpdatedDate: date("source_updated_date"),
    askingPriceEur: integer("asking_price_eur"),
    observedSoldPriceEur: integer("observed_sold_price_eur"),
    priceSourceLabel: text("price_source_label"),
    mileageKm: integer("mileage_km"),
    mileageSourceLabel: text("mileage_source_label"),
    yearModel: integer("year_model"),
    makeSourceLabel: text("make_source_label"),
    modelSourceLabel: text("model_source_label"),
    fuelTypeSourceLabel: text("fuel_type_source_label"),
    transmissionSourceLabel: text("transmission_source_label"),
    bodyTypeSourceLabel: text("body_type_source_label"),
    colorSourceLabel: text("color_source_label"),
    sellerSourceLabel: text("seller_source_label"),
    sellerTypeSourceLabel: text("seller_type_source_label"),
    normalizedData: jsonb("normalized_data").notNull().default(jsonbEmptyObject),
    changeHash: text("change_hash").notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index("listing_snapshots_listing_observed_idx").on(table.listingId, table.observedAt),
    index("listing_snapshots_listing_latest_idx").on(
      table.listingId,
      table.observedAt.desc(),
      table.createdAt.desc(),
    ),
    index("listing_snapshots_availability_observed_idx").on(table.availability, table.observedAt),
    index("listing_snapshots_source_updated_date_idx").on(table.sourceUpdatedDate),
    index("listing_snapshots_make_model_idx").on(table.makeSourceLabel, table.modelSourceLabel),
    index("listing_snapshots_asking_price_idx").on(table.askingPriceEur),
    index("listing_snapshots_sold_price_idx").on(table.observedSoldPriceEur),
    index("listing_snapshots_mileage_idx").on(table.mileageKm),
    index("listing_snapshots_year_model_idx").on(table.yearModel),
    index("listing_snapshots_detail_enriched_idx")
      .on(table.id)
      .where(sql`${table.normalizedData} ? 'detailParserVersion'`),
  ],
);

export const listingImages = pgTable(
  "listing_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    source: sourceCodeEnum("source").notNull(),
    imageUrl: text("image_url").notNull(),
    imageRole: text("image_role"),
    position: integer("position"),
    width: integer("width"),
    height: integer("height"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    lastRawListingRecordId: uuid("last_raw_listing_record_id").references(() => rawListingRecords.id),
  },
  (table) => [
    uniqueIndex("listing_images_listing_url_uq").on(table.listingId, table.imageUrl),
    index("listing_images_listing_position_idx").on(table.listingId, table.position),
  ],
);

export const listingDetails = pgTable(
  "listing_details",
  {
    listingId: uuid("listing_id")
      .primaryKey()
      .references(() => listings.id),
    sourceParserVersion: text("source_parser_version").notNull(),
    normalizationSchemaVersion: text("normalization_schema_version").notNull(),
    sourceRawListingRecordId: uuid("source_raw_listing_record_id")
      .notNull()
      .references(() => rawListingRecords.id),
    sourceFetchId: uuid("source_fetch_id")
      .notNull()
      .references(() => sourceFetches.id),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    sourceUpdatedDate: date("source_updated_date"),
    vin: text("vin"),
    torqueNm: integer("torque_nm"),
    batteryCapacityKwh: numeric("battery_capacity_kwh", { precision: 8, scale: 2 }),
    electricRangeKm: integer("electric_range_km"),
    chargingTypeSourceLabel: text("charging_type_source_label"),
    chargingPowerAcKw: numeric("charging_power_ac_kw", { precision: 8, scale: 2 }),
    chargingPowerDcKw: numeric("charging_power_dc_kw", { precision: 8, scale: 2 }),
    batteryWarrantySourceLabel: text("battery_warranty_source_label"),
    batteryWarrantyMonths: integer("battery_warranty_months"),
    batteryWarrantyKm: integer("battery_warranty_km"),
    electricConsumptionSourceLabel: text("electric_consumption_source_label"),
    electricConsumptionCombinedKwh100Km: numeric(
      "electric_consumption_combined_kwh_100km",
      { precision: 8, scale: 2 },
    ),
    ownerCount: integer("owner_count"),
    normalizedData: jsonb("normalized_data").notNull().default(jsonbEmptyObject),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    index("listing_details_parser_idx").on(
      table.sourceParserVersion,
      table.normalizationSchemaVersion,
    ),
    index("listing_details_vin_idx").on(table.vin),
  ],
);

export const listingImageAssets = pgTable(
  "listing_image_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    assetPath: text("asset_path").notNull(),
    variantMask: integer("variant_mask").notNull().default(0),
    imageRole: text("image_role"),
    position: integer("position"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    lastRawListingRecordId: uuid("last_raw_listing_record_id")
      .notNull()
      .references(() => rawListingRecords.id),
  },
  (table) => [
    uniqueIndex("listing_image_assets_listing_path_uq").on(table.listingId, table.assetPath),
    index("listing_image_assets_listing_cohort_position_idx").on(
      table.listingId,
      table.lastRawListingRecordId,
      table.position,
    ),
  ],
);

export const listingHeroImages = pgTable(
  "listing_hero_images",
  {
    listingId: uuid("listing_id")
      .primaryKey()
      .references(() => listings.id),
    objectKey: text("object_key").notNull(),
    contentSha256: text("content_sha256").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    sourceImageAssetPath: text("source_image_asset_path").notNull(),
    sourceRawListingRecordId: uuid("source_raw_listing_record_id")
      .notNull()
      .references(() => rawListingRecords.id),
    archivedAt: timestamp("archived_at", { withTimezone: true }).notNull(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [index("listing_hero_images_content_sha_idx").on(table.contentSha256)],
);

export const listingEvents = pgTable(
  "listing_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    eventType: text("event_type").notNull(),
    eventAt: timestamp("event_at", { withTimezone: true }).notNull(),
    sourceCrawlRunId: uuid("source_crawl_run_id").references(() => crawlRuns.id),
    sourceSnapshotId: uuid("source_snapshot_id").references(() => listingSnapshots.id),
    metadata: jsonb("metadata").notNull().default(jsonbEmptyObject),
    createdAt: createdAtColumn(),
  },
  (table) => [
    uniqueIndex("listing_events_listing_type_run_uq")
      .on(table.listingId, table.eventType, table.sourceCrawlRunId)
      .where(sql`${table.sourceCrawlRunId} is not null`),
    index("listing_events_listing_type_time_idx").on(
      table.listingId,
      table.eventType,
      table.eventAt.desc(),
    ),
  ],
);

export const reprocessingRuns = pgTable("reprocessing_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  parserVersionFrom: text("parser_version_from"),
  parserVersionTo: text("parser_version_to").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  rawRecordCount: integer("raw_record_count").notNull().default(0),
  successCount: integer("success_count").notNull().default(0),
  failureCount: integer("failure_count").notNull().default(0),
  notes: text("notes"),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});

export type SourceSearchQuery = typeof sourceSearchQueries.$inferSelect;
export type CrawlRun = typeof crawlRuns.$inferSelect;
export type Listing = typeof listings.$inferSelect;
export type ListingSnapshot = typeof listingSnapshots.$inferSelect;
export type ListingDetail = typeof listingDetails.$inferSelect;
