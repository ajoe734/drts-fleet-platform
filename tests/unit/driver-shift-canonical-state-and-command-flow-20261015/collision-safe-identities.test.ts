// C051-F2: collision-safe shift/attendance identity allocation.
//
// `ShiftAttendanceService.nextShiftId()`/`nextAttendanceId()` are
// per-instance in-memory counters seeded from whatever state that instance
// loaded at startup. Two independently started service instances that
// loaded the same (e.g. empty) snapshot derive the same first id —
// "SFT-000001" — for two otherwise-unrelated, valid clock-in commands from
// different drivers. Before this fix, the second instance's INSERT would
// hit the table's real unique constraint (shift_id/shift_no) and the whole
// clock-in would fail with a raw DB error, even though nothing about that
// driver's command was invalid. This file reproduces that collision against
// a real `ShiftAttendanceRepository` + socket-free fake Postgres
// (`fake-shift-db.ts`) and shows the fix: on a unique-violation, the
// repository re-derives a fresh id from the canonical table and retries
// instead of failing the command.

import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ShiftAttendanceRepository } from "../../../apps/api/src/modules/shift-attendance/shift-attendance.repository";
import { ShiftAttendanceService } from "../../../apps/api/src/modules/shift-attendance/shift-attendance.service";
import {
  FakeUniqueViolationError,
  createFakeShiftDatabase,
} from "./fake-shift-db";

function createInstance(db: ReturnType<typeof createFakeShiftDatabase>) {
  const repository = new ShiftAttendanceRepository(db.databaseService as never);
  const service = new ShiftAttendanceService(
    new AuditNotificationService(),
    repository,
  );
  return { repository, service };
}

describe("C051-F2: collision-safe shift id allocation", () => {
  it("retries with a fresh id instead of failing when two drivers' commands derive the same shift id", async () => {
    const db = createFakeShiftDatabase(["drv-col-001", "drv-col-002"]);

    // Simulate another process having already committed "SFT-000001" for a
    // different driver — a fresh service instance's in-memory counter would
    // independently derive that same id for its own first clock-in.
    db.seedShift({
      shiftId: "SFT-000001",
      driverId: "drv-col-001",
      status: "completed",
      record: {
        shiftId: "SFT-000001",
        driverId: "drv-col-001",
        vehicleId: null,
        status: "completed",
        clockedInAt: new Date().toISOString(),
        clockedOutAt: new Date().toISOString(),
        startLocation: null,
        endLocation: null,
        startOdometer: null,
        endOdometer: null,
        notes: null,
        totalHours: 1,
      },
    });

    const instance = createInstance(db);
    // This fresh instance's own counter starts at 1 (no onModuleInit ran),
    // so its first clock-in will also try "SFT-000001" and collide.
    const shift = await instance.service.clockIn({ driverId: "drv-col-002" });

    expect(shift.shiftId).not.toBe("SFT-000001");
    expect(shift.shiftId).toMatch(/^SFT-\d{6}$/);
    expect(shift.driverId).toBe("drv-col-002");

    // Both rows exist, distinctly, with no corruption of the pre-existing one.
    expect(db.shiftCount()).toBe(2);
    expect(db.getShiftRow("SFT-000001")?.driver_id).toBe("drv-col-001");
    expect(db.getShiftRow(shift.shiftId)?.driver_id).toBe("drv-col-002");
  });

  it("retries attendance id allocation on the same collision during clock-out", async () => {
    const db = createFakeShiftDatabase(["drv-col-003"]);
    db.seedShift({
      shiftId: "SFT-900001",
      driverId: "drv-other",
      status: "completed",
      record: { shiftId: "SFT-900001" },
    });
    // Pre-seed an attendance row via a direct insert path so the fresh
    // instance's first attendance id ("ATT-000001") collides on clock-out.
    const seedingInstance = createInstance(db);
    await seedingInstance.repository.persistChanges({
      attendance: [
        {
          attendanceId: "ATT-000001",
          driverId: "drv-other",
          shiftId: "SFT-900001",
          date: "2026-10-01",
          clockedInAt: new Date().toISOString(),
          clockedOutAt: new Date().toISOString(),
          totalHours: 1,
          status: "present",
        },
      ],
    });

    const instance = createInstance(db);
    await instance.service.clockIn({ driverId: "drv-col-003" });
    const result = await instance.service.clockOut({
      driverId: "drv-col-003",
    });

    expect(result.attendance.attendanceId).not.toBe("ATT-000001");
    expect(result.attendance.attendanceId).toMatch(/^ATT-\d{6}$/);
    expect(db.attendanceCount()).toBe(2);
  });

  it("still rejects a second active clock-in for the same driver with a 409, not a collision retry", async () => {
    const db = createFakeShiftDatabase(["drv-col-004"]);
    const instance = createInstance(db);

    await instance.service.clockIn({ driverId: "drv-col-004" });

    await expect(
      instance.service.clockIn({ driverId: "drv-col-004" }),
    ).rejects.toMatchObject({ code: "SHIFT_ALREADY_ACTIVE" });

    expect(db.shiftCount()).toBe(1);
  });

  it("does not leave a synthetic success when the insert keeps failing beyond the retry budget", async () => {
    const db = createFakeShiftDatabase(["drv-col-005"]);
    const instance = createInstance(db);

    // Force every insert attempt to collide, regardless of the id chosen.
    for (let i = 0; i < 10; i += 1) {
      db.queueFailure(
        "INSERT INTO ops.phase1_driver_shifts",
        new FakeUniqueViolationError("phase1_driver_shifts_pkey"),
      );
    }

    await expect(
      instance.service.clockIn({ driverId: "drv-col-005" }),
    ).rejects.toMatchObject({ code: "23505" });

    // Rejected transaction must not leave a row behind, nor a locally
    // cached "active" shift for this driver.
    expect(db.shiftCount()).toBe(0);
    expect(await instance.service.listShifts("drv-col-005")).toHaveLength(0);
  });

  it("re-derives the id after a collision without the surrounding transaction going aborted (SQLSTATE 25P02)", async () => {
    // Real Postgres aborts the whole transaction after any statement fails
    // (e.g. the unique-violation INSERT below) and rejects every later
    // statement with 25P02 until a ROLLBACK or ROLLBACK TO SAVEPOINT is
    // issued. `fake-shift-db.ts` reproduces that: once a statement fails
    // inside BEGIN...COMMIT, the next statement throws
    // `FakeAbortedTransactionError` (code 25P02) unless the retry loop
    // first rolls back to its savepoint. If the repository ever drops the
    // SAVEPOINT/ROLLBACK TO SAVEPOINT around the retry, the re-allocation
    // SELECT below fails with 25P02 instead of returning a fresh id, and
    // this clock-in rejects instead of succeeding.
    const db = createFakeShiftDatabase(["drv-col-007", "drv-col-008"]);
    db.seedShift({
      shiftId: "SFT-000001",
      driverId: "drv-col-007",
      status: "completed",
      record: { shiftId: "SFT-000001" },
    });

    const instance = createInstance(db);
    const shift = await instance.service.clockIn({ driverId: "drv-col-008" });

    expect(shift.shiftId).not.toBe("SFT-000001");
    expect(shift.shiftId).toMatch(/^SFT-\d{6}$/);
  });

  it("atomically rolls back the shift update if the attendance insert cannot be committed", async () => {
    const db = createFakeShiftDatabase(["drv-col-006"]);
    const instance = createInstance(db);

    const shift = await instance.service.clockIn({ driverId: "drv-col-006" });

    db.queueFailure(
      "INSERT INTO ops.phase1_driver_attendance",
      new Error("connection terminated unexpectedly"),
    );

    await expect(
      instance.service.clockOut({ driverId: "drv-col-006" }),
    ).rejects.toThrow("connection terminated unexpectedly");

    // The shift row must not be left "completed" by a transaction whose
    // attendance half never committed.
    expect(db.getShiftRow(shift.shiftId)?.status).toBe("active");
  });
});
