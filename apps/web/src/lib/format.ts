export function formatNumber(value: number) {
  return new Intl.NumberFormat("fi-FI").format(value);
}

export function formatCurrency(value: number | null) {
  return value === null ? "–" : `${formatNumber(value)} €`;
}

export function formatKm(value: number | null) {
  return value === null ? "–" : `${formatNumber(value)} km`;
}

export function formatDate(value: string | null) {
  if (!value) {
    return "–";
  }

  return new Intl.DateTimeFormat("fi-FI", { dateStyle: "medium" }).format(new Date(value));
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return "–";
  }

  return new Intl.DateTimeFormat("fi-FI", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatDateOnly(value: string | null) {
  return value ? formatDate(`${value}T00:00:00`) : "–";
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
