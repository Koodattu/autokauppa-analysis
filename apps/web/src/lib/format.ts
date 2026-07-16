export const APP_LOCALE = "en-FI";
export const PUBLIC_TIME_ZONE = "Europe/Helsinki";

const numberFormatter = new Intl.NumberFormat(APP_LOCALE);
const compactNumberFormatter = new Intl.NumberFormat(APP_LOCALE, {
  notation: "compact",
  maximumFractionDigits: 1,
});
const dateFormatter = new Intl.DateTimeFormat(APP_LOCALE, {
  dateStyle: "medium",
  timeZone: PUBLIC_TIME_ZONE,
});
const dateTimeFormatter = new Intl.DateTimeFormat(APP_LOCALE, {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: PUBLIC_TIME_ZONE,
});
const monthYearFormatter = new Intl.DateTimeFormat(APP_LOCALE, {
  month: "short",
  year: "2-digit",
  timeZone: PUBLIC_TIME_ZONE,
});
const monthDayFormatter = new Intl.DateTimeFormat(APP_LOCALE, {
  month: "short",
  day: "numeric",
  timeZone: PUBLIC_TIME_ZONE,
});

export function formatNumber(value: number) {
  return numberFormatter.format(value);
}

export function formatCompactNumber(value: number) {
  return value >= 1_000 ? compactNumberFormatter.format(value) : numberFormatter.format(value);
}

export function formatCurrency(value: number | null) {
  return value === null ? "–" : `${formatNumber(value)} €`;
}

export function formatKm(value: number | null) {
  return value === null ? "–" : `${formatNumber(value)} km`;
}

export function formatDate(value: string | number | null) {
  const date = parseDate(value);
  if (!date) {
    return "–";
  }
  return dateFormatter.format(date);
}

export function formatDateTime(value: string | null) {
  const date = parseDate(value);
  if (!date) {
    return "–";
  }
  return dateTimeFormatter.format(date);
}

export function formatDateOnly(value: string | null) {
  return formatDate(value);
}

export function formatMonthYear(value: string | number) {
  const date = parseDate(value);
  return date ? monthYearFormatter.format(date) : String(value);
}

export function formatMonthDay(value: string | number) {
  const date = parseDate(value);
  return date ? monthDayFormatter.format(date) : String(value);
}

export function labelAvailability(value: string) {
  if (value === "active" || value === "current") {
    return "Current";
  }
  if (value === "sold") {
    return "Sold";
  }
  if (value === "all") {
    return "Current + sold";
  }
  if (value === "stale") {
    return "Stale";
  }
  if (value === "removed") {
    return "Removed";
  }
  return "Unknown";
}

function parseDate(value: string | number | null) {
  if (value === null || value === "") {
    return null;
  }
  const normalized = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T12:00:00Z`
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}
