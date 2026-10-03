import { createSqlClient } from "../../packages/db/src/index";

// Synthetic data only. Refuse other targets and existing data; never clean a database.
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Set TEST_DATABASE_URL to the disposable preview database.");
const target = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(target.hostname) || target.pathname !== "/nettiauto_preview_test") {
  throw new Error("Use the dedicated localhost nettiauto_preview_test database.");
}
const sql = createSqlClient(databaseUrl, 1);
try {
  await sql.begin(async (tx) => {
    const [count] = await tx`select count(*)::int as count from listings`;
    if (count?.count !== 0) throw new Error("Preview database must be empty.");
    const vehicles = [
      ["Toyota", "Corolla", "Hybrid", "Automatic", "Hatchback"],
      ["Honda", "Civic", "Petrol", "Manual", "Hatchback"],
      ["Volvo", "V60", "Diesel", "Automatic", "Estate"],
      ["Tesla", "Model 3", "Electric", "Automatic", "Sedan"],
    ];
    for (const kind of ["current", "sold"] as const) {
      const availability = kind === "current" ? "active" : "sold";
      const [query] = await tx`insert into source_search_queries
        (source, vehicle_category, crawl_kind, entry_path, source_search_hash, enabled)
        values ('nettiauto', 'passenger_car', ${kind}, '/synthetic-preview', ${`goal-preview-${kind}`}, false) returning id`;
      const dates = kind === "current" ? ["2026-09-01T10:00:00Z", "2026-10-02T10:00:00Z"] : ["2026-10-02T11:00:00Z"];
      for (const [period, date] of dates.entries()) {
        const [run] = await tx`insert into crawl_runs
          (source,search_query_id,crawl_kind,vehicle_category,status,started_at,finished_at,is_complete,expected_page_count,fetched_page_count)
          values ('nettiauto',${query!.id},${kind},'passenger_car','completed',${date},${date},true,1,1) returning id`;
        const [fetch] = await tx`insert into source_fetches
          (source,crawl_run_id,search_query_id,fetch_kind,page_number,source_url,response_status,response_body_shape,fetched_at)
          values ('nettiauto',${run!.id},${query!.id},'search_result_page',1,'https://example.invalid/preview',200,'ajax_json',${date}) returning id`;
        const start = kind === "current" ? 0 : 48;
        const end = kind === "current" ? 48 : 60;
        for (let index = start; index < end; index++) {
          const [make, model, fuel, transmission, body] = vehicles[index % vehicles.length]!;
          const sourceId = String(9000000 + index);
          const listingId = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
          const price = 11000 + (index % 16) * 1600 - period * 1000;
          const [raw] = await tx`insert into raw_listing_records
            (source,source_listing_id,crawl_run_id,source_fetch_id,record_kind,source_payload,source_payload_sha256,parser_version,parser_status,captured_at)
            values ('nettiauto',${sourceId},${run!.id},${fetch!.id},'search_result_card','{}',sha256(convert_to(${`${sourceId}-${date}`},'UTF8')),'synthetic-preview','parsed',${date}) returning id`;
          await tx`insert into listings
            (id,source,source_listing_id,vehicle_category,current_availability,first_seen_at,last_seen_at,availability_last_confirmed_at,last_raw_listing_record_id)
            values (${listingId},'nettiauto',${sourceId},'passenger_car',${availability},${date},${date},${date},${raw!.id})
            on conflict(id) do update set last_seen_at=excluded.last_seen_at,last_raw_listing_record_id=excluded.last_raw_listing_record_id`;
          const [snapshot] = await tx`insert into listing_snapshots
            (listing_id,raw_listing_record_id,parser_version,observed_at,availability,asking_price_eur,observed_sold_price_eur,mileage_km,year_model,
             make_source_label,model_source_label,fuel_type_source_label,transmission_source_label,body_type_source_label,seller_source_label,seller_type_source_label,normalized_data,change_hash)
            values (${listingId},${raw!.id},'synthetic-preview',${date},${availability},${kind === "current" ? price : null},${kind === "sold" ? price : null},
              ${40000 + (index % 12) * 15000},${2015 + index % 10},${make!},${model!},${fuel!},${transmission!},${body!},'Example Motors (synthetic)','Dealer','{}',${`${sourceId}-${date}`}) returning id`;
          await tx`update listings set latest_snapshot_id=${snapshot!.id} where id=${listingId}`;
          await tx`insert into listing_sightings
            (listing_id,crawl_run_id,search_query_id,source_fetch_id,raw_listing_record_id,crawl_kind,seen_at,page_number)
            values (${listingId},${run!.id},${query!.id},${fetch!.id},${raw!.id},${kind},${date},1)`;
        }
      }
    }
  });
  console.log("Seeded 60 synthetic listings (48 current, 12 sold), 108 snapshots, 3 complete crawl runs; no images or live collection.");
} finally {
  await sql.end({ timeout: 5 });
}
