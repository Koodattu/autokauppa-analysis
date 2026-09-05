import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listingFiltersQuerySchema, listingSearchQuerySchema, publicListingDetailResponseSchema } from "@nettiauto/schemas";
import {
  completeCrawlRun,
  getAdminCrawlerDiagnostics,
  getAnalyticsTimeSeries,
  getPriceResearch,
  getDatasetOverview,
  searchListings,
  parseNettiautoDetailPage,
  persistNettiautoDetailPage,
  getPublicListingDetail,
  getSchedulableSourceSearchQueries,
  reserveCrawlRunDetailJobs,
  setSourceSearchQueriesPaused,
} from "./index";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = testDatabaseUrl ? describe : describe.skip;

describeDatabase("PostgreSQL product integration", () => {
  if (!testDatabaseUrl) {
    return;
  }
  const databaseName = new URL(testDatabaseUrl).pathname.slice(1);
  if (!databaseName.includes("test")) {
    throw new Error("Integration tests require a database name containing 'test'.");
  }

  const sql = postgres(testDatabaseUrl, { max: 1, prepare: false });

  beforeAll(async () => {
    const [migrationTable] = await sql<{ relationName: string | null }[]>`
      select to_regclass('drizzle.__drizzle_migrations')::text as "relationName"
    `;
    if (!migrationTable?.relationName) {
      throw new Error("Test database migrations have not been applied.");
    }
  });

  beforeEach(async () => {
    await sql.unsafe(`
      truncate table
        listing_events,
        listing_images,
        listing_sightings,
        listing_snapshots,
        listings,
        raw_listing_records,
        source_fetches,
        crawl_runs,
        source_search_queries,
        reprocessing_runs
      restart identity cascade
    `);
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it("distinguishes an unobserved sold period from an observed zero", async () => {
    const currentQueryId = await insertSourceQuery("current", "current-test");
    const soldQueryId = await insertSourceQuery("sold", "sold-test");
    const currentRunOne = await insertRun(currentQueryId, "current", "2026-08-03T10:00:00Z");
    const soldRunOne = await insertRun(soldQueryId, "sold", "2026-08-03T11:00:00Z");
    const currentRunTwo = await insertRun(currentQueryId, "current", "2026-08-10T10:00:00Z");

    await insertObservation(currentRunOne, currentQueryId, "current", "active-1", "active", "2026-08-03T09:00:00Z", 20_000);
    await insertObservation(currentRunTwo, currentQueryId, "current", "active-1", "active", "2026-08-10T09:00:00Z", 25_000);
    await insertObservation(soldRunOne, soldQueryId, "sold", "sold-1", "sold", "2026-08-03T09:30:00Z", 18_000);

    const result = await getAnalyticsTimeSeries(
      sql,
      listingFiltersQuerySchema.parse({
        availability: "all",
        interval: "week",
        from: "2026-08-03",
        to: "2026-08-16",
      }),
    );

    expect(result.marketOverTime).toHaveLength(2);
    expect(result.marketOverTime[0]).toMatchObject({
      includesCurrentRun: true,
      includesSoldRun: true,
      activeCount: 1,
      soldCount: 1,
      medianAskingPriceEur: 20_000,
    });
    expect(result.marketOverTime[1]).toMatchObject({
      includesCurrentRun: true,
      includesSoldRun: false,
      activeCount: 1,
      soldCount: null,
      medianAskingPriceEur: 25_000,
    });
  });

  it("research uses historical attributes, excludes incomplete runs and never invents missing periods", async () => {
    const queryId = await insertSourceQuery("current", "research");
    const earlyRun = await insertRun(queryId, "current", "2023-06-15T10:00:00Z");
    const laterRun = await insertRun(queryId, "current", "2025-06-15T10:00:00Z");
    const listingId = await insertObservation(earlyRun, queryId, "current", "research-1", "active", "2023-06-15T09:00:00Z", 20000);
    await insertObservation(laterRun, queryId, "current", "research-1", "active", "2025-06-15T09:00:00Z", 15000);
    await sql`update listing_snapshots set mileage_km = 180000 where listing_id = ${listingId} and observed_at > '2025-01-01'`;
    const query = listingSearchQuerySchema.parse({ make: "Toyota", model: "Corolla", transmission: "Automatic", availability: "current", mileageMax: 120000, from: "2023-01-01", to: "2023-12-31" });
    const early = await getPriceResearch(sql, query);
    expect(early.summary).toMatchObject({ count: 1, median: 20000, medianMileage: 100000 });
    expect(early.evidence[0]).toMatchObject({ listingId, askingPriceEur: 20000, mileageKm: 100000 });
    const later = await getPriceResearch(sql, { ...query, from: "2025-01-01", to: "2025-12-31" });
    expect(later.summary.count).toBe(0);
    expect(later.coverage.completeness).toBe("complete");
    const missing = await getPriceResearch(sql, { ...query, from: "2022-01-01", to: "2022-12-31" });
    expect(missing.summary.median).toBeNull();
    expect(missing.coverage.completeness).toBe("unknown");
    await sql`update crawl_runs set is_complete = false where id = ${earlyRun}`;
    expect((await getPriceResearch(sql, query)).evidence).toEqual([]);
    const overview = await getDatasetOverview(sql);
    expect(overview.current).toBe(1);
    expect(overview.reduced).toBe(1);
    const reduced = await searchListings(sql, listingSearchQuerySchema.parse({ availability: "current", activity: "priceReduced", sort: "priceReductionDesc" }));
    expect(reduced.items.map((item) => item.listingId)).toEqual([listingId]);
    expect(reduced.items[0]?.priceReductionEur).toBe(5000);
    expect((await searchListings(sql, listingSearchQuerySchema.parse({ availability: "current", sort: "firstSeenDesc" }))).items[0]?.listingId).toBe(listingId);
    await sql`update crawl_runs set is_complete = true where id = ${earlyRun}`;
    for (let index = 1; index <= 5; index++) {
      await insertObservation(earlyRun, queryId, "current", `research-peer-${index}`, "active", "2023-06-15T09:00:00Z", 20000 + index * 1000);
      await insertObservation(laterRun, queryId, "current", `research-peer-${index}`, "active", "2025-06-15T09:00:00Z", 15000 + index * 1000);
    }
    expect((await getPriceResearch(sql, query)).summary).toMatchObject({ count: 6, median: 22500 });
    expect((await getPriceResearch(sql, { ...query, from: "2025-01-01", to: "2025-12-31" })).summary).toMatchObject({ count: 5, median: 18000 });
    await insertRun(queryId, "current", "2024-01-15T10:00:00Z");
    const trend = await getAnalyticsTimeSeries(sql, listingFiltersQuerySchema.parse({ availability: "current", interval: "month", from: "2023-06-01", to: "2024-02-01" }));
    expect(trend.marketOverTime.find((point) => point.bucket === "2023-07-01")).toMatchObject({ includesCurrentRun: false, activeCount: null, medianAskingPriceEur: null });
  });

  it("preserves earlier snapshots when detail enrichment arrives out of order", async () => {
    const queryId = await insertSourceQuery("current", "delayed-detail");
    const earlyRun = await insertRun(queryId, "current", "2023-06-15T10:00:00Z");
    const laterRun = await insertRun(queryId, "current", "2025-06-15T10:00:00Z");
    const listingId = await insertObservation(earlyRun, queryId, "current", "12345678", "active", "2023-06-15T09:00:00Z", 20000);
    await insertObservation(laterRun, queryId, "current", "12345678", "active", "2025-06-15T09:00:00Z", 15000);
    const input = {
      crawlRunId: earlyRun, searchQueryId: queryId, sourceListingId: "12345678",
      sourceUrl: "https://www.nettiauto.com/toyota/corolla/12345678", responseStatus: 200,
      responseContentType: "text/html", responseBodyShape: "html_document" as const,
      responseBodySha256: null, responseBytes: null, durationMs: 1, requestHeaders: {},
      fetchedAt: new Date("2023-06-15T09:01:00Z"),
      parsedDetail: parseNettiautoDetailPage('<html><body><div class="page-header__item_date-location">Päivitetty 15.06.2023 Helsinki ID 12345678</div></body></html>', { sourceListingId: "12345678" }),
    };
    await persistNettiautoDetailPage(sql, input);
    const snapshots = await sql`select asking_price_eur, observed_at, normalized_data from listing_snapshots where listing_id = ${listingId} order by observed_at`;
    expect(snapshots).toHaveLength(3);
    expect(snapshots[0]?.normalized_data).toEqual({});
    expect(snapshots[1]?.asking_price_eur).toBe(20000);
    expect(snapshots[1]?.normalized_data.detailParserVersion).toBeTruthy();
    expect(snapshots[2]?.asking_price_eur).toBe(15000);
    expect((await getPublicListingDetail(sql, listingId))?.listing.askingPriceEur).toBe(15000);
    await persistNettiautoDetailPage(sql, { ...input, fetchedAt: new Date("2025-06-15T09:01:00Z"), crawlRunId: laterRun });
    expect((await sql`select id from listing_snapshots where listing_id = ${listingId}`)).toHaveLength(4);
    expect((await getPublicListingDetail(sql, listingId))?.listing.askingPriceEur).toBe(15000);
  });

  it("enforces detail budgets and excludes administratively paused queries", async () => {
    const queryId = await insertSourceQuery("current", "budget-test");
    const [run] = await sql<{ id: string }[]>`
      insert into crawl_runs (
        source, search_query_id, crawl_kind, vehicle_category, status, started_at
      ) values ('nettiauto', ${queryId}, 'current', 'passenger_car', 'running', now())
      returning id
    `;
    if (!run) throw new Error("Failed to create test Crawl Run.");

    expect(await reserveCrawlRunDetailJobs(sql, run.id, 4, 5)).toBe(4);
    expect(await reserveCrawlRunDetailJobs(sql, run.id, 4, 5)).toBe(1);
    expect(await reserveCrawlRunDetailJobs(sql, run.id, 1, 5)).toBe(0);
    await sql`
      update crawl_runs
      set status = 'partial', finished_at = now(), failure_reason = 'integration_test'
      where id = ${run.id}
    `;

    await setSourceSearchQueriesPaused(sql, {
      crawlKind: "current",
      pausedUntil: new Date(Date.now() + 60_000),
      reason: "integration_test",
    });
    expect(await getSchedulableSourceSearchQueries(sql, { force: true })).toEqual([]);

    await setSourceSearchQueriesPaused(sql, {
      crawlKind: "current",
      pausedUntil: null,
      reason: null,
    });
    expect(await getSchedulableSourceSearchQueries(sql, { force: true })).toHaveLength(1);
  });

  it("computes listing market context and data-quality coverage from PostgreSQL", async () => {
    const queryId = await insertSourceQuery("current", "context-test");
    const runId = await insertRun(queryId, "current", "2026-08-03T10:00:00Z");
    const listingId = await insertObservation(runId, queryId, "current", "context-1", "active", "2026-08-03T09:00:00Z", 20_000);
    await insertObservation(runId, queryId, "current", "context-2", "active", "2026-08-03T09:01:00Z", 18_000);
    await insertObservation(runId, queryId, "current", "context-3", "active", "2026-08-03T09:02:00Z", 22_000);
    await sql`
      update listing_snapshots
      set normalized_data = jsonb_build_object('detailParserVersion', 'integration-test')
      where id = (select latest_snapshot_id from listings where id = ${listingId})
    `;

    const detail = await getPublicListingDetail(sql, listingId);
    expect(detail?.marketContext).toMatchObject({
      priceBasis: "asking",
      sampleSize: 2,
      medianPriceEur: 20_000,
      pricePercentile: null,
      observedDays: 1,
      recordedPriceChangeCount: 0,
    });

    const diagnostics = await getAdminCrawlerDiagnostics(sql);
    expect(diagnostics.dataQuality).toMatchObject({
      totalListings: 3,
      detailEnrichedListings: 1,
      rawRecordsLast30Days: 3,
      failedRawRecordsLast30Days: 0,
    });
    expect(diagnostics.dataQuality.parserVersions).toContainEqual({
      parserVersion: "integration-test",
      recordCount: 3,
      failedCount: 0,
      latestCapturedAt: "2026-08-03 09:02:00+00",
    });
    expect(diagnostics.dataQuality.fieldCoverage.find((field) => field.field === "Fuel type"))
      .toMatchObject({ presentCount: 3, percentage: 100 });
  });

  it("completes idempotently and reconciles missing current listings across complete runs", async () => {
    const queryId = await insertSourceQuery("current", "lifecycle-test");
    const priorRunId = await insertRun(queryId, "current", "2026-08-01T10:00:00Z");
    const listingId = await insertObservation(
      priorRunId,
      queryId,
      "current",
      "missing-1",
      "active",
      "2026-08-01T09:00:00Z",
      20_000,
    );

    const staleRunId = await insertRunningRun(queryId, "2026-08-08T10:00:00Z", 1, 0);
    await insertSuccessfulPage(staleRunId, queryId, "2026-08-08T10:01:00Z");
    const staleResult = await completeCrawlRun(sql, {
      crawlRunId: staleRunId,
      cause: { kind: "source_exhausted" },
    });
    expect(staleResult).toMatchObject({
      status: "completed",
      changed: true,
      listingAvailabilityReconciled: 1,
    });
    expect(await listingAvailability(listingId)).toBe("stale");

    const removedRunId = await insertRunningRun(queryId, "2026-08-15T10:00:00Z", 1, 0);
    await insertSuccessfulPage(removedRunId, queryId, "2026-08-15T10:01:00Z");
    const removedResult = await completeCrawlRun(sql, {
      crawlRunId: removedRunId,
      cause: { kind: "source_exhausted" },
    });
    expect(removedResult).toMatchObject({
      status: "completed",
      changed: true,
      listingAvailabilityReconciled: 1,
    });
    expect(await listingAvailability(listingId)).toBe("removed");

    expect(
      await completeCrawlRun(sql, {
        crawlRunId: removedRunId,
        cause: { kind: "source_failure", reason: "late_retry" },
      }),
    ).toMatchObject({ status: "completed", changed: false, listingAvailabilityReconciled: 0 });
  });

  it("keeps legacy private detail keys outside the Product API response", async () => {
    const queryId = await insertSourceQuery("current", "privacy-test");
    const runId = await insertRun(queryId, "current", "2026-08-03T10:00:00Z");
    const listingId = await insertObservation(
      runId,
      queryId,
      "current",
      "privacy-1",
      "active",
      "2026-08-03T09:00:00Z",
      20_000,
    );
    await sql`
      update listing_snapshots
      set normalized_data = jsonb_build_object(
        'registrationNumber', 'ABC-123',
        'vin', 'PRIVATE-VIN',
        'additionalSourceFields', jsonb_build_array(
          jsonb_build_object('label', 'Unreviewed', 'value', 'private')
        )
      )
      where listing_id = ${listingId}
    `;
    await sql`
      insert into listing_details (
        listing_id,
        source_parser_version,
        normalization_schema_version,
        source_raw_listing_record_id,
        source_fetch_id,
        fetched_at,
        vin,
        normalized_data
      )
      select
        ${listingId},
        'nettiauto-detail-v4',
        'nettiauto-detail-v4',
        raw_record.id,
        raw_record.source_fetch_id,
        now(),
        'PRIVATE-V4-VIN',
        jsonb_build_object(
          'detailParserVersion', 'nettiauto-detail-v4',
          'registrationNumber', 'ABC-123',
          'vin', 'PRIVATE-V4-VIN'
        )
      from raw_listing_records raw_record
      where raw_record.source_listing_id = 'privacy-1'
      order by raw_record.captured_at desc
      limit 1
    `;

    const detail = await getPublicListingDetail(sql, listingId);
    expect(detail?.vehicleDetails).toMatchObject({ registrationNumber: "ABC-123" });
    expect(detail?.vehicleDetails).not.toHaveProperty("vin");
    expect(detail?.vehicleDetails).not.toHaveProperty("additionalSourceFields");
    expect(publicListingDetailResponseSchema.safeParse(detail).success).toBe(true);
  });

  async function insertSourceQuery(crawlKind: "current" | "sold", searchHash: string) {
    const [row] = await sql<{ id: string }[]>`
      insert into source_search_queries (
        source, vehicle_category, crawl_kind, entry_path, source_search_hash,
        query_params, enabled, priority, target_cadence_interval
      ) values (
        'nettiauto', 'passenger_car', ${crawlKind}, '/test', ${searchHash},
        '{}'::jsonb, true, 10, interval '1 day'
      ) returning id
    `;
    if (!row) throw new Error("Failed to create test Source Search Query.");
    return row.id;
  }

  async function insertRun(searchQueryId: string, crawlKind: "current" | "sold", finishedAt: string) {
    const [row] = await sql<{ id: string }[]>`
      insert into crawl_runs (
        source, search_query_id, crawl_kind, vehicle_category, status,
        started_at, finished_at, expected_page_count, fetched_page_count,
        source_total_ads, is_complete
      ) values (
        'nettiauto', ${searchQueryId}, ${crawlKind}, 'passenger_car', 'completed',
        ${finishedAt}::timestamptz - interval '5 minutes', ${finishedAt}, 1, 1, 1, true
      ) returning id
    `;
    if (!row) throw new Error("Failed to create test Crawl Run.");
    return row.id;
  }

  async function insertRunningRun(
    searchQueryId: string,
    startedAt: string,
    expectedPageCount: number,
    sourceTotalAds: number,
  ) {
    const [row] = await sql<{ id: string }[]>`
      insert into crawl_runs (
        source, search_query_id, crawl_kind, vehicle_category, status,
        started_at, expected_page_count, source_total_ads
      ) values (
        'nettiauto', ${searchQueryId}, 'current', 'passenger_car', 'running',
        ${startedAt}, ${expectedPageCount}, ${sourceTotalAds}
      ) returning id
    `;
    if (!row) throw new Error("Failed to create running test Crawl Run.");
    return row.id;
  }

  async function insertSuccessfulPage(crawlRunId: string, searchQueryId: string, fetchedAt: string) {
    await sql`
      insert into source_fetches (
        crawl_run_id, search_query_id, source, fetch_kind, page_number,
        source_url, request_headers, response_status, response_body_shape, fetched_at
      ) values (
        ${crawlRunId}, ${searchQueryId}, 'nettiauto', 'search_result_page', 1,
        'https://example.invalid/test', '{}'::jsonb, 200, 'ajax_json', ${fetchedAt}
      )
    `;
  }

  async function listingAvailability(listingId: string) {
    const [row] = await sql<{ availability: string }[]>`
      select current_availability as availability
      from listings
      where id = ${listingId}
    `;
    return row?.availability ?? null;
  }

  async function insertObservation(
    crawlRunId: string,
    searchQueryId: string,
    crawlKind: "current" | "sold",
    sourceListingId: string,
    availability: "active" | "sold",
    observedAt: string,
    priceEur: number,
  ) {
    const [pageRow] = await sql<{ pageNumber: number }[]>`
      select (coalesce(max(page_number), 0) + 1)::int as "pageNumber"
      from source_fetches
      where crawl_run_id = ${crawlRunId}
    `;
    const pageNumber = pageRow?.pageNumber ?? 1;
    const [fetchRow] = await sql<{ id: string }[]>`
      insert into source_fetches (
        crawl_run_id, search_query_id, source, fetch_kind, page_number,
        source_url, request_headers, response_status, response_body_shape, fetched_at
      ) values (
        ${crawlRunId}, ${searchQueryId}, 'nettiauto', 'search_result_page', ${pageNumber},
        'https://example.invalid/test', '{}'::jsonb, 200, 'ajax_json', ${observedAt}
      ) returning id
    `;
    if (!fetchRow) throw new Error("Failed to create test Source Fetch.");

    const [rawRow] = await sql<{ id: string }[]>`
      insert into raw_listing_records (
        source, source_listing_id, crawl_run_id, source_fetch_id, record_kind,
        source_payload, source_payload_sha256, parser_version, parser_status, captured_at
      ) values (
        'nettiauto', ${sourceListingId}, ${crawlRunId}, ${fetchRow.id}, 'search_result_card',
        '{}'::jsonb, ${`${crawlRunId}-${sourceListingId}`}, 'integration-test', 'parsed', ${observedAt}
      ) returning id
    `;
    if (!rawRow) throw new Error("Failed to create test Raw Listing Record.");

    const [listingRow] = await sql<{ id: string }[]>`
      insert into listings (
        source, source_listing_id, vehicle_category, current_availability,
        availability_last_confirmed_at, first_seen_at, last_seen_at, last_raw_listing_record_id
      ) values (
        'nettiauto', ${sourceListingId}, 'passenger_car', ${availability},
        ${observedAt}, ${observedAt}, ${observedAt}, ${rawRow.id}
      )
      on conflict (source, source_listing_id) do update set
        last_seen_at = excluded.last_seen_at,
        last_raw_listing_record_id = excluded.last_raw_listing_record_id
      returning id
    `;
    if (!listingRow) throw new Error("Failed to create test Listing.");

    const [snapshotRow] = await sql<{ id: string }[]>`
      insert into listing_snapshots (
        listing_id, raw_listing_record_id, parser_version, observed_at, availability,
        asking_price_eur, observed_sold_price_eur, mileage_km, year_model,
        make_source_label, model_source_label, fuel_type_source_label,
        transmission_source_label, normalized_data, change_hash
      ) values (
        ${listingRow.id}, ${rawRow.id}, 'integration-test', ${observedAt}, ${availability},
        ${availability === "active" ? priceEur : null},
        ${availability === "sold" ? priceEur : null},
        100000, 2020, 'Toyota', 'Corolla', 'Hybrid', 'Automatic',
        '{}'::jsonb, ${`${crawlRunId}-${sourceListingId}`}
      ) returning id
    `;
    if (!snapshotRow) throw new Error("Failed to create test Listing Snapshot.");
    await sql`update listings set latest_snapshot_id = ${snapshotRow.id} where id = ${listingRow.id}`;
    await sql`
      insert into listing_sightings (
        listing_id, crawl_run_id, search_query_id, source_fetch_id, raw_listing_record_id,
        crawl_kind, seen_at, page_number
      ) values (
        ${listingRow.id}, ${crawlRunId}, ${searchQueryId}, ${fetchRow.id}, ${rawRow.id},
        ${crawlKind}, ${observedAt}, ${pageNumber}
      )
    `;
    return listingRow.id;
  }
});
