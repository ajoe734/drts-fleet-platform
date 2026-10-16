// C051-F3: abandon canonical write ACK and terminal races.
//
// Before this fix, `abandonShift` mutated the in-memory shift, fired the
// audit log, and returned success synchronously — persistence to the DB
// was a detached fire-and-forget `this.persist(...)` call whose outcome was
// never awaited. A rejected write therefore still reported success, and a
// shift that had raced to "completed" via a concurrent clock-out was never
// re-checked against the canonical row before being overwritten. This file
// drives `ShiftAttendanceService.abandonShift` through a real
// `ShiftAttendanceRepository` + socket-free fake Postgres
// (`fake-shift-db.ts`) to show: success is only reported after the durable
// write commits; a rejected write leaves the canonical row (and the local
// cache/audit trail) untouched; and a shift already in a terminal state is
// rejected with the original conflict code rather than silently resurrected.

import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ShiftAttendanceRepository } from "../../../apps/api/src/modules/shift-attendance/shift-attendance.repository";
import { ShiftAttendanceService } from "../../../apps/api/src/modules/shift-attendance/shift-attendance.service";
import { createFakeShiftDatabase } from "./fake-shift-db";

function createInstance(db: ReturnType<typeof createFakeShiftDatabase>) {
  const auditService = new AuditNotificationService();
  const repository = new ShiftAttendanceRepository(db.databaseService as never);
  const service = new ShiftAttendanceService(auditService, repository);
  return { repository, service, auditService };
}

describe("C051-F3: abandon durable ACK and terminal races", () => {
  it("only reports success after the abandon write durably commits", async () => {
    const db = createFakeShiftDatabase(["drv-aban-001"]);
    const { service, auditService } = createInstance(db);

    const shift = await service.clockIn({ driverId: "drv-aban-001" });

    const updated = await service.abandonShift(shift.shiftId, "Emergency");

    expect(updated.status).toBe("abandoned");
    expect(updated.notes).toBe("Emergency");
    // The canonical row itself is updated, not just the caller's local copy.
    expect(db.getShiftRow(shift.shiftId)?.status).toBe("abandoned");
    expect(
      auditService
        .listAuditLogs()
        .some((log) => log.actionName === "abandon_shift"),
    ).toBe(true);
  });

  it("keeps the shift active and skips the audit when the durable write is rejected", async () => {
    const db = createFakeShiftDatabase(["drv-aban-002"]);
    const { service, auditService } = createInstance(db);

    const shift = await service.clockIn({ driverId: "drv-aban-002" });

    db.queueFailure(
      "UPDATE ops.phase1_driver_shifts",
      new Error("connection terminated unexpectedly"),
    );

    await expect(
      service.abandonShift(shift.shiftId, "Emergency"),
    ).rejects.toThrow("connection terminated unexpectedly");

    // Pending write must stay pending / rejected write preserves original
    // state: the canonical row is still "active", and no success audit was
    // recorded for a write that never durably happened.
    expect(db.getShiftRow(shift.shiftId)?.status).toBe("active");
    expect(
      auditService
        .listAuditLogs()
        .some((log) => log.actionName === "abandon_shift"),
    ).toBe(false);
  });

  it("rejects abandoning a shift that has already completed via clock-out (terminal race)", async () => {
    const db = createFakeShiftDatabase(["drv-aban-003"]);
    const { service, auditService } = createInstance(db);

    const shift = await service.clockIn({ driverId: "drv-aban-003" });
    await service.clockOut({ driverId: "drv-aban-003" });

    // A stale abandon request — issued before the clock-out raced ahead of
    // it — must be rejected against the canonical current state, not a
    // caller's stale "active" snapshot.
    await expect(
      service.abandonShift(shift.shiftId, "too late"),
    ).rejects.toMatchObject({ code: "SHIFT_NOT_ACTIVE" });

    expect(db.getShiftRow(shift.shiftId)?.status).toBe("completed");
    expect(
      auditService
        .listAuditLogs()
        .some((log) => log.actionName === "abandon_shift"),
    ).toBe(false);
  });

  it("rejects abandoning an already-abandoned shift without rewriting its history", async () => {
    const db = createFakeShiftDatabase(["drv-aban-004"]);
    const { service } = createInstance(db);

    const shift = await service.clockIn({ driverId: "drv-aban-004" });
    await service.abandonShift(shift.shiftId, "first reason");

    await expect(
      service.abandonShift(shift.shiftId, "second reason"),
    ).rejects.toMatchObject({ code: "SHIFT_NOT_ACTIVE" });

    // The original abandon reason/notes are not overwritten by the stale retry.
    const record = db.getShiftRow(shift.shiftId)?.record as { notes?: string };
    expect(record.notes).toBe("first reason");
  });

  it("returns a real 404 for abandoning a nonexistent shift, independent of the cache", async () => {
    const db = createFakeShiftDatabase(["drv-aban-005"]);
    const { service } = createInstance(db);

    await expect(
      service.abandonShift("SFT-999999", "no such shift"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("falls back to the in-memory transaction when no DB is configured (explicit no-DB mode)", async () => {
    const repository = new ShiftAttendanceRepository();
    const service = new ShiftAttendanceService(
      new AuditNotificationService(),
      repository,
    );

    const shift = await service.clockIn({ driverId: "drv-no-db-aban" });
    const updated = await service.abandonShift(shift.shiftId, "no-db reason");
    expect(updated.status).toBe("abandoned");

    await expect(
      service.abandonShift(shift.shiftId, "retry"),
    ).rejects.toMatchObject({ code: "SHIFT_NOT_ACTIVE" });
  });
});
