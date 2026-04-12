import { Injectable, Logger, Optional } from "@nestjs/common";

import type { ShiftRecord, AttendanceRecord } from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

type ShiftAttendanceState = {
  shifts: ShiftRecord[];
  attendance: AttendanceRecord[];
};

type PersistShiftAttendanceChanges = {
  shifts?: readonly ShiftRecord[];
  attendance?: readonly AttendanceRecord[];
};

@Injectable()
export class ShiftAttendanceRepository {
  private readonly logger = new Logger(ShiftAttendanceRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadState(): Promise<ShiftAttendanceState> {
    if (!this.isEnabled()) {
      return { shifts: [], attendance: [] };
    }

    const [shiftsResult, attendanceResult] = await Promise.all([
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM ops.phase1_driver_shifts
          ORDER BY clock_in_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM ops.phase1_driver_attendance
          ORDER BY date DESC, clock_in_at DESC
        `,
      ),
    ]);

    return {
      shifts: shiftsResult.rows.map((row) =>
        this.parseRecord<ShiftRecord>(row.record, "ops.phase1_driver_shifts"),
      ),
      attendance: attendanceResult.rows.map((row) =>
        this.parseRecord<AttendanceRecord>(
          row.record,
          "ops.phase1_driver_attendance",
        ),
      ),
    };
  }

  async persistChanges(changes: PersistShiftAttendanceChanges) {
    if (!this.isEnabled()) {
      return;
    }

    const writes: Promise<unknown>[] = [];

    for (const shift of changes.shifts ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO ops.phase1_driver_shifts (
              shift_id, shift_no, driver_id, vehicle_id, status,
              clock_in_at, clock_out_at,
              created_at, updated_at, record
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
            ON CONFLICT (shift_id) DO UPDATE SET
              driver_id = EXCLUDED.driver_id,
              vehicle_id = EXCLUDED.vehicle_id,
              status = EXCLUDED.status,
              clock_out_at = EXCLUDED.clock_out_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            shift.shiftId,
            shift.shiftId, // shift_no — use shiftId as the unique human-readable key
            shift.driverId,
            shift.vehicleId ?? null,
            shift.status,
            shift.clockedInAt,
            shift.clockedOutAt ?? null,
            shift.clockedInAt,
            shift.clockedOutAt ?? shift.clockedInAt,
            JSON.stringify(shift),
          ],
        ),
      );
    }

    for (const att of changes.attendance ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO ops.phase1_driver_attendance (
              attendance_id, driver_id, shift_id, date, status,
              clock_in_at, clock_out_at, record
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
            ON CONFLICT (attendance_id) DO UPDATE SET
              driver_id = EXCLUDED.driver_id,
              shift_id = EXCLUDED.shift_id,
              status = EXCLUDED.status,
              clock_out_at = EXCLUDED.clock_out_at,
              record = EXCLUDED.record
          `,
          [
            att.attendanceId,
            att.driverId,
            att.shiftId,
            att.date,
            att.status,
            att.clockedInAt,
            att.clockedOutAt ?? null,
            JSON.stringify(att),
          ],
        ),
      );
    }

    await Promise.all(writes);
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Shift/Attendance persistence skipped during ${context}: ${detail}`,
    );
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }
    return record as T;
  }
}
