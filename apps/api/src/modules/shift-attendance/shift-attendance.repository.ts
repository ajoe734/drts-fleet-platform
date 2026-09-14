import { HttpStatus, Injectable, Logger, Optional } from "@nestjs/common";

import type { ShiftRecord, AttendanceRecord } from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
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

  async executeClockInTransaction(
    driverId: string,
    verifyEligibilityAndBuildShift: () => Promise<ShiftRecord>,
  ): Promise<ShiftRecord> {
    if (!this.isEnabled()) {
      return verifyEligibilityAndBuildShift();
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");

      // Lock driver row in reg.phase1_registry_drivers
      const driverRes = await client.query(
        `SELECT driver_id FROM reg.phase1_registry_drivers WHERE driver_id = $1 FOR UPDATE`,
        [driverId],
      );
      if (driverRes.rows.length === 0) {
        throw new ApiRequestError(
          HttpStatus.NOT_FOUND,
          "DRIVER_NOT_FOUND",
          "Driver not found in authority registry.",
          { driverId },
        );
      }

      // Check active shift in ops.phase1_driver_shifts
      const shiftRes = await client.query(
        `SELECT shift_id FROM ops.phase1_driver_shifts WHERE driver_id = $1 AND status = 'active'`,
        [driverId],
      );
      const existingShift = shiftRes.rows[0];
      if (existingShift) {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "SHIFT_ALREADY_ACTIVE",
          "Driver already has an active shift.",
          { shiftId: existingShift.shift_id },
        );
      }

      const shift = await verifyEligibilityAndBuildShift();

      await client.query(
        `
          INSERT INTO ops.phase1_driver_shifts (
            shift_id, shift_no, driver_id, vehicle_id, status,
            clock_in_at, clock_out_at,
            created_at, updated_at, record
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
        `,
        [
          shift.shiftId,
          shift.shiftId,
          shift.driverId,
          shift.vehicleId ?? null,
          shift.status,
          shift.clockedInAt,
          shift.clockedOutAt ?? null,
          shift.clockedInAt,
          shift.clockedOutAt ?? shift.clockedInAt,
          JSON.stringify(shift),
        ],
      );

      await client.query("COMMIT");
      return shift;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback failure
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async executeClockOutTransaction(
    driverId: string,
    buildUpdatedShiftAndAttendance: (activeShift: ShiftRecord) => {
      shift: ShiftRecord;
      attendance: AttendanceRecord;
    },
  ): Promise<{ shift: ShiftRecord; attendance: AttendanceRecord }> {
    if (!this.isEnabled()) {
      throw new Error("DatabaseService not enabled");
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");

      // Lock driver row with same lock order
      const driverRes = await client.query(
        `SELECT driver_id FROM reg.phase1_registry_drivers WHERE driver_id = $1 FOR UPDATE`,
        [driverId],
      );
      if (driverRes.rows.length === 0) {
        throw new ApiRequestError(
          HttpStatus.NOT_FOUND,
          "DRIVER_NOT_FOUND",
          "Driver not found in authority registry.",
          { driverId },
        );
      }

      // Read active shift
      const shiftRes = await client.query<JsonRecordRow>(
        `SELECT record FROM ops.phase1_driver_shifts WHERE driver_id = $1 AND status = 'active'`,
        [driverId],
      );
      const firstRow = shiftRes.rows[0];
      if (!firstRow) {
        throw new ApiRequestError(
          HttpStatus.NOT_FOUND,
          "NO_ACTIVE_SHIFT",
          "No active shift found for this driver.",
          { driverId },
        );
      }

      const activeShift = this.parseRecord<ShiftRecord>(
        firstRow.record,
        "ops.phase1_driver_shifts",
      );

      const { shift: updated, attendance } =
        buildUpdatedShiftAndAttendance(activeShift);

      await client.query(
        `
          UPDATE ops.phase1_driver_shifts
          SET status = $2,
              clock_out_at = $3,
              updated_at = $4,
              record = $5::jsonb
          WHERE shift_id = $1
        `,
        [
          updated.shiftId,
          updated.status,
          updated.clockedOutAt,
          updated.clockedOutAt,
          JSON.stringify(updated),
        ],
      );

      await client.query(
        `
          INSERT INTO ops.phase1_driver_attendance (
            attendance_id, driver_id, shift_id, date, status,
            clock_in_at, clock_out_at, record
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        `,
        [
          attendance.attendanceId,
          attendance.driverId,
          attendance.shiftId,
          attendance.date,
          attendance.status,
          attendance.clockedInAt,
          attendance.clockedOutAt ?? null,
          JSON.stringify(attendance),
        ],
      );

      await client.query("COMMIT");
      return { shift: updated, attendance };
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback failure
      }
      throw error;
    } finally {
      client.release();
    }
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
