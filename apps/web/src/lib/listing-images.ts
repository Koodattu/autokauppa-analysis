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
