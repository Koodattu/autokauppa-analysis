import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  interval,
  jsonb,
  pgEnum,
  pgTable,
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
  ],
);

export const sourceFetches = pgTable(
  "source_fetches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    crawlRunId: uuid("crawl_run_id")
      .notNull()
      .references(() => crawlRuns.id),
    searchQueryId: uuid("search_query_id")
      .notNull()
      .references(() => sourceSearchQueries.id),
    source: sourceCodeEnum("source").notNull(),
    fetchKind: fetchKindEnum("fetch_kind").notNull(),
    pageNumber: integer("page_number"),
    sourceUrl: text("source_url").notNull(),
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
    uniqueIndex("source_fetches_crawl_run_kind_page_uq").on(
      table.crawlRunId,
      table.fetchKind,
      table.pageNumber,
    ),
    index("source_fetches_search_query_page_idx").on(table.searchQueryId, table.pageNumber),
    index("source_fetches_response_status_idx").on(table.responseStatus),
    index("source_fetches_response_body_shape_idx").on(table.responseBodyShape),
  ],
);

export const rawListingRecords = pgTable(
  "raw_listing_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: sourceCodeEnum("source").notNull(),
    sourceListingId: text("source_listing_id").notNull(),
    crawlRunId: uuid("crawl_run_id")
      .notNull()
      .references(() => crawlRuns.id),
    sourceFetchId: uuid("source_fetch_id")
      .notNull()
      .references(() => sourceFetches.id),
    recordKind: rawListingRecordKindEnum("record_kind").notNull(),
    sourceUrl: text("source_url"),
    sourcePayload: jsonb("source_payload").notNull(),
    sourceHtmlFragment: text("source_html_fragment"),
    sourcePayloadSha256: text("source_payload_sha256").notNull(),
    parserVersion: text("parser_version").notNull(),
    parserStatus: parserStatusEnum("parser_status").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    parseError: text("parse_error"),
  },
  (table) => [
    uniqueIndex("raw_listing_records_fetch_listing_kind_uq").on(
      table.sourceFetchId,
      table.sourceListingId,
      table.recordKind,
    ),
    index("raw_listing_records_source_listing_idx").on(table.source, table.sourceListingId),
    index("raw_listing_records_crawl_run_idx").on(table.crawlRunId),
    index("raw_listing_records_parser_status_idx").on(table.parserVersion, table.parserStatus),
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
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    lastRawListingRecordId: uuid("last_raw_listing_record_id").references(() => rawListingRecords.id),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("listings_source_listing_uq").on(table.source, table.sourceListingId),
    index("listings_availability_last_seen_idx").on(table.currentAvailability, table.lastSeenAt),
    index("listings_category_availability_idx").on(table.vehicleCategory, table.currentAvailability),
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
    index("listing_sightings_search_query_seen_idx").on(table.searchQueryId, table.seenAt),
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
    uniqueIndex("listing_snapshots_listing_hash_uq").on(table.listingId, table.changeHash),
    index("listing_snapshots_listing_observed_idx").on(table.listingId, table.observedAt),
    index("listing_snapshots_availability_observed_idx").on(table.availability, table.observedAt),
    index("listing_snapshots_make_model_idx").on(table.makeSourceLabel, table.modelSourceLabel),
    index("listing_snapshots_asking_price_idx").on(table.askingPriceEur),
    index("listing_snapshots_sold_price_idx").on(table.observedSoldPriceEur),
    index("listing_snapshots_mileage_idx").on(table.mileageKm),
    index("listing_snapshots_year_model_idx").on(table.yearModel),
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

export const listingEvents = pgTable("listing_events", {
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
});

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
