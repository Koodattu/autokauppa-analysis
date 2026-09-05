// Source labels remain stored verbatim; public comparisons use these categories.
const fuels: Record<string, string> = {
  bensiini: "Petrol", petrol: "Petrol", gasoline: "Petrol", diesel: "Diesel",
  sähkö: "Electric", electric: "Electric", hybridi: "Hybrid", hybrid: "Hybrid",
  "hybridi (bensiini/sähkö)": "Hybrid (petrol/electric)",
  "hybridi (diesel/sähkö)": "Hybrid (diesel/electric)",
  "hybridi (bensiini/phev)": "Plug-in hybrid (petrol)",
  "hybridi (kaasu/sähkö)": "Hybrid (gas/electric)",
  "hybridi (bensiini/kaasu)": "Hybrid (petrol/gas)",
  kaasu: "Gas", gas: "Gas", vety: "Hydrogen", hydrogen: "Hydrogen", "e85/bensiini": "E85/petrol",
};
const transmissions: Record<string, string> = {
  automaatti: "Automatic", automatic: "Automatic", manuaali: "Manual", manual: "Manual",
};

export function normalizeVehicleCategory(value: string | null, kind: "fuel" | "transmission") {
  if (!value) return null;
  const labels = kind === "fuel" ? fuels : transmissions;
  const normalized = value.trim().toLowerCase();
  return labels[normalized] ?? Object.values(labels).find((label) => label.toLowerCase() === normalized) ?? null;
}

export function categorySql(column: string, kind: "fuel" | "transmission") {
  const labels = kind === "fuel" ? fuels : transmissions;
  const entries = Object.entries(labels).map(([label, value]) => `when '${label}' then '${value}'`);
  const canonical = [...new Set(Object.values(labels))].map((value) => `when '${value.toLowerCase()}' then '${value}'`);
  return `(case lower(trim(${column})) ${[...entries, ...canonical].join(" ")} else null end)`;
}
