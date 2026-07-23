import { describe, expect, it, vi } from "vitest";

import { RegulatoryRegistryController } from "../../src/modules/regulatory-registry/regulatory-registry.controller";

describe("RegulatoryRegistryController", () => {
  it("projects masked driver registration credentials without auto-verifying them", () => {
    const service = {
      getDriverPublicRegistrationCredential: vi.fn(() => ({
        driverId: "drv-demo-001",
        registrationNo: "REG-0001",
        registrationArea: null,
        effectiveFrom: null,
        effectiveUntil: "2027-12-31",
        status: "unverified",
        maskedDisplay: "RE***01",
        verifiedByActorId: null,
        verifiedAt: null,
        sourceSubmissionId: "sup-sub-demo-001",
        version: 1,
        updatedAt: "2026-07-20T00:00:00.000Z",
      })),
    };
    const controller = new RegulatoryRegistryController(service as never);

    const response = controller.getDriverPublicRegistrationCredential(
      "drv-demo-001",
      "req-driver-credential",
    );

    expect(service.getDriverPublicRegistrationCredential).toHaveBeenCalledWith(
      "drv-demo-001",
    );
    expect(response.data).toMatchObject({
      driverId: "drv-demo-001",
      registrationNo: "RE***01",
      registrationArea: null,
      effectiveUntil: "2027-12-31",
      status: "unverified",
      maskedDisplay: "RE***01",
      verifiedByActorId: null,
      verifiedAt: null,
    });
    expect(response.data.registrationNo).not.toBe("REG-0001");
  });

  it("returns the platform-reserved multi_taxi_direct runtime profile", () => {
    const controller = new RegulatoryRegistryController({} as never);

    const response = controller.getPassengerRuntimeProfile(
      "multi_taxi_direct",
      "req-runtime-profile",
    );

    expect(response.data).toMatchObject({
      code: "multi_taxi_direct",
      allowedServiceProducts: ["taxi_reservation"],
      acquisitionMode: "platform_reserved",
      timingModes: ["on_demand", "scheduled"],
      passengerSurface: "direct_ride",
      driverSurface: "multi_taxi_driver",
      opsSurface: "multi_taxi_ops",
    });
  });
});
