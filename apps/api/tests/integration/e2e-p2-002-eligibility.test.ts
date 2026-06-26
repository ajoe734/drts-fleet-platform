import { describe, expect, it } from "vitest";

import {
  buildDriverIdentity,
  createPublicFleetHarness,
  DEFAULT_SANDBOX_PROGRAM_ID,
} from "./e2e-p2-test-helpers";

describe("E2E-P2-002 eligibility", () => {
  it("keeps dispatch fail-closed when driver lifecycle or sandbox qualification is not eligible", () => {
    const harness = createPublicFleetHarness({
      safetyOperatorId: "safe-op-e2e-p2-002",
    });

    const beforeSuspension = harness.regulatoryRegistryService
      .listDrivers()
      .find((driver) => driver.driverId === "drv-demo-001");
    harness.regulatoryRegistryService.updateDriverLifecycle("drv-demo-001", {
      lifecycleStatus: "suspended",
    });
    const afterSuspension = harness.regulatoryRegistryService
      .listDrivers()
      .find((driver) => driver.driverId === "drv-demo-001");

    const wrongProgramQualification =
      harness.safetyOperatorService.checkQualification(
        {
          safetyOperatorId: "safe-op-e2e-p2-002",
          sandboxProgramId: "sandbox-program-without-qualification",
          vehicleId: "veh-demo-001",
        },
        buildDriverIdentity("safe-op-e2e-p2-002", "req-e2e-p2-002"),
      );

    expect(beforeSuspension).toMatchObject({
      driverId: "drv-demo-001",
      dispatchEligible: true,
    });
    expect(afterSuspension).toMatchObject({
      driverId: "drv-demo-001",
      lifecycleStatus: "suspended",
      dispatchEligible: false,
      eligibilityBlockedReasons: expect.arrayContaining([
        "lifecycle_suspended",
        "work_state_suspended",
      ]),
    });
    expect(
      harness.regulatoryRegistryService.getDriverAvailability(
        "drv-demo-001",
        "business_dispatch",
      ),
    ).toBe(false);
    expect(wrongProgramQualification).toMatchObject({
      safetyOperatorId: "safe-op-e2e-p2-002",
      sandboxProgramId: "sandbox-program-without-qualification",
      qualified: false,
      reasons: ["NO_ACTIVE_QUALIFICATION"],
    });
    expect(
      harness.safetyOperatorService.checkQualification(
        {
          safetyOperatorId: "safe-op-e2e-p2-002",
          sandboxProgramId: DEFAULT_SANDBOX_PROGRAM_ID,
        },
        buildDriverIdentity("safe-op-e2e-p2-002", "req-e2e-p2-002-valid"),
      ).qualified,
    ).toBe(true);
  });
});
