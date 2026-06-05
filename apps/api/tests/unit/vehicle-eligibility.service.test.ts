import { describe, expect, it, vi } from "vitest";

import { VehicleEligibilityService } from "../../src/modules/vehicle-eligibility/vehicle-eligibility.service";

function createService() {
  const regulatoryRegistryService = {
    getEligibleCandidates: vi.fn((serviceBucket: string) => {
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
          {
            vehicleId: "veh-demo-002",
            driverId: "drv-demo-001",
            operatingArea: "taichung-port",
            serviceBuckets: ["standard_taxi"],
            etaMinutes: 7,
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
    }),
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
      "third_party_forwarded_order",
    ]);
  });
});
