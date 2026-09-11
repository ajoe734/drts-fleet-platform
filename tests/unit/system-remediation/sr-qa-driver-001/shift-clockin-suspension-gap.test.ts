// SR-QA-DRIVER-001 -- C051 (值勤司機: 上／下線、班次歷史與出勤計時).
//
// `tests/unit/shift-attendance.test.ts` already covers clock-in/out,
// double-clock-in rejection, attendance listing, shift abandonment, and (in
// its "GAP-CONF-08" block, against a *mocked* RegulatoryRegistryService)
// vehicle-dispatchability gating on clock-in. This file does not re-derive
// that coverage.
//
// It targets the specific remaining item in this capability's stated gap
// list -- 停權 (driver suspension) blocking dispatch -- using a REAL
// `RegulatoryRegistryService` instance (not a mock), the same authoritative
// suspension mechanism the C050 device-session tests in this task use
// (`updateDriverLifecycle`). Reading `shift-attendance.service.ts`'s
// `clockIn` method directly (lines ~46-77) confirms it checks
// `SHIFT_ALREADY_ACTIVE` and, only when a `vehicleId` is supplied,
// `regulatoryRegistryService.getVehicleDispatchability(vehicleId)` -- it
// never calls `getDriverAvailability`, `assertDriverAuthEligible`, or reads
// `driver.lifecycleStatus`/`dispatchEligible` for the DRIVER at all. This is
// recorded here as a confirmed CURRENT-BEHAVIOUR finding (not asserted as
// desired behaviour): a driver already suspended in the regulatory registry
// can still clock in to a shift with no vehicle attached (and, per the
// second case below, even with a fully dispatch-eligible vehicle attached).
// Reported separately as a sourced follow-up task, not silently patched in
// this verification-only task.
//
// 真機跨日 (real-device cross-midnight shift) is out of scope for this VM
// (see SR-LIVE-DRIVER-001); the "維保禁派" (maintenance blocks dispatch)
// half of the vehicle-dispatchability gap is already exercised by
// GAP-CONF-08 above (the mocked `getVehicleDispatchability` stands in for
// whatever registry-side reason -- maintenance included -- makes a vehicle
// undispatchable; `shift-attendance.service.ts` treats that boolean
// opaquely).

import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryService } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { ShiftAttendanceService } from "../../../../apps/api/src/modules/shift-attendance/shift-attendance.service";

function setupServices() {
  const auditService = new AuditNotificationService();
  const regulatoryService = new RegulatoryRegistryService(
    { emit: () => {} } as never,
    auditService,
    new DriverProfileService(new AuditNotificationService()),
    undefined,
  );
  const shiftService = new ShiftAttendanceService(
    auditService,
    undefined,
    regulatoryService,
  );

  return { shiftService, regulatoryService };
}

describe("SR-QA-DRIVER-001 C051: shift clock-in vs. driver suspension (current-behaviour finding)", () => {
  it("CURRENT-BEHAVIOUR FINDING: a suspended driver can still clock in without a vehicle -- ShiftAttendanceService.clockIn never checks driver lifecycle/suspension status", async () => {
    const { shiftService, regulatoryService } = setupServices();

    // drv-demo-003 is one of RegulatoryRegistryService's seeded drivers.
    const suspended = regulatoryService.updateDriverLifecycle("drv-demo-003", {
      lifecycleStatus: "suspended",
    });
    expect(suspended.lifecycleStatus).toBe("suspended");
    expect(suspended.dispatchEligible).toBe(false);

    // If this ever starts throwing (e.g. once a real suspension gate is
    // added to clockIn), this test must be updated to assert the rejection
    // instead of loosened further.
    const shift = shiftService.clockIn({ driverId: "drv-demo-003" });
    expect(shift.status).toBe("active");

    // Read-back through an independent surface, not just the write's own
    // return value.
    expect(
      shiftService
        .listShifts("drv-demo-003")
        .some((s) => s.shiftId === shift.shiftId && s.status === "active"),
    ).toBe(true);
  });

  it("CURRENT-BEHAVIOUR FINDING: a suspended driver can still clock in WITH a fully dispatch-eligible vehicle attached -- the vehicle-dispatchability gate does not substitute for a driver-eligibility gate", async () => {
    const { shiftService, regulatoryService } = setupServices();

    regulatoryService.updateDriverLifecycle("drv-demo-004", {
      lifecycleStatus: "suspended",
    });

    // veh-demo-001 is one of RegulatoryRegistryService's seeded, dispatchable
    // vehicles (confirmed dispatchable via the same real service used by the
    // C053-055 dispatch-trip-lifecycle test in this task).
    expect(regulatoryService.getVehicleDispatchability("veh-demo-001")).toBe(
      true,
    );

    const shift = shiftService.clockIn({
      driverId: "drv-demo-004",
      vehicleId: "veh-demo-001",
    });
    expect(shift.status).toBe("active");
    expect(shift.vehicleId).toBe("veh-demo-001");
  });
});
