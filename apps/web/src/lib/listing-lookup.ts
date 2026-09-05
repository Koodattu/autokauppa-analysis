export function sourceListingId(value: string) {
  const trimmed = value.trim();
  if (/^\d{1,15}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || !["nettiauto.com", "www.nettiauto.com"].includes(url.hostname) || url.port || url.username || url.password) return null;
    const id = url.pathname.split("/").filter(Boolean).at(-1);
    return id && /^\d{1,15}$/.test(id) ? id : null;
  } catch { return null; }
}
