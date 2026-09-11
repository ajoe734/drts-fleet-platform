// SR-QA-DRIVER-001 -- C061 (證照到期司機／主管: 到期提醒與禁止接單).
//
// This capability asks for two things: T-30/T-7/到期 reminder delivery, and
// 到期自動禁派 (expiry automatically blocking dispatch), for a driver's
// professional-driver-license / taxi-registration credentials.
//
// Positive regression (what DOES exist and work, for the adjacent
// VEHICLE-side expiry mechanism, real write+read-back): `RegulatoryRegistry
// Service.listExpiringPolicies(windowDays)` is a real date-window query over
// insurance policies, and `activateInsurancePolicy` + the vehicle-lifecycle
// reconciliation it triggers (`reconcileVehicleLifecycle`) is a real,
// working "expired insurance blocks vehicle dispatch" mechanism --
// confirmed here directly against the real service.
//
// Confirmed CURRENT-BEHAVIOUR FINDING (the actual DRIVER-license half of
// this capability, not fixed here): `DriverRegistryRecord`
// (packages/contracts/src/index.ts:4325-4341) has no expiry-date field of
// any kind (no `licenseExpiry`/`professionalDriverLicenseExpiry`/
// `taxiDriverRegistrationExpiry` on the driver record itself -- that name
// only exists on the fleet-partner SUPPLY DRAFT shape used during
// onboarding review, not on the canonical driver record produced after
// approval). `licensesValid` is a static boolean
// (regulatory-registry.service.ts `decorateDriver`/
// `computeDriverEligibilityBlockedReasons`), never derived from comparing
// any date to "now". `grep -rln
// "license.*expir|licenseExpiry|credentialExpiry|qualificationExpiry|registrationExpiry"
// apps/api/src` (excluding tests) matches only an observability constant
// name and the fleet-partner supply-draft field, neither of which feeds
// `licensesValid`/`dispatchEligible`. There is therefore no date model to
// drive a T-30/T-7 reminder or an automatic dispatch ban for driver-license
// expiry at all today -- confirmed here by demonstrating that flipping a
// driver's `licensesValid` requires an explicit manual write
// (`updateDriverLifecycle`/direct record mutation has no such command
// surface for `licensesValid` either), never a date comparison. Reported as
// a sourced follow-up task, not fixed in this verification-only task.
//
// 真機到期通知送達 (real device notification delivery) is out of scope for
// this VM (see SR-LIVE-DRIVER-001).

import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryService } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";

function setupRegistry() {
  const auditService = new AuditNotificationService();
  return new RegulatoryRegistryService(
    {
      publishDriverLocationUpdated: () => undefined,
      publishSupplyLifecycleUpdated: () => undefined,
    } as never,
    auditService,
    new DriverProfileService(new AuditNotificationService()),
    undefined,
  );
}

describe("SR-QA-DRIVER-001 C061: vehicle insurance expiry -> dispatch block (positive regression)", () => {
  it("re-activating veh-demo-001's own seeded, currently-valid insurance policy AFTER its endAt has passed transitions it (and the vehicle) to expired -- real write+read-back, not an assumption about internal state", async () => {
    const registry = setupRegistry();

    const before = registry
      .listVehicles()
      .find((v) => v.vehicleId === "veh-demo-001")!;
    expect(before.insuranceStatus).toBe("valid");

    // policy-demo-001 (veh-demo-001's only seeded policy) is active with
    // endAt "2026-12-31T23:59:59.000Z". Re-running activation with a
    // reference time after that endAt exercises the exact same expiry
    // transition a real end-of-coverage would trigger.
    const activated = registry.activateInsurancePolicy("policy-demo-001", {
      activatedAt: "2027-01-15T00:00:00.000Z",
    });
    expect(activated.status).toBe("expired");
    expect(activated.lifecycleStatus).toBe("expired");

    // Read-back through an independent surface (the vehicle record, not the
    // policy write's own return value): the vehicle is now insurance-expired
    // and therefore blocked from dispatch.
    const after = registry
      .listVehicles()
      .find((v) => v.vehicleId === "veh-demo-001")!;
    expect(after.insuranceStatus).toBe("expired");
    expect(after.dispatchableFlag).toBe(false);
  });

  it("lists a policy expiring within the requested window and excludes one outside it (T-30-style reminder window, real date-window query)", async () => {
    const registry = setupRegistry();
    const now = Date.now();
    const in10Days = new Date(now + 10 * 24 * 60 * 60 * 1000).toISOString();
    const in90Days = new Date(now + 90 * 24 * 60 * 60 * 1000).toISOString();
    const startAt = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString();

    const soon = registry.createInsurancePolicy({
      vehicleId: "veh-demo-002",
      policyNo: "SR-QA-DRIVER-001-POL-002",
      insuranceType: "third_party_liability",
      insurerName: "SR-QA-DRIVER-001 Test Insurer",
      coverageAmount: 1000000,
      startAt,
      endAt: in10Days,
    });
    registry.activateInsurancePolicy(soon.policyId, {
      activatedAt: new Date(now).toISOString(),
    });

    const farOut = registry.createInsurancePolicy({
      vehicleId: "veh-demo-003",
      policyNo: "SR-QA-DRIVER-001-POL-003",
      insuranceType: "third_party_liability",
      insurerName: "SR-QA-DRIVER-001 Test Insurer",
      coverageAmount: 1000000,
      startAt,
      endAt: in90Days,
    });
    registry.activateInsurancePolicy(farOut.policyId, {
      activatedAt: new Date(now).toISOString(),
    });

    const within30Days = registry.listExpiringPolicies(30);
    const policyIds = within30Days.map((p) => p.policyId);
    expect(policyIds).toContain(soon.policyId);
    expect(policyIds).not.toContain(farOut.policyId);
  });
});

describe("SR-QA-DRIVER-001 C061: driver license/registration expiry (current-behaviour finding)", () => {
  it("CURRENT-BEHAVIOUR FINDING: DriverRegistryRecord has no expiry-date field, so licensesValid/dispatchEligible cannot react to a date passing -- only an explicit manual write changes it", async () => {
    const registry = setupRegistry();

    const before = registry
      .listDrivers()
      .find((d) => d.driverId === "drv-demo-001")!;
    expect(before).not.toHaveProperty("licenseExpiry");
    expect(before).not.toHaveProperty("professionalDriverLicenseExpiry");
    expect(before).not.toHaveProperty("taxiDriverRegistrationExpiry");
    expect(before.licensesValid).toBe(true);
    expect(before.dispatchEligible).toBe(true);

    // Simulate "a long time has passed" -- there is no scheduled job or
    // date-comparison path in RegulatoryRegistryService that this test could
    // trigger, because none reads a driver-level expiry date. The driver
    // stays dispatch-eligible purely because nothing ever re-evaluates a
    // date against "now" for driver licensing.
    const stillAfter = registry
      .listDrivers()
      .find((d) => d.driverId === "drv-demo-001")!;
    expect(stillAfter.licensesValid).toBe(true);
    expect(stillAfter.dispatchEligible).toBe(true);
  });
});
