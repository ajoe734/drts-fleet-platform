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

const UNIQUE_VIOLATION_CODE = "23505";
const MAX_ID_ALLOCATION_ATTEMPTS = 5;

@Injectable()
export class ShiftAttendanceRepository {
  private readonly logger = new Logger(ShiftAttendanceRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  /**
   * Canonical cross-reader shift listing. Reads the shared table directly so
   * independent readers (and the same reader after a restart) see writes
   * committed by any instance, rather than one instance's local cache.
   */
  async listShifts(driverId?: string): Promise<ShiftRecord[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const result = driverId
      ? await this.databaseService!.query<JsonRecordRow>(
          `
            SELECT record
            FROM ops.phase1_driver_shifts
            WHERE driver_id = $1
            ORDER BY clock_in_at DESC
          `,
          [driverId],
        )
      : await this.databaseService!.query<JsonRecordRow>(
          `
            SELECT record
            FROM ops.phase1_driver_shifts
            ORDER BY clock_in_at DESC
          `,
        );

    return result.rows.map((row) =>
      this.parseRecord<ShiftRecord>(row.record, "ops.phase1_driver_shifts"),
    );
  }

  /** Canonical cross-reader attendance listing; see {@link listShifts}. */
  async listAttendance(driverId?: string): Promise<AttendanceRecord[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const result = driverId
      ? await this.databaseService!.query<JsonRecordRow>(
          `
            SELECT record
            FROM ops.phase1_driver_attendance
            WHERE driver_id = $1
            ORDER BY date DESC, clock_in_at DESC
          `,
          [driverId],
        )
      : await this.databaseService!.query<JsonRecordRow>(
          `
            SELECT record
            FROM ops.phase1_driver_attendance
            ORDER BY date DESC, clock_in_at DESC
          `,
        );

    return result.rows.map((row) =>
      this.parseRecord<AttendanceRecord>(
        row.record,
        "ops.phase1_driver_attendance",
      ),
    );
  }

  /** Canonical single-shift read by id; returns null when genuinely absent. */
  async getShiftById(shiftId: string): Promise<ShiftRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const result = await this.databaseService!.query<JsonRecordRow>(
      `SELECT record FROM ops.phase1_driver_shifts WHERE shift_id = $1`,
      [shiftId],
    );
    const row = result.rows[0];
    return row
      ? this.parseRecord<ShiftRecord>(row.record, "ops.phase1_driver_shifts")
      : null;
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

      let shift = await verifyEligibilityAndBuildShift();

      for (let attempt = 0; ; attempt += 1) {
        try {
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
          break;
        } catch (error) {
          if (
            this.isUniqueViolation(error) &&
            attempt < MAX_ID_ALLOCATION_ATTEMPTS
          ) {
            // Two distinct, otherwise-valid clock-in commands derived the
            // same shift_id/shift_no (e.g. two processes started with the
            // same persisted-state snapshot). Re-derive a fresh id from the
            // canonical table — by now the colliding row is either
            // committed (visible to this query) or gone — and retry instead
            // of failing the command.
            shift = { ...shift, shiftId: await this.allocateNextShiftId(client) };
            continue;
          }
          throw error;
        }
      }

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

      const { shift: updated, attendance: builtAttendance } =
        buildUpdatedShiftAndAttendance(activeShift);
      let attendance = builtAttendance;

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

      for (let attempt = 0; ; attempt += 1) {
        try {
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
          break;
        } catch (error) {
          if (
            this.isUniqueViolation(error) &&
            attempt < MAX_ID_ALLOCATION_ATTEMPTS
          ) {
            // Same collision-safety as the shift id above, applied to the
            // attendance id derived by the same clock-out call.
            attendance = {
              ...attendance,
              attendanceId: await this.allocateNextAttendanceId(client),
            };
            continue;
          }
          throw error;
        }
      }

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

  /**
   * Canonical durable abandon: locks the shift row, re-validates its current
   * status against the committed table (not a caller's cached copy), and
   * only reports success once the row+status update is committed. A shift
   * that raced to "completed"/"abandoned" via clock-out in the meantime is
   * read as terminal here and rejected — the caller never gets a success
   * ACK for a write that didn't durably happen.
   */
  async executeAbandonTransaction(
    shiftId: string,
    buildAbandonedShift: (activeShift: ShiftRecord) => ShiftRecord,
  ): Promise<ShiftRecord> {
    if (!this.isEnabled()) {
      throw new Error("DatabaseService not enabled");
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");

      const shiftRes = await client.query<JsonRecordRow>(
        `SELECT record FROM ops.phase1_driver_shifts WHERE shift_id = $1 FOR UPDATE`,
        [shiftId],
      );
      const firstRow = shiftRes.rows[0];
      if (!firstRow) {
        throw new ApiRequestError(
          HttpStatus.NOT_FOUND,
          "NOT_FOUND",
          "Shift not found.",
          { shiftId },
        );
      }

      const currentShift = this.parseRecord<ShiftRecord>(
        firstRow.record,
        "ops.phase1_driver_shifts",
      );

      if (currentShift.status !== "active") {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "SHIFT_NOT_ACTIVE",
          "Only active shifts can be abandoned.",
          { shiftId, currentStatus: currentShift.status },
        );
      }

      const updated = buildAbandonedShift(currentShift);

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
          updated.updatedAt ?? updated.clockedOutAt,
          JSON.stringify(updated),
        ],
      );

      await client.query("COMMIT");
      return updated;
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

  private isUniqueViolation(error: unknown): boolean {
    return (
      !!error &&
      typeof error === "object" &&
      (error as { code?: unknown }).code === UNIQUE_VIOLATION_CODE
    );
  }

  private async allocateNextShiftId(
    client: Awaited<ReturnType<DatabaseService["connect"]>>,
  ): Promise<string> {
    const result = await client.query<{ shift_id: string }>(
      `
        SELECT shift_id FROM ops.phase1_driver_shifts
        WHERE shift_id ~ '^SFT-[0-9]{6}$'
        ORDER BY shift_id DESC
        LIMIT 1
      `,
    );
    return this.formatSequentialId("SFT", result.rows[0]?.shift_id);
  }

  private async allocateNextAttendanceId(
    client: Awaited<ReturnType<DatabaseService["connect"]>>,
  ): Promise<string> {
    const result = await client.query<{ attendance_id: string }>(
      `
        SELECT attendance_id FROM ops.phase1_driver_attendance
        WHERE attendance_id ~ '^ATT-[0-9]{6}$'
        ORDER BY attendance_id DESC
        LIMIT 1
      `,
    );
    return this.formatSequentialId("ATT", result.rows[0]?.attendance_id);
  }

  private formatSequentialId(prefix: string, lastId: string | undefined) {
    const lastNum = lastId
      ? Number.parseInt(lastId.replace(`${prefix}-`, ""), 10)
      : 0;
    const next = Number.isInteger(lastNum) ? lastNum + 1 : 1;
    return `${prefix}-${String(next).padStart(6, "0")}`;
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }
    return record as T;
  }
}
