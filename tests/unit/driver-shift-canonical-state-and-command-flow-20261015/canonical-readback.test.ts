// C051-F1: canonical shift/attendance readback.
//
// Before this fix, `listShifts`/`listAttendance`/`getShift` only ever read
// `ShiftAttendanceService`'s own in-memory `this.shifts`/`this.attendance`
// arrays (hydrated once in `onModuleInit`). A second, independently
// constructed service instance — standing in for another process, or the
// same process after a restart — never saw writes committed by the first
// instance, and a canonical-read failure was indistinguishable from "no
// rows". This file reproduces both problems against a real
// `ShiftAttendanceRepository` backed by a socket-free fake Postgres
// (`fake-shift-db.ts`), then shows the fixed behaviour: reads go to the
// shared table, so an independent reader sees committed writes, and a
// failed read propagates as a rejection rather than an empty result.

import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ShiftAttendanceRepository } from "../../../apps/api/src/modules/shift-attendance/shift-attendance.repository";
import { ShiftAttendanceService } from "../../../apps/api/src/modules/shift-attendance/shift-attendance.service";
import { createFakeShiftDatabase } from "./fake-shift-db";

function createInstance(db: ReturnType<typeof createFakeShiftDatabase>) {
  const repository = new ShiftAttendanceRepository(db.databaseService as never);
  const service = new ShiftAttendanceService(
    new AuditNotificationService(),
    repository,
  );
  return { repository, service };
}

describe("C051-F1: canonical cross-reader shift/attendance readback", () => {
  it("lets an independent reader instance see a shift committed by another instance", async () => {
    const db = createFakeShiftDatabase(["drv-reader-001"]);

    const writer = createInstance(db);
    const shift = await writer.service.clockIn({ driverId: "drv-reader-001" });

    // A brand new service+repository pair, sharing only the canonical table
    // — not the writer's local `this.shifts` cache — stands in for another
    // process or a restart of the same one.
    const reader = createInstance(db);

    const viaList = await reader.service.listShifts("drv-reader-001");
    expect(viaList).toHaveLength(1);
    expect(viaList[0]?.shiftId).toBe(shift.shiftId);

    const viaGet = await reader.service.getShift(shift.shiftId);
    expect(viaGet.driverId).toBe("drv-reader-001");
    expect(viaGet.status).toBe("active");
  });

  it("lets an independent reader instance see attendance committed after clock-out", async () => {
    const db = createFakeShiftDatabase(["drv-reader-002"]);

    const writer = createInstance(db);
    await writer.service.clockIn({ driverId: "drv-reader-002" });
    const { attendance } = await writer.service.clockOut({
      driverId: "drv-reader-002",
    });

    const reader = createInstance(db);
    const viaList = await reader.service.listAttendance("drv-reader-002");
    expect(viaList).toHaveLength(1);
    expect(viaList[0]?.attendanceId).toBe(attendance.attendanceId);
  });

  it("returns a genuine empty list for a driver with no rows (not a failure)", async () => {
    const db = createFakeShiftDatabase(["drv-reader-003"]);
    const reader = createInstance(db);

    await expect(reader.service.listShifts("drv-reader-003")).resolves.toEqual(
      [],
    );
    await expect(
      reader.service.listAttendance("drv-reader-003"),
    ).resolves.toEqual([]);
  });

  it("propagates a failed canonical read instead of reporting it as empty", async () => {
    const db = createFakeShiftDatabase(["drv-reader-004"]);
    const writer = createInstance(db);
    await writer.service.clockIn({ driverId: "drv-reader-004" });

    const reader = createInstance(db);
    db.queueFailure(
      "FROM ops.phase1_driver_shifts",
      new Error("connection terminated unexpectedly"),
    );

    await expect(
      reader.service.listShifts("drv-reader-004"),
    ).rejects.toThrow("connection terminated unexpectedly");
  });

  it("propagates a failed canonical single-shift read rather than a false 404", async () => {
    const db = createFakeShiftDatabase(["drv-reader-005"]);
    const writer = createInstance(db);
    const shift = await writer.service.clockIn({ driverId: "drv-reader-005" });

    const reader = createInstance(db);
    db.queueFailure(
      "WHERE shift_id = $1",
      new Error("connection terminated unexpectedly"),
    );

    await expect(reader.service.getShift(shift.shiftId)).rejects.toThrow(
      "connection terminated unexpectedly",
    );
  });

  it("still returns a real 404 for a shift id that genuinely does not exist", async () => {
    const db = createFakeShiftDatabase(["drv-reader-006"]);
    const reader = createInstance(db);

    await expect(reader.service.getShift("SFT-999999")).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );
  });

  it("filters list reads by driver and keeps other drivers' shifts out", async () => {
    const db = createFakeShiftDatabase(["drv-reader-007", "drv-reader-008"]);
    const writer = createInstance(db);
    await writer.service.clockIn({ driverId: "drv-reader-007" });
    await writer.service.clockIn({ driverId: "drv-reader-008" });

    const reader = createInstance(db);
    const shifts007 = await reader.service.listShifts("drv-reader-007");
    expect(shifts007).toHaveLength(1);
    expect(shifts007[0]?.driverId).toBe("drv-reader-007");

    const allShifts = await reader.service.listShifts();
    expect(allShifts).toHaveLength(2);
  });

  it("falls back to the in-memory store when no DB is configured (explicit no-DB mode)", async () => {
    const repository = new ShiftAttendanceRepository();
    const service = new ShiftAttendanceService(
      new AuditNotificationService(),
      repository,
    );

    await service.clockIn({ driverId: "drv-no-db-001" });
    const shifts = await service.listShifts("drv-no-db-001");
    expect(shifts).toHaveLength(1);

    await expect(service.getShift("SFT-999999")).rejects.toBeInstanceOf(
      ApiRequestError,
    );
  });
});
