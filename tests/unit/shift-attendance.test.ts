import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ShiftAttendanceRepository } from "../../apps/api/src/modules/shift-attendance/shift-attendance.repository";
import { ShiftAttendanceService } from "../../apps/api/src/modules/shift-attendance/shift-attendance.service";

function createService() {
  const auditService = new AuditNotificationService();
  const repository = new ShiftAttendanceRepository();
  const service = new ShiftAttendanceService(auditService, repository);

  return { auditService, repository, service };
}

describe("shift attendance service", () => {
  it("clocks in a driver successfully", () => {
    const { auditService, service } = createService();

    const shift = service.clockIn({
      driverId: "driver-001",
      vehicleId: "VEH-001",
      location: "Depot A",
      odometer: 50000,
    });

    expect(shift.shiftId).toMatch(/^SFT-\d{6}$/);
    expect(shift.driverId).toBe("driver-001");
    expect(shift.vehicleId).toBe("VEH-001");
    expect(shift.status).toBe("active");
    expect(shift.startLocation).toBe("Depot A");
    expect(shift.startOdometer).toBe(50000);
    expect(shift.clockedOutAt).toBeNull();

    expect(service.listShifts()).toHaveLength(1);
    expect(auditService.listAuditLogs()[0]?.actionName).toBe("clock_in");
  });

  it("prevents double clock-in", () => {
    const { service } = createService();

    service.clockIn({
      driverId: "driver-002",
      vehicleId: "VEH-002",
    });

    expect(() =>
      service.clockIn({
        driverId: "driver-002",
        vehicleId: "VEH-003",
      }),
    ).toThrow("Api Request Error");
  });

  it("clocks out an active driver", async () => {
    const { service } = createService();

    service.clockIn({
      driverId: "driver-003",
      vehicleId: "VEH-003",
      location: "Depot B",
    });

    // Wait a tiny bit so totalHours > 0
    await new Promise((r) => setTimeout(r, 10));

    const result = service.clockOut({
      driverId: "driver-003",
      location: "Depot B",
      odometer: 50150,
    });

    expect(result.shift.status).toBe("completed");
    expect(result.shift.clockedOutAt).toBeDefined();
    expect(result.shift.endOdometer).toBe(50150);
    expect(result.shift.totalHours).toBeDefined();
    expect(result.attendance.driverId).toBe("driver-003");
    // totalHours could be 0 if instant, so accept present or partial
    expect(["present", "partial"]).toContain(result.attendance.status);
  });

  it("rejects clock-out without active shift", () => {
    const { service } = createService();

    expect(() => service.clockOut({ driverId: "driver-nonexistent" })).toThrow(
      "Api Request Error",
    );
  });

  it("lists attendance for a specific driver", () => {
    const { service } = createService();

    service.clockIn({ driverId: "driver-004" });
    service.clockOut({ driverId: "driver-004" });

    const attendance = service.listAttendance("driver-004");
    expect(attendance).toHaveLength(1);
    expect(attendance[0]!.driverId).toBe("driver-004");
  });

  it("abandons an active shift", () => {
    const { service } = createService();

    const shift = service.clockIn({
      driverId: "driver-005",
      vehicleId: "VEH-005",
    });

    const abandoned = service.abandonShift(
      shift.shiftId,
      "Emergency situation",
    );
    expect(abandoned.status).toBe("abandoned");
    expect(abandoned.notes).toBe("Emergency situation");
  });

  it("rejects abandoning a non-active shift", () => {
    const { service } = createService();

    service.clockIn({ driverId: "driver-006" });
    service.clockOut({ driverId: "driver-006" });

    const shifts = service.listShifts("driver-006");
    expect(() => service.abandonShift(shifts[0]!.shiftId, "reason")).toThrow(
      "Api Request Error",
    );
  });

  it("returns 404 for nonexistent shift", () => {
    const { service } = createService();

    expect(() => service.getShift("SFT-999999")).toThrow("Api Request Error");
  });
});
