import { describe, expect, it } from "vitest";

import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { VehicleEligibilityService } from "../../../apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.service";

// C073 正式退場閉環綁定canonical資格: this suite wires the *real*
// RegulatoryRegistryService into the *real* VehicleEligibilityService (no
// mocked regulatoryRegistryService, unlike apps/api/tests/unit/
// vehicle-eligibility.service.test.ts) so that a final-exit fix in the
// registry is proven to actually reach a genuine downstream assignment
// guard, not just the registry's own getVehicleDispatchability/
// getEligibleCandidates methods in isolation.
//
// veh-demo-001 / drv-demo-001 is a real, already-paired seed supply pair
// (RegulatoryRegistryService's built-in VEHICLE_SEED/DRIVER_SEED/
// supplyPairs), not a freshly provisioned, unpaired vehicle -- so its
// disappearance from eligible candidates below is caused by the final-exit
// rule, not by an absent driver pairing.

function setupServices() {
  const opsDispatchEventsService = {
    publishDriverLocationUpdated: () => {},
    publishSupplyLifecycleUpdated: () => {},
  };
  const driverProfileService = {
    findProfileForDriver: () => null,
  };
  const regulatoryRegistryService = new RegulatoryRegistryService(
    opsDispatchEventsService as never,
    null as never,
    driverProfileService as never,
  );
  const vehicleEligibilityService = new VehicleEligibilityService(
    regulatoryRegistryService,
  );
  return { regulatoryRegistryService, vehicleEligibilityService };
}

const STANDARD_TAXI_ORDER = {
  serviceBucket: "standard_taxi" as const,
  businessDispatchSubtype: null,
  serviceProductCode: null,
};

describe("C073 final offboarding exit binds real assignment/candidate guard entry points", () => {
  it("a paired vehicle that completes a debranding-required final exit is refused real dispatch assignment and drops out of eligible supply (debranding 閉環後仍拒絕派送指派)", async () => {
    const { regulatoryRegistryService, vehicleEligibilityService } =
      setupServices();

    // Before: a real production assignment call succeeds for the healthy,
    // already-paired seed vehicle/driver.
    expect(() =>
      vehicleEligibilityService.assertDispatchAssignmentEligible(
        STANDARD_TAXI_ORDER,
        "veh-demo-001",
        "drv-demo-001",
      ),
    ).not.toThrow();
    expect(
      vehicleEligibilityService
        .listEligibleSupply("taxi_realtime")
        .some((candidate) => candidate.vehicleId === "veh-demo-001"),
    ).toBe(true);

    await regulatoryRegistryService.initiateVehicleOffboarding(
      "veh-demo-001",
      {
        reason: "fleet_partner_exit",
        requestedBy: "ops-admin-qa",
        debrandingRequired: true,
        debrandingTicketId: "TCK-DEBRAND-REAL-001",
      },
    );
    await regulatoryRegistryService.completeVehicleDebranding("veh-demo-001", {
      debrandingTicketId: "TCK-DEBRAND-REAL-001",
      completedAt: "2026-02-01T00:00:00.000Z",
    });

    // After: the real assignment guard entry point now refuses the same
    // paired vehicle/driver, and it no longer appears in eligible supply.
    expect(() =>
      vehicleEligibilityService.assertDispatchAssignmentEligible(
        STANDARD_TAXI_ORDER,
        "veh-demo-001",
        "drv-demo-001",
      ),
    ).toThrow(
      expect.objectContaining({ code: "VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT" }),
    );
    expect(
      vehicleEligibilityService
        .listEligibleSupply("taxi_realtime")
        .some((candidate) => candidate.vehicleId === "veh-demo-001"),
    ).toBe(false);
  });

  it("a paired vehicle that completes a no-debranding final exit is also refused real dispatch assignment (免debranding直接結案仍拒絕派送指派)", async () => {
    const { regulatoryRegistryService, vehicleEligibilityService } =
      setupServices();

    expect(() =>
      vehicleEligibilityService.assertDispatchAssignmentEligible(
        STANDARD_TAXI_ORDER,
        "veh-demo-001",
        "drv-demo-001",
      ),
    ).not.toThrow();

    await regulatoryRegistryService.initiateVehicleOffboarding(
      "veh-demo-001",
      {
        reason: "fleet_partner_exit_no_branding",
        requestedBy: "ops-admin-qa",
        debrandingRequired: false,
      },
    );

    expect(() =>
      vehicleEligibilityService.assertDispatchAssignmentEligible(
        STANDARD_TAXI_ORDER,
        "veh-demo-001",
        "drv-demo-001",
      ),
    ).toThrow(
      expect.objectContaining({ code: "VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT" }),
    );
  });

  it("a temporary manual dispatch hold remains reversible and is not treated as a permanent final exit (暫時性manual hold仍可恢復，非永久退場)", () => {
    const { regulatoryRegistryService, vehicleEligibilityService } =
      setupServices();

    // veh-demo-004 is a different, fully-compliant paired seed vehicle
    // (drv-demo-004); never offboarded.
    expect(
      regulatoryRegistryService.getVehicleDispatchability("veh-demo-004"),
    ).toBe(true);

    regulatoryRegistryService.updateVehicleCompliance("veh-demo-004", {
      dispatchableFlag: false,
    });
    expect(
      regulatoryRegistryService.getVehicleDispatchability("veh-demo-004"),
    ).toBe(false);
    expect(
      regulatoryRegistryService
        .listVehicles()
        .find((vehicle) => vehicle.vehicleId === "veh-demo-004")
        ?.supplyLifecycle.offboarding.status,
    ).toBe("none");

    // Recovery is possible because this is a manual hold, not a final exit:
    // nothing about offboarding/debranding was ever touched.
    regulatoryRegistryService.updateVehicleCompliance("veh-demo-004", {
      dispatchableFlag: true,
    });
    expect(
      regulatoryRegistryService.getVehicleDispatchability(
        "veh-demo-004",
        "business_dispatch",
      ),
    ).toBe(true);
    expect(() =>
      vehicleEligibilityService.assertDispatchAssignmentEligible(
        {
          serviceBucket: "business_dispatch",
          businessDispatchSubtype: "enterprise_dispatch",
          serviceProductCode: null,
        },
        "veh-demo-004",
        "drv-demo-004",
      ),
    ).not.toThrow();
  });
});
