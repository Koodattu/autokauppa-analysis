import { describe, expect, it } from "vitest";
import { normalizeVehicleCategory } from "./vehicle-categories";

describe("vehicle comparison categories", () => {
  it("groups source aliases and public labels consistently", () => {
    expect(normalizeVehicleCategory(" Sähkö ", "fuel")).toBe("Electric");
    expect(normalizeVehicleCategory("hybridi (bensiini/phev)", "fuel")).toBe("Plug-in hybrid (petrol)");
    expect(normalizeVehicleCategory("Plug-in hybrid (petrol)", "fuel")).toBe("Plug-in hybrid (petrol)");
    expect(normalizeVehicleCategory("Manuaali", "transmission")).toBe("Manual");
  });

  it("keeps malformed and missing attributes unknown", () => {
    expect(normalizeVehicleCategory("2,0 l", "fuel")).toBeNull();
    expect(normalizeVehicleCategory("Ei saatavilla", "transmission")).toBeNull();
    expect(normalizeVehicleCategory(null, "fuel")).toBeNull();
  });
});
