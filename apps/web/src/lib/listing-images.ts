export const LISTING_IMAGE_REMOTE_PATTERNS = [
  {
    protocol: "https" as const,
    hostname: "images.nettiauto.com",
    port: "",
    pathname: "/live/**",
    search: "",
  },
  {
    protocol: "https" as const,
    hostname: "www.nettiauto.com",
    port: "",
    pathname: "/images/**",
    search: "",
  },
];

export function isAllowedListingImageUrl(value: string) {
  if (/^\/media\/heroes\/[a-z0-9/_-]+\.webp$/i.test(value)) {
    return true;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.port || url.search || url.hash) {
      return false;
    }
    return (
      (url.hostname === "images.nettiauto.com" && url.pathname.startsWith("/live/")) ||
      (url.hostname === "www.nettiauto.com" && url.pathname.startsWith("/images/"))
    );
  } catch {
    return false;
  }
}

export function firstAvailableListingImageUrl(
  image: { imageUrl: string; fallbackImageUrls?: string[] },
  failedUrls: ReadonlySet<string>,
) {
  return [image.imageUrl, ...(image.fallbackImageUrls ?? [])].find(
    (candidate) => isAllowedListingImageUrl(candidate) && !failedUrls.has(candidate),
  ) ?? null;
}

export function availableListingGalleryImages<T extends { imageUrl: string; fallbackImageUrls?: string[] }>(
  images: T[],
  failedUrls: ReadonlySet<string>,
) {
  const remoteImages = images.flatMap((image) => {
    const urls = [image.imageUrl, ...(image.fallbackImageUrls ?? [])]
      .filter((url) => !url.startsWith("/media/heroes/"));
    const [imageUrl, ...fallbackImageUrls] = urls;
    const displayUrl = imageUrl
      ? firstAvailableListingImageUrl({ imageUrl, fallbackImageUrls }, failedUrls)
      : null;
    return displayUrl ? [{ ...image, displayUrl }] : [];
  });
  if (remoteImages.length > 0) {
    return remoteImages;
  }
  for (const image of images) {
    const displayUrl = [image.imageUrl, ...(image.fallbackImageUrls ?? [])].find(
      (url) => url.startsWith("/media/heroes/") && isAllowedListingImageUrl(url) && !failedUrls.has(url),
    );
    if (displayUrl) return [{ ...image, displayUrl }];
  }
  return [];
}
