const MAX_PUBLIC_LISTING_IMAGES = 60;
const NETTIAUTO_IMAGE_HOST = "images.nettiauto.com";
const NETTIAUTO_IMAGE_BASE_URL = `https://${NETTIAUTO_IMAGE_HOST}`;

export const NETTIAUTO_IMAGE_VARIANT = {
  largeJpeg: 1,
  largeWebp: 2,
  thumbnailWebp: 4,
  thumbnailJpeg: 8,
} as const;

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

export interface NettiautoImageAsset {
  assetPath: string;
  variantMask: number;
}

export interface StoredCompactListingImageRow extends NettiautoImageAsset {
  role: string | null;
  position: number | null;
  cohortId: string;
  capturedAt: string;
  lastSeenAt: string;
}

export interface StoredListingHeroImage {
  objectKey: string;
  width: number;
  height: number;
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
  const asset = parseNettiautoImageAsset(value);
  return asset ? `${NETTIAUTO_IMAGE_HOST}${asset.assetPath}` : null;
}

export function parseNettiautoImageAsset(value: string): NettiautoImageAsset | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== NETTIAUTO_IMAGE_HOST ||
      url.port ||
      url.search ||
      url.hash ||
      !url.pathname.startsWith("/live/")
    ) {
      return null;
    }

    const variants: Array<[RegExp, number]> = [
      [/-large\.jpe?g$/i, NETTIAUTO_IMAGE_VARIANT.largeJpeg],
      [/-large\.webp$/i, NETTIAUTO_IMAGE_VARIANT.largeWebp],
      [/-289x217\.webp$/i, NETTIAUTO_IMAGE_VARIANT.thumbnailWebp],
      [/-289x217\.jpe?g$/i, NETTIAUTO_IMAGE_VARIANT.thumbnailJpeg],
    ];
    const variant = variants.find(([pattern]) => pattern.test(url.pathname));
    if (!variant) {
      return null;
    }

    return {
      assetPath: url.pathname.replace(variant[0], ""),
      variantMask: variant[1],
    };
  } catch {
    return null;
  }
}

export function nettiautoImageUrls(assetPath: string, variantMask: number) {
  if (!assetPath.startsWith("/live/") || /[?#]/.test(assetPath)) {
    return [];
  }

  const variants: Array<[number, string]> = [
    [NETTIAUTO_IMAGE_VARIANT.largeJpeg, "-large.jpg"],
    [NETTIAUTO_IMAGE_VARIANT.largeWebp, "-large.webp"],
    [NETTIAUTO_IMAGE_VARIANT.thumbnailWebp, "-289x217.webp"],
    [NETTIAUTO_IMAGE_VARIANT.thumbnailJpeg, "-289x217.jpg"],
  ];
  return variants.flatMap(([flag, suffix]) =>
    (variantMask & flag) === flag ? [`${NETTIAUTO_IMAGE_BASE_URL}${assetPath}${suffix}`] : [],
  );
}

export function selectCompactPublicListingImages(
  rows: StoredCompactListingImageRow[],
  hero?: StoredListingHeroImage | null,
): PublicListingImage[] {
  if (rows.length === 0) {
    return hero ? [archivedHeroImage(hero)] : [];
  }

  const newestCohortId = [...rows].sort((left, right) =>
    timestamp(right.capturedAt) - timestamp(left.capturedAt) ||
    timestamp(right.lastSeenAt) - timestamp(left.lastSeenAt),
  )[0]?.cohortId;
  const images = rows
    .filter((row) => row.cohortId === newestCohortId)
    .sort((left, right) =>
      (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER) ||
      left.assetPath.localeCompare(right.assetPath),
    )
    .slice(0, MAX_PUBLIC_LISTING_IMAGES)
    .flatMap((row) => {
      const [imageUrl, ...fallbackImageUrls] = nettiautoImageUrls(row.assetPath, row.variantMask);
      return imageUrl
        ? [{
            imageUrl,
            fallbackImageUrls,
            role: row.role,
            position: row.position,
            width: null,
            height: null,
          }]
        : [];
    });

  return preferArchivedHero(images, hero);
}

export function preferArchivedHero(
  images: PublicListingImage[],
  hero?: StoredListingHeroImage | null,
) {
  if (!hero) {
    return images;
  }
  const archivedHero = archivedHeroImage(hero);
  const [first, ...rest] = images;
  return first
    ? [{
        ...first,
        imageUrl: archivedHero.imageUrl,
        fallbackImageUrls: [first.imageUrl, ...first.fallbackImageUrls],
        width: archivedHero.width,
        height: archivedHero.height,
      }, ...rest]
    : [archivedHero];
}

function archivedHeroImage(hero: StoredListingHeroImage): PublicListingImage {
  return {
    imageUrl: `/media/heroes/${hero.objectKey}`,
    fallbackImageUrls: [],
    role: "hero",
    position: 1,
    width: hero.width,
    height: hero.height,
  };
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
