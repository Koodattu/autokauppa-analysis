# Listing images and persistent fallbacks

The public detail gallery loads recorded Nettiauto image URLs directly in the
visitor's browser. The main view, thumbnail strip, and enlarged viewer use the
same selected URL for a photograph. Next.js optimization and its disk image cache
are disabled; the enlarged viewer is loaded only when opened. Browser caching
still applies. External visitors' bandwidth goes to the source CDN.

The database's existing asset-path/variant-mask representation groups different
recorded resolutions and formats of the same photograph. The gallery tries the
largest recorded variants first, then remaining recorded alternatives. It does
not invent source URLs or store another copy for each display size.

An archived hero is displayed in the gallery only when no allowed remote image
remains available. The API retains its compatible image-metadata shape and hero
reference; the gallery separates that reference from its remote candidates.
Archived hero thumbnails in listing search results remain small direct-served
previews. Source-image 404s cannot always be repaired: if the source and all local
copies are already gone, the application has no image to recover.

## Storage budget and ingestion

New heroes start at a maximum dimension of 480 pixels and WebP quality 60. The
encoder reduces dimensions/quality if necessary to enforce a **20 KiB maximum**.
It never enlarges the source. The same encoder is used by normal ingestion and
cache recovery. Existing heroes are not rewritten or downgraded.

One database row per listing references a content-addressed WebP in the persistent
`hero_images` volume. Identical output bytes share an object key. At the maximum
20 KiB payload budget, 482,000 newly encoded heroes would occupy about 9.2 GiB,
plus filesystem overhead; typical output is smaller. This budget does not apply
retroactively to existing larger heroes.

Search-result ingestion queues missing heroes even when detail enrichment is
disabled or capped. Jobs are deduplicated by listing and use the existing image
queue and retry policy. Existing heroes are skipped. The archiver tries recorded
variants of the selected photograph after a 404/410 and times out a source fetch
after 20 seconds. A listing can remain without a hero if no source variant works.
No bulk remote-image download is started by deployment alone.

## Recovering the old cache before cleanup

`scripts/recover-cached-heroes.ts` is a one-time operator tool, not a scheduled job.
It reads the old web image cache and cached public listing responses through a
read-only mount. It derives Next.js v4 cache keys from recorded URLs and the old
width/quality/format combinations, then verifies image-to-listing provenance
against compact assets or checksummed legacy bundles and the referenced raw row.

The default mode performs a read-only census and encodes a 100-image in-memory
sample. `--apply` writes one small hero for each matched listing missing a hero.
It verifies existing hero file checksums before work, verifies new output files,
and verifies all pre-existing hero database rows remain unchanged. It prints
aggregate progress only; it does not export cached response bodies or image files.
Running again skips recovered heroes. Any missing provenance must be reviewed
before cache removal.

Build the operator bundle with the repository's Bun version, leaving Sharp external:

```powershell
bun build scripts/recover-cached-heroes.ts --target=node --external sharp --outfile backups/service-investigation-20260914/recover-cached-heroes.mjs
```

Run it with Node in an isolated existing worker-image container. Mount the bundle
under `/app/apps/worker/`, the old web cache read-only at `/cache`, and the existing
hero volume at `/data/hero-images` (read-only for the dry run). Pass the database
connection internally without printing credentials. Use a one-connection pool,
the existing deployment maintenance lock, and bounded resource limits. The helper
uses eight-second SQL timeouts and disables parallel query workers.

Only after recovery completes successfully should the web container be replaced.
Its generated cache is disposable at that point; do not delete the hero volume,
PostgreSQL volume, recovery evidence, or other services' Docker resources. A global
Docker prune is unnecessary. Confirm `images.unoptimized=true`,
`images.maximumDiskCacheSize=0`, direct gallery URLs, public hero responses,
service readiness, and disk headroom after deployment.

The accompanying comparable-price query fix avoids materializing all latest
snapshot columns for each listing. The read-only production profiles and
before/after result comparisons are recorded in the
[investigation](service-investigation-20260914.md). No database schema migration
or PostgreSQL memory change is required for this release.
