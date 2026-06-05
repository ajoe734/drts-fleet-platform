import { describe, expect, it, vi } from "vitest";

import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { VehicleEligibilityController } from "../../src/modules/vehicle-eligibility/vehicle-eligibility.controller";

function driverIdentity(driverId: string): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "driver_user",
    actorId: driverId,
    realm: "driver",
    tenantId: null,
    roleFamilies: ["driver"],
    roles: ["driver"],
    scopes: [],
    requestId: null,
  };
}

describe("VehicleEligibilityController", () => {
  it("wraps eligible-supply lookups in the standard success envelope", () => {
    const vehicleEligibilityService = {
      listEligibleSupply: vi.fn(() => [
        {
          vehicleId: "veh-demo-001",
          driverId: "drv-demo-001",
          serviceProduct: "enterprise_dispatch",
        },
      ]),
    };
    const controller = new VehicleEligibilityController(
      vehicleEligibilityService as never,
    );

    const response = controller.listEligibleSupply(
      "enterprise_dispatch",
      "req-elig-supply-001",
    );

    expect(vehicleEligibilityService.listEligibleSupply).toHaveBeenCalledWith(
      "enterprise_dispatch",
    );
    expect(response).toEqual({
      data: {
        items: [
          {
            vehicleId: "veh-demo-001",
            driverId: "drv-demo-001",
            serviceProduct: "enterprise_dispatch",
          },
        ],
      },
      meta: {
        requestId: "req-elig-supply-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("scopes eligible-products lookups to the bootstrap driver identity", () => {
    const vehicleEligibilityService = {
      listDriverEligibleProducts: vi.fn(() => [
        { serviceProduct: "enterprise_dispatch", eligibleVehicleIds: [] },
      ]),
    };
    const controller = new VehicleEligibilityController(
      vehicleEligibilityService as never,
    );

    controller.listDriverEligibleProducts(
      driverIdentity("drv-demo-001"),
      "drv-spoofed-002",
      "req-driver-products-001",
    );

    expect(
      vehicleEligibilityService.listDriverEligibleProducts,
    ).toHaveBeenCalledWith("drv-demo-001");
  });
});
