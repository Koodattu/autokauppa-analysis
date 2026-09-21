import { parseWorkerConfig } from "@nettiauto/config";
import { closeSqlClient, createSqlClient } from "@nettiauto/db";
import { nettiautoImageUrls, readGalleryHeroCandidate } from "@nettiauto/domain";
import { createLogger } from "@nettiauto/logging";
import type { Task } from "graphile-worker";
import { z } from "zod";
import { createListingHeroImageArchiver } from "./hero-image-archiver";

type HeroBackfillTaskName =
  | "schedule_nettiauto_hero_backfill"
  | "archive_nettiauto_listing_hero";

const schedulePayloadSchema = z.object({
  afterListingId: z.string().uuid().optional(),
  scheduledCount: z.number().int().nonnegative().optional().default(0),
});

const archivePayloadSchema = z.object({
  listingId: z.string().uuid(),
  sourceRawListingRecordId: z.string().uuid(),
  assetPath: z.string().startsWith("/live/"),
  variantMask: z.number().int().positive(),
});

export function createNettiautoHeroBackfillTask(taskName: HeroBackfillTaskName): Task {
  return async (payload, helpers) => {
    const config = parseWorkerConfig();
    const logger = createLogger({ service: "worker", env: config.APP_ENV });
    if (!config.HERO_IMAGE_ARCHIVE_ENABLED) {
      logger.info({ task: taskName }, "Nettiauto hero image backfill is disabled");
      return;
    }

    const sql = createSqlClient(config.DATABASE_URL, 1);
    try {
      if (taskName === "archive_nettiauto_listing_hero") {
        const command = archivePayloadSchema.parse(payload);
        const [sourceImageUrl, ...fallbackImageUrls] = nettiautoImageUrls(command.assetPath, command.variantMask);
        if (!sourceImageUrl) {
          return;
        }
        await createListingHeroImageArchiver({
          sql,
          enabled: true,
          storagePath: config.HERO_IMAGE_STORAGE_PATH,
          maxSourceBytes: config.HERO_IMAGE_MAX_SOURCE_BYTES,
        }).archive({
          listingId: command.listingId,
          sourceRawListingRecordId: command.sourceRawListingRecordId,
          sourceImageUrl,
          fallbackImageUrls,
        });
        return;
      }

      const command = schedulePayloadSchema.parse(payload ?? {});
      const listingsWithoutHeroes = await sql<{ listingId: string }[]>`
        select listing.id as "listingId" from listings listing
        where listing.source = 'nettiauto'
          and listing.id > coalesce(${command.afterListingId ?? null}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
          and not exists (select 1 from listing_hero_images hero where hero.listing_id = listing.id)
          and (exists (select 1 from listing_gallery_bundles gallery where gallery.listing_id = listing.id)
            or exists (select 1 from listing_image_assets asset where asset.listing_id = listing.id))
        order by listing.id limit ${config.DETAIL_BACKFILL_BATCH_SIZE}
      `;
      const candidates = [];
      for (const listing of listingsWithoutHeroes) {
        const candidate = await readGalleryHeroCandidate(sql, listing.listingId);
        if (candidate) candidates.push(candidate);
      }

      for (const [index, candidate] of candidates.entries()) {
        await helpers.addJob(
          "archive_nettiauto_listing_hero",
          candidate,
          {
            queueName: "nettiauto-hero-images",
            maxAttempts: 3,
            jobKey: `nettiauto:hero:${candidate.listingId}`,
            jobKeyMode: "preserve_run_at",
            runAt: new Date(
              Date.now() + (command.scheduledCount + index) * config.CRAWLER_DELAY_MS,
            ),
          },
        );
      }

      const lastCandidate = candidates.at(-1);
      if (candidates.length === config.DETAIL_BACKFILL_BATCH_SIZE && lastCandidate) {
        await helpers.addJob(
          "schedule_nettiauto_hero_backfill",
          {
            afterListingId: lastCandidate.listingId,
            scheduledCount: command.scheduledCount + candidates.length,
          },
          {
            queueName: "nettiauto-hero-backfill-control",
            maxAttempts: 5,
            jobKey: `nettiauto:hero-schedule:${lastCandidate.listingId}`,
          },
        );
        return;
      }

      logger.info(
        { scheduledCount: command.scheduledCount + candidates.length },
        "Nettiauto hero image backfill queued",
      );
    } finally {
      await closeSqlClient(sql);
    }
  };
}
