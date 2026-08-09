import { describe, expect, it } from "vitest";
import { publicVehicleDetailsResponseSchema } from "./product-api";

const allowedVehicleDetails = {
  sourceUpdatedDate: null,
  sourceLocationLabel: null,
  registrationNumber: "ABC-123",
  officeFeeEur: null,
  engineSourceLabel: null,
  fuelTypeSourceLabel: null,
  transmissionSourceLabel: null,
  drivetrainSourceLabel: null,
  firstRegistrationDate: null,
  inspectionDateLabel: null,
  bodyTypeSourceLabel: null,
  vehicleTypeSourceLabel: null,
  colorSourceLabel: null,
  powerKw: null,
  powerHp: null,
  topSpeedKmh: null,
  acceleration0To100S: null,
  seatCount: null,
  doorCount: null,
  steeringSideSourceLabel: null,
  curbWeightKg: null,
  grossWeightKg: null,
  towingWeightBrakedKg: null,
  towingWeightUnbrakedKg: null,
  co2GKm: null,
  energyEfficiencyClassSourceLabel: null,
  fuelConsumptionSourceLabel: null,
  fuelConsumptionCityL100Km: null,
  fuelConsumptionHighwayL100Km: null,
  fuelConsumptionCombinedL100Km: null,
  sellerNotes: null,
  equipmentGroups: [],
};

describe("public vehicle-detail response contract", () => {
  it("accepts the explicit public allowlist", () => {
    expect(publicVehicleDetailsResponseSchema.parse(allowedVehicleDetails)).toEqual(
      allowedVehicleDetails,
    );
  });

  it.each(["vin", "additionalSourceFields", "unreviewedSourceField"])(
    "rejects the non-public %s key",
    (key) => {
      expect(
        publicVehicleDetailsResponseSchema.safeParse({ ...allowedVehicleDetails, [key]: "private" })
          .success,
      ).toBe(false);
    },
  );
});
