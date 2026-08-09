const MAX_PUBLIC_LISTING_IMAGES = 60;
const IMAGE_EXTENSION_PATTERN = /\.(?:jpe?g|png|webp)$/i;
const IMAGE_VARIANT_PATTERN = /-(?:large|\d+x\d+)$/i;

export interface StoredListingImageRow {
  imageUrl: string;
  role: string | null;
  position: number | null;
  width: number | null;
  height: number | null;
  cohortId: string;
  recordKind: string;
  capturedAt: string;
  lastSeenAt: string;
}

export interface PublicListingImage {
  imageUrl: string;
  fallbackImageUrls: string[];
  role: string | null;
  position: number | null;
  width: number | null;
  height: number | null;
}

interface ValidImageRow extends StoredListingImageRow {
  assetKey: string;
}

export function selectPublicListingImages(rows: StoredListingImageRow[]): PublicListingImage[] {
  const validRows = rows
    .map((row) => {
      const assetKey = nettiautoImageAssetKey(row.imageUrl);
      return assetKey ? { ...row, assetKey } : null;
    })
    .filter((row): row is ValidImageRow => row !== null);

  if (validRows.length === 0) {
    return [];
  }

  const cohortRows = new Map<string, ValidImageRow[]>();
  for (const row of validRows) {
    const cohort = cohortRows.get(row.cohortId) ?? [];
    cohort.push(row);
    cohortRows.set(row.cohortId, cohort);
  }

  const newestCohort = [...cohortRows.entries()].sort(([leftId, left], [rightId, right]) => {
    const capturedDifference = newestTimestamp(right, "capturedAt") - newestTimestamp(left, "capturedAt");
    if (capturedDifference !== 0) {
      return capturedDifference;
    }
    const lastSeenDifference = newestTimestamp(right, "lastSeenAt") - newestTimestamp(left, "lastSeenAt");
    return lastSeenDifference !== 0 ? lastSeenDifference : leftId.localeCompare(rightId);
  })[0]?.[1];

  if (!newestCohort) {
    return [];
  }

  const currentAssets = new Map<string, ValidImageRow>();
  for (const row of newestCohort) {
    const existing = currentAssets.get(row.assetKey);
    if (!existing || compareCurrentPosition(row, existing) < 0) {
      currentAssets.set(row.assetKey, row);
    }
  }

  return [...currentAssets.values()]
    .sort(compareCurrentPosition)
    .slice(0, MAX_PUBLIC_LISTING_IMAGES)
    .map((currentRow) => {
      const variants = validRows
        .filter((row) => row.assetKey === currentRow.assetKey)
        .sort(compareImageVariant)
        .filter((row, index, candidates) =>
          candidates.findIndex((candidate) => candidate.imageUrl === row.imageUrl) === index
        );
      const [preferred, ...fallbacks] = variants;
      if (!preferred) {
        return null;
      }

      return {
        imageUrl: preferred.imageUrl,
        fallbackImageUrls: fallbacks.map((row) => row.imageUrl),
        role: currentRow.role,
        position: currentRow.position,
        width: preferred.width,
        height: preferred.height,
      };
    })
    .filter((image): image is PublicListingImage => image !== null);
}

export function nettiautoImageAssetKey(value: string) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "images.nettiauto.com" ||
      url.port ||
      url.search ||
      url.hash ||
      !url.pathname.startsWith("/live/") ||
      !IMAGE_EXTENSION_PATTERN.test(url.pathname)
    ) {
      return null;
    }

    const withoutExtension = url.pathname.replace(IMAGE_EXTENSION_PATTERN, "");
    return `${url.hostname}${withoutExtension.replace(IMAGE_VARIANT_PATTERN, "")}`;
  } catch {
    return null;
  }
}

function newestTimestamp(rows: ValidImageRow[], field: "capturedAt" | "lastSeenAt") {
  return Math.max(...rows.map((row) => timestamp(row[field])));
}

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareCurrentPosition(left: ValidImageRow, right: ValidImageRow) {
  const positionDifference = (left.position ?? Number.MAX_SAFE_INTEGER) -
    (right.position ?? Number.MAX_SAFE_INTEGER);
  return positionDifference !== 0 ? positionDifference : left.assetKey.localeCompare(right.assetKey);
}

function compareImageVariant(left: ValidImageRow, right: ValidImageRow) {
  const rankDifference = imageVariantRank(left) - imageVariantRank(right);
  if (rankDifference !== 0) {
    return rankDifference;
  }

  const capturedDifference = timestamp(right.capturedAt) - timestamp(left.capturedAt);
  return capturedDifference !== 0
    ? capturedDifference
    : left.imageUrl.localeCompare(right.imageUrl);
}

function imageVariantRank(row: ValidImageRow) {
  const pathname = new URL(row.imageUrl).pathname.toLowerCase();
  if (/-large\.jpe?g$/.test(pathname)) {
    return 0;
  }
  if (/-large\.(?:png|webp)$/.test(pathname)) {
    return 1;
  }
  if (row.recordKind === "detail_page") {
    return 2;
  }
  if (/-\d+x\d+\.webp$/.test(pathname)) {
    return 3;
  }
  if (/-\d+x\d+\.jpe?g$/.test(pathname)) {
    return 4;
  }
  return 5;
}
