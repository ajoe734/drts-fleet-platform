import { Injectable, Logger, Optional } from "@nestjs/common";
import type {
  DriverLeaveQueryFilter,
  DriverLeaveRecord,
} from "./driver-leave.constants";
import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

export interface ShiftSummaryForLeave {
  shiftId: string;
  driverId: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  clockInAt: string;
  clockOutAt: string | null;
  record: Record<string, unknown>;
}

export interface MatchingSuppressionRecord {
  sourceIncidentId: string;
  driverId: string;
  active: boolean;
  reasonCode: string;
  expiresAt: string;
  liftedAt: string | null;
  record: Record<string, unknown>;
}

@Injectable()
export class DriverLeaveRepository {
  private readonly logger = new Logger(DriverLeaveRepository.name);

  // In-memory fallbacks when DatabaseService is unconfigured / disabled
  private readonly leaves = new Map<string, DriverLeaveRecord>();
  private readonly shifts = new Map<string, ShiftSummaryForLeave>();
  private readonly suppressions = new Map<string, MatchingSuppressionRecord>();

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled(): boolean {
    return this.databaseService?.isEnabled() ?? false;
  }

  seedShifts(shifts: ShiftSummaryForLeave[]) {
    for (const shift of shifts) {
      this.shifts.set(shift.shiftId, { ...shift });
    }
  }

  getMemoryShift(shiftId: string): ShiftSummaryForLeave | undefined {
    return this.shifts.get(shiftId);
  }

  getMemorySuppression(sourceId: string): MatchingSuppressionRecord | undefined {
    return this.suppressions.get(sourceId);
  }

  async save(record: DriverLeaveRecord): Promise<DriverLeaveRecord> {
    const copy = structuredClone(record);
    this.leaves.set(copy.leaveId, copy);

    if (this.isEnabled()) {
      try {
        await this.databaseService!.query(
          `
            INSERT INTO ops.phase1_driver_leave_requests (
              leave_id,
              driver_id,
              leave_type,
              start_time,
              end_time,
              reason,
              status,
              reviewed_by_principal_id,
              reviewed_at,
              review_notes,
              impacted_shift_ids,
              created_at,
              updated_at,
              record
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
            ON CONFLICT (leave_id) DO UPDATE SET
              driver_id = EXCLUDED.driver_id,
              leave_type = EXCLUDED.leave_type,
              start_time = EXCLUDED.start_time,
              end_time = EXCLUDED.end_time,
              reason = EXCLUDED.reason,
              status = EXCLUDED.status,
              reviewed_by_principal_id = EXCLUDED.reviewed_by_principal_id,
              reviewed_at = EXCLUDED.reviewed_at,
              review_notes = EXCLUDED.review_notes,
              impacted_shift_ids = EXCLUDED.impacted_shift_ids,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            copy.leaveId,
            copy.driverId,
            copy.leaveType,
            copy.startTime,
            copy.endTime,
            copy.reason,
            copy.status,
            copy.reviewedByPrincipalId,
            copy.reviewedAt,
            copy.reviewNotes,
            copy.impactedShiftIds,
            copy.createdAt,
            copy.updatedAt,
            JSON.stringify(copy),
          ],
        );
      } catch (error) {
        this.logger.error(
          `Failed to persist driver leave ${copy.leaveId} to PostgreSQL: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return copy;
  }

  async findById(leaveId: string): Promise<DriverLeaveRecord | null> {
    if (this.isEnabled()) {
      try {
        const result = await this.databaseService!.query<JsonRecordRow>(
          `
            SELECT record
            FROM ops.phase1_driver_leave_requests
            WHERE leave_id = $1
          `,
          [leaveId],
        );
        const firstRow = result.rows[0];
        if (firstRow) {
          return firstRow.record as DriverLeaveRecord;
        }
      } catch (error) {
        this.logger.error(
          `Failed to query driver leave by ID from DB: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const memory = this.leaves.get(leaveId);
    return memory ? structuredClone(memory) : null;
  }

  async findByDriver(driverId: string): Promise<DriverLeaveRecord[]> {
    if (this.isEnabled()) {
      try {
        const result = await this.databaseService!.query<JsonRecordRow>(
          `
            SELECT record
            FROM ops.phase1_driver_leave_requests
            WHERE driver_id = $1
            ORDER BY created_at DESC
          `,
          [driverId],
        );
        return result.rows.map((row) => row.record as DriverLeaveRecord);
      } catch (error) {
        this.logger.error(
          `Failed to query driver leaves by driver from DB: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const items = Array.from(this.leaves.values())
      .filter((l) => l.driverId === driverId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    return items.map((i) => structuredClone(i));
  }

  async findOverlapping(
    driverId: string,
    startTime: string,
    endTime: string,
    excludeLeaveId?: string,
  ): Promise<DriverLeaveRecord[]> {
    const startMs = new Date(startTime).getTime();
    const endMs = new Date(endTime).getTime();

    if (this.isEnabled()) {
      try {
        const result = await this.databaseService!.query<JsonRecordRow>(
          `
            SELECT record
            FROM ops.phase1_driver_leave_requests
            WHERE driver_id = $1
              AND status IN ('pending', 'approved')
              AND start_time < $3::timestamptz
              AND end_time > $2::timestamptz
              AND ($4::varchar IS NULL OR leave_id != $4)
          `,
          [driverId, startTime, endTime, excludeLeaveId ?? null],
        );
        return result.rows.map((row) => row.record as DriverLeaveRecord);
      } catch (error) {
        this.logger.error(
          `Failed to query overlapping leaves from DB: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const overlapping: DriverLeaveRecord[] = [];
    for (const l of this.leaves.values()) {
      if (l.driverId !== driverId) continue;
      if (excludeLeaveId && l.leaveId === excludeLeaveId) continue;
      if (l.status !== "pending" && l.status !== "approved") continue;

      const lStart = new Date(l.startTime).getTime();
      const lEnd = new Date(l.endTime).getTime();
      if (startMs < lEnd && endMs > lStart) {
        overlapping.push(structuredClone(l));
      }
    }

    return overlapping;
  }

  async query(filter: DriverLeaveQueryFilter): Promise<{
    items: DriverLeaveRecord[];
    total: number;
  }> {
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, filter.pageSize ?? 20));

    if (this.isEnabled()) {
      try {
        const conditions: string[] = [];
        const params: unknown[] = [];
        let paramIdx = 1;

        if (filter.driverId) {
          conditions.push(`driver_id = $${paramIdx++}`);
          params.push(filter.driverId);
        }

        if (filter.status) {
          conditions.push(`status = $${paramIdx++}`);
          params.push(filter.status);
        }

        if (filter.startTimeFrom) {
          conditions.push(`end_time >= $${paramIdx++}::timestamptz`);
          params.push(filter.startTimeFrom);
        }

        if (filter.endTimeTo) {
          conditions.push(`start_time <= $${paramIdx++}::timestamptz`);
          params.push(filter.endTimeTo);
        }

        const whereClause =
          conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        const countResult = await this.databaseService!.query<{
          count: string;
        }>(
          `
            SELECT count(*)::text AS count
            FROM ops.phase1_driver_leave_requests
            ${whereClause}
          `,
          params,
        );
        const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

        const offset = (page - 1) * pageSize;
        const dataResult = await this.databaseService!.query<JsonRecordRow>(
          `
            SELECT record
            FROM ops.phase1_driver_leave_requests
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT $${paramIdx++} OFFSET $${paramIdx++}
          `,
          [...params, pageSize, offset],
        );

        return {
          items: dataResult.rows.map((r) => r.record as DriverLeaveRecord),
          total,
        };
      } catch (error) {
        this.logger.error(
          `Failed to execute paginated query from DB: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    let items = Array.from(this.leaves.values());

    if (filter.driverId) {
      items = items.filter((l) => l.driverId === filter.driverId);
    }
    if (filter.status) {
      items = items.filter((l) => l.status === filter.status);
    }
    if (filter.startTimeFrom) {
      const fromMs = new Date(filter.startTimeFrom).getTime();
      items = items.filter((l) => new Date(l.endTime).getTime() >= fromMs);
    }
    if (filter.endTimeTo) {
      const toMs = new Date(filter.endTimeTo).getTime();
      items = items.filter((l) => new Date(l.startTime).getTime() <= toMs);
    }

    items.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const total = items.length;
    const offset = (page - 1) * pageSize;
    const paginated = items.slice(offset, offset + pageSize);

    return {
      items: paginated.map((i) => structuredClone(i)),
      total,
    };
  }

  async annotateOverlappingShifts(
    driverId: string,
    leaveId: string,
    startTime: string,
    endTime: string,
  ): Promise<string[]> {
    const impactedShiftIds: string[] = [];
    const leaveStartMs = new Date(startTime).getTime();
    const leaveEndMs = new Date(endTime).getTime();

    // 1. In-memory check and annotation
    for (const shift of this.shifts.values()) {
      if (shift.driverId !== driverId) continue;

      let shiftStartMs: number;
      let shiftEndMs: number;

      if (shift.scheduledStart && shift.scheduledEnd) {
        shiftStartMs = new Date(shift.scheduledStart).getTime();
        shiftEndMs = new Date(shift.scheduledEnd).getTime();
      } else {
        shiftStartMs = new Date(shift.clockInAt).getTime();
        shiftEndMs = shift.clockOutAt
          ? new Date(shift.clockOutAt).getTime()
          : shiftStartMs + 8 * 60 * 60 * 1000;
      }

      // Check overlap: scheduled_start < leaveEnd && scheduled_end > leaveStart
      if (shiftStartMs < leaveEndMs && shiftEndMs > leaveStartMs) {
        impactedShiftIds.push(shift.shiftId);
        shift.record = {
          ...shift.record,
          leaveReassigned: true,
          reassignedReason: "DRIVER_ON_LEAVE",
          leaveId,
        };
      }
    }

    // 2. Database update if enabled
    if (this.isEnabled()) {
      try {
        const selectResult = await this.databaseService!.query<{
          shift_id: string;
          record: unknown;
        }>(
          `
            SELECT shift_id, record
            FROM ops.phase1_driver_shifts
            WHERE driver_id = $1
              AND (
                (scheduled_start IS NOT NULL AND scheduled_end IS NOT NULL AND scheduled_start < $3::timestamptz AND scheduled_end > $2::timestamptz)
                OR (scheduled_start IS NULL AND clock_in_at < $3::timestamptz AND (clock_out_at IS NULL OR clock_out_at > $2::timestamptz))
              )
          `,
          [driverId, startTime, endTime],
        );

        for (const row of selectResult.rows) {
          if (!impactedShiftIds.includes(row.shift_id)) {
            impactedShiftIds.push(row.shift_id);
          }

          const existingRecord =
            typeof row.record === "object" && row.record !== null
              ? (row.record as Record<string, unknown>)
              : {};

          const updatedRecord = {
            ...existingRecord,
            leaveReassigned: true,
            reassignedReason: "DRIVER_ON_LEAVE",
            leaveId,
          };

          await this.databaseService!.query(
            `
              UPDATE ops.phase1_driver_shifts
              SET record = $1::jsonb,
                  updated_at = now()
              WHERE shift_id = $2
            `,
            [JSON.stringify(updatedRecord), row.shift_id],
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to annotate shifts in database: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return impactedShiftIds;
  }

  async upsertMatchingSuppression(
    driverId: string,
    leaveId: string,
    startTime: string,
    endTime: string,
  ): Promise<void> {
    const sourceKey = leaveId;
    const suppression: MatchingSuppressionRecord = {
      sourceIncidentId: sourceKey,
      driverId,
      active: true,
      reasonCode: "DRIVER_ON_LEAVE",
      expiresAt: endTime,
      liftedAt: null,
      record: {
        driverId,
        reason: "DRIVER_ON_LEAVE",
        leaveId,
        effectiveStart: startTime,
        effectiveEnd: endTime,
      },
    };

    this.suppressions.set(sourceKey, suppression);

    if (this.isEnabled()) {
      try {
        await this.databaseService!.query(
          `
            INSERT INTO ops.phase1_driver_matching_suppressions (
              source_incident_id,
              driver_id,
              active,
              reason_code,
              expires_at,
              lifted_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, true, 'DRIVER_ON_LEAVE', $3::timestamptz, null, now(), $4::jsonb
            )
            ON CONFLICT (source_incident_id) DO UPDATE SET
              driver_id = EXCLUDED.driver_id,
              active = EXCLUDED.active,
              reason_code = EXCLUDED.reason_code,
              expires_at = EXCLUDED.expires_at,
              lifted_at = EXCLUDED.lifted_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            sourceKey,
            driverId,
            endTime,
            JSON.stringify(suppression.record),
          ],
        );
      } catch (error) {
        this.logger.error(
          `Failed to upsert matching suppression in DB: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
}
