import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AttendanceRecord,
  AuditLogRecord,
  ClockInCommand,
  ClockOutCommand,
  ShiftRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { ShiftAttendanceRepository } from "./shift-attendance.repository";

@Injectable()
export class ShiftAttendanceService implements OnModuleInit {
  private shiftSequence = 1;
  private attendanceSequence = 1;
  private shifts: ShiftRecord[] = [];
  private attendance: AttendanceRecord[] = [];

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    @Optional() private readonly repository?: ShiftAttendanceRepository,
  ) {}

  async onModuleInit() {
    if (!this.repository) return;
    try {
      const state = await this.repository.loadState();
      if (state.shifts.length === 0 && state.attendance.length === 0) return;
      this.shifts = state.shifts.map((s) => this.cloneShift(s));
      this.attendance = state.attendance.map((a) => this.cloneAttendance(a));
      this.shiftSequence = this.deriveNextShiftSequence(state.shifts);
      this.attendanceSequence = this.deriveNextAttendanceSequence(
        state.attendance,
      );
    } catch (error) {
      this.repository.reportPersistenceFailure(error, "module init");
    }
  }

  clockIn(command: ClockInCommand, requestId?: string) {
    this.assertNonBlank(command.driverId, "driverId");

    // Check for existing active shift
    const activeShift = this.shifts.find(
      (s) => s.driverId === command.driverId && s.status === "active",
    );
    if (activeShift) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "SHIFT_ALREADY_ACTIVE",
        "Driver already has an active shift.",
        { shiftId: activeShift.shiftId },
      );
    }

    const now = new Date().toISOString();
    const shift: ShiftRecord = {
      shiftId: this.nextShiftId(),
      driverId: command.driverId,
      vehicleId: command.vehicleId ?? null,
      status: "active",
      clockedInAt: now,
      clockedOutAt: null,
      startLocation: command.location ?? null,
      endLocation: null,
      startOdometer: command.odometer ?? null,
      endOdometer: null,
      notes: null,
      totalHours: null,
    };

    this.shifts = [shift, ...this.shifts];
    this.persist({ shifts: [shift] }, "clock_in");
    this.recordAudit(
      {
        actorId: command.driverId,
        actorType: "system",
        tenantId: null,
        moduleName: "shift-attendance",
        actionName: "clock_in",
        resourceType: "shift",
        resourceId: shift.shiftId,
        newValuesSummary: {
          driverId: command.driverId,
          vehicleId: command.vehicleId,
          location: command.location,
        },
      },
      requestId,
    );

    return this.cloneShift(shift);
  }

  clockOut(command: ClockOutCommand, requestId?: string) {
    this.assertNonBlank(command.driverId, "driverId");

    const activeShift = this.shifts.find(
      (s) => s.driverId === command.driverId && s.status === "active",
    );
    if (!activeShift) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NO_ACTIVE_SHIFT",
        "No active shift found for this driver.",
        { driverId: command.driverId },
      );
    }

    const now = new Date();
    const clockedInAt = new Date(activeShift.clockedInAt);
    const totalHours =
      Math.round(((now.getTime() - clockedInAt.getTime()) / 3600000) * 100) /
      100;

    const updated: ShiftRecord = {
      ...activeShift,
      status: "completed",
      clockedOutAt: now.toISOString(),
      endLocation: command.location ?? null,
      endOdometer: command.odometer ?? null,
      notes: command.notes ?? activeShift.notes,
      totalHours,
    };

    this.replaceShift(updated);

    // Create attendance record
    const attendance: AttendanceRecord = {
      attendanceId: this.nextAttendanceId(),
      driverId: command.driverId,
      shiftId: updated.shiftId,
      date: clockedInAt.toISOString().slice(0, 10),
      clockedInAt: activeShift.clockedInAt,
      clockedOutAt: now.toISOString(),
      totalHours,
      status: totalHours > 0 ? "present" : "partial",
    };

    this.attendance = [attendance, ...this.attendance];
    this.persist({ shifts: [updated], attendance: [attendance] }, "clock_out");
    this.recordAudit(
      {
        actorId: command.driverId,
        actorType: "system",
        tenantId: null,
        moduleName: "shift-attendance",
        actionName: "clock_out",
        resourceType: "shift",
        resourceId: updated.shiftId,
        newValuesSummary: { totalHours, status: updated.status },
      },
      requestId,
    );

    return {
      shift: this.cloneShift(updated),
      attendance: this.cloneAttendance(attendance),
    };
  }

  listShifts(driverId?: string) {
    let result = this.shifts.map((s) => this.cloneShift(s));
    if (driverId) {
      result = result.filter((s) => s.driverId === driverId);
    }
    return result;
  }

  listAttendance(driverId?: string) {
    let result = this.attendance.map((a) => this.cloneAttendance(a));
    if (driverId) {
      result = result.filter((a) => a.driverId === driverId);
    }
    return result;
  }

  getShift(shiftId: string) {
    return this.cloneShift(this.requireShift(shiftId));
  }

  abandonShift(shiftId: string, reason: string, requestId?: string) {
    const shift = this.requireShift(shiftId);
    if (shift.status !== "active") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "SHIFT_NOT_ACTIVE",
        "Only active shifts can be abandoned.",
        { shiftId, currentStatus: shift.status },
      );
    }

    const updated: ShiftRecord = {
      ...shift,
      status: "abandoned",
      clockedOutAt: new Date().toISOString(),
      notes: reason,
      updatedAt: new Date().toISOString(),
    };

    this.replaceShift(updated);
    this.persist({ shifts: [updated] }, "abandon_shift");
    this.recordAudit(
      {
        actorId: null,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "shift-attendance",
        actionName: "abandon_shift",
        resourceType: "shift",
        resourceId: shiftId,
        newValuesSummary: { status: "abandoned", reason },
      },
      requestId,
    );

    return this.cloneShift(updated);
  }

  // --- Private helpers ---

  private requireShift(shiftId: string) {
    const shift = this.shifts.find((s) => s.shiftId === shiftId);
    if (!shift) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "Shift not found.",
        { shiftId },
      );
    }
    return shift;
  }

  private replaceShift(updated: ShiftRecord) {
    this.shifts = this.shifts.map((s) =>
      s.shiftId === updated.shiftId ? updated : s,
    );
  }

  private nextShiftId() {
    const seq = this.shiftSequence++;
    return `SFT-${String(seq).padStart(6, "0")}`;
  }

  private nextAttendanceId() {
    const seq = this.attendanceSequence++;
    return `ATT-${String(seq).padStart(6, "0")}`;
  }

  private deriveNextShiftSequence(shifts: readonly ShiftRecord[]) {
    const maxSeq = shifts.reduce((max, s) => {
      const num = Number.parseInt(s.shiftId.replace("SFT-", ""), 10);
      return Number.isInteger(num) ? Math.max(max, num) : max;
    }, 0);
    return maxSeq + 1;
  }

  private deriveNextAttendanceSequence(
    attendance: readonly AttendanceRecord[],
  ) {
    const maxSeq = attendance.reduce((max, a) => {
      const num = Number.parseInt(a.attendanceId.replace("ATT-", ""), 10);
      return Number.isInteger(num) ? Math.max(max, num) : max;
    }, 0);
    return maxSeq + 1;
  }

  private cloneShift(shift: ShiftRecord) {
    return { ...shift };
  }

  private cloneAttendance(attendance: AttendanceRecord) {
    return { ...attendance };
  }

  private persist(
    changes: {
      shifts?: readonly ShiftRecord[];
      attendance?: readonly AttendanceRecord[];
    },
    context: string,
  ) {
    if (!this.repository) return;
    const payload: {
      shifts?: ShiftRecord[];
      attendance?: AttendanceRecord[];
    } = {};
    if (changes.shifts) {
      payload.shifts = changes.shifts.map((s) => this.cloneShift(s));
    }
    if (changes.attendance) {
      payload.attendance = changes.attendance.map((a) =>
        this.cloneAttendance(a),
      );
    }
    void this.repository.persistChanges(payload).catch((error: unknown) => {
      this.repository!.reportPersistenceFailure(error, context);
    });
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    const log = { ...input };
    if (requestId) (log as any).requestId = requestId;
    this.auditNotificationService.recordAuditLog(log);
  }

  private assertNonBlank(value: string, fieldName: string) {
    if (!value.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${fieldName} is required.`,
        { field: fieldName },
      );
    }
  }
}
