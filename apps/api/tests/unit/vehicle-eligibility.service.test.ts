import { describe, expect, it, vi } from "vitest";

import { VehicleEligibilityService } from "../../src/modules/vehicle-eligibility/vehicle-eligibility.service";

function createService() {
  const regulatoryRegistryService = {
    getEligibleCandidates: vi.fn(
      (serviceBucket: string, destination?: unknown) => {
        if (serviceBucket === "business_dispatch") {
          return [
            {
              vehicleId: "veh-demo-001",
              driverId: "drv-demo-001",
              operatingArea: "taichung-port",
              serviceBuckets: ["standard_taxi", "business_dispatch"],
              etaMinutes: 5,
              currentLocation: null,
            },
          ];
        }

        if (destination) {
          return [
            {
              vehicleId: "veh-demo-001",
              driverId: "drv-demo-001",
              operatingArea: "taichung-port",
              serviceBuckets: ["standard_taxi", "business_dispatch"],
              etaMinutes: 11,
              currentLocation: null,
            },
          ];
        }

        return [
          {
            vehicleId: "veh-demo-001",
            driverId: "drv-demo-001",
            operatingArea: "taichung-port",
            serviceBuckets: ["standard_taxi", "business_dispatch"],
            etaMinutes: 4,
            currentLocation: null,
          },
        ];
      },
    ),
    getVehicleDispatchability: vi.fn(() => true),
    getDriverAvailability: vi.fn(() => true),
  };

  return {
    service: new VehicleEligibilityService(regulatoryRegistryService as never),
    regulatoryRegistryService,
  };
}

describe("VehicleEligibilityService", () => {
  it("filters eligible supply by service-product capability matrix", () => {
    const { service } = createService();

    const eligibleSupply = service.listEligibleSupply("enterprise_dispatch");

    expect(eligibleSupply).toHaveLength(1);
    expect(eligibleSupply[0]).toMatchObject({
      vehicleId: "veh-demo-001",
      driverId: "drv-demo-001",
      serviceProduct: "enterprise_dispatch",
      serviceTiming: "reservation",
    });
  });

  it("lists only the products a driver can currently serve", () => {
    const { service } = createService();

    const products = service.listDriverEligibleProducts("drv-demo-001");

    expect(products.map((entry) => entry.serviceProduct)).toEqual([
      "taxi_realtime",
      "enterprise_dispatch",
      "credit_card_airport_transfer",
      "third_party_forwarded_order",
    ]);
  });

  it("passes dispatch destination context through to registry selection", () => {
    const { service, regulatoryRegistryService } = createService();

    const eligibleSupply = service.listEligibleSupply("taxi_realtime", {
      destination: { lat: 25.033, lng: 121.5654 },
    });

    expect(
      regulatoryRegistryService.getEligibleCandidates,
    ).toHaveBeenCalledWith("standard_taxi", {
      lat: 25.033,
      lng: 121.5654,
    });
    expect(eligibleSupply[0]?.etaMinutes).toBe(11);
  });

  it("supports overriding the regulatory service bucket for forwarded matching", () => {
    const { service, regulatoryRegistryService } = createService();

    const eligibleSupply = service.listEligibleSupply(
      "third_party_forwarded_order",
      {
        serviceBucketOverride: "business_dispatch",
      },
    );

    expect(
      regulatoryRegistryService.getEligibleCandidates,
    ).toHaveBeenCalledWith("business_dispatch", null);
    expect(eligibleSupply).toHaveLength(1);
    expect(eligibleSupply[0]).toMatchObject({
      vehicleId: "veh-demo-001",
      serviceProduct: "third_party_forwarded_order",
    });
  });
});
