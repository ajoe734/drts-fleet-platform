import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";
import { SupplyReviewService } from "../../src/modules/fleet-partner/supply-review.service";

describe("INT-SUP-001 approve submission provisions registry", () => {
  it("creates canonical driver, vehicle, contract, and policy during approval", async () => {
    const registry = new RegulatoryRegistryService(
      {
        publishDriverLocationUpdated: () => undefined,
        publishSupplyLifecycleUpdated: () => undefined,
      } as never,
      new AuditNotificationService(),
      new DriverProfileService(new AuditNotificationService()),
      undefined,
    );
    const service = new SupplyReviewService(registry);

    const approved = await service.approveSubmission(
      "sup-sub-demo-002",
      {
        expectedRevisionNo: 2,
        reasonCode: "all_documents_valid",
        comment: "Approval completed.",
      },
      "platform-reviewer-003",
    );

    expect(approved.status).toBe("approved");
    expect(approved.canonicalDriverId).toBeTruthy();
    expect(approved.canonicalVehicleId).toBeTruthy();
    expect(approved.canonicalContractId).toBeTruthy();
    expect(approved.canonicalPolicyId).toBeTruthy();

    expect(
      registry
        .listDrivers()
        .some((driver) => driver.driverId === approved.canonicalDriverId),
    ).toBe(true);
    expect(
      registry
        .listVehicles()
        .some((vehicle) => vehicle.vehicleId === approved.canonicalVehicleId),
    ).toBe(true);
    expect(
      registry
        .listContracts()
        .some((contract) => contract.contractId === approved.canonicalContractId),
    ).toBe(true);
    expect(
      registry
        .listPolicies()
        .some((policy) => policy.policyId === approved.canonicalPolicyId),
    ).toBe(true);
  });
});
