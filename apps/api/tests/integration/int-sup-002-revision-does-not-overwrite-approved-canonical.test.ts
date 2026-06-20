import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";

describe("INT-SUP-002 revision does not overwrite approved canonical", () => {
  it("reuses existing canonical ids instead of provisioning replacements", async () => {
    const registry = new RegulatoryRegistryService(
      {
        publishDriverLocationUpdated: () => undefined,
        publishSupplyLifecycleUpdated: () => undefined,
      } as never,
      new AuditNotificationService(),
      new DriverProfileService(new AuditNotificationService()),
      undefined,
    );

    const canonical = await registry.provisionFromSubmission(null, {
      submission: {
        submissionId: "sup-sub-approved-001",
        fleetPartnerId: "fleet-demo-001",
        submissionType: "vehicle_onboarding",
        status: "in_review",
        revisionNo: 4,
        subjectDriverId: null,
        subjectVehicleId: null,
        submittedBy: "fleet-user-2",
        submittedAt: "2026-06-20T00:10:00.000Z",
        reviewStartedBy: "platform-admin-demo-001",
        reviewStartedAt: "2026-06-20T00:15:00.000Z",
        reviewedBy: null,
        reviewedAt: null,
        reviewReasonCode: null,
        reviewComment: null,
        canonicalDriverId: "drv-existing-001",
        canonicalVehicleId: "veh-existing-001",
        canonicalContractId: "contract-existing-001",
        canonicalPolicyId: "policy-existing-001",
        createdAt: "2026-06-20T00:10:00.000Z",
        updatedAt: "2026-06-20T00:15:00.000Z",
      },
      driverDraft: {
        submissionId: "sup-sub-approved-001",
        name: "Changed Driver Name",
        mobile: "0912000009",
        professionalDriverLicenseNo: "PDL-CHANGED",
        professionalDriverLicenseExpiry: "2027-12-31",
        taxiDriverRegistrationNo: "TAXI-CHANGED",
        taxiDriverRegistrationArea: "taipei",
        taxiDriverRegistrationExpiry: "2027-12-31",
        supportedServiceProductCodes: ["standard_taxi"],
        preferredVehicleSubmissionId: null,
      },
      vehicleDraft: {
        submissionId: "sup-sub-approved-001",
        plateNo: "NEW-9999",
        licenseType: "taxi",
        brand: "Toyota",
        model: "Altis",
        modelYear: 2025,
        seatCount: 4,
        luggageCapacity: 2,
        businessArea: "taipei",
        supportedServiceProductCodes: ["standard_taxi"],
        airportTransferEligible: false,
        fixedFareAllowed: true,
        currentDriverSubmissionId: null,
      },
      documents: [],
      approvedAt: "2026-06-20T01:00:00.000Z",
      reviewerId: "platform-reviewer-003",
    });

    expect(canonical).toMatchObject({
      canonicalDriverId: "drv-existing-001",
      canonicalVehicleId: "veh-existing-001",
      canonicalContractId: "contract-existing-001",
      canonicalPolicyId: "policy-existing-001",
    });
    expect(canonical.vehicleAffiliation).toBeNull();
    expect(
      registry.listDrivers().some((driver) => driver.driverId === "drv-existing-001"),
    ).toBe(false);
    expect(
      registry.listVehicles().some((vehicle) => vehicle.vehicleId === "veh-existing-001"),
    ).toBe(false);
  });
});
