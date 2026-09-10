import { HttpStatus, Injectable, Logger, Optional } from "@nestjs/common";
import { ApiRequestError } from "../../common/api-envelope";
import { isDriverIdentityMatching } from "../../common/auth";
import {
  DRIVER_LEAVE_ERROR_CODES,
  type DriverLeaveQueryFilter,
  type DriverLeaveRecord,
  type ReviewDriverLeaveCommand,
  type WithdrawDriverLeaveCommand,
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

  // In-memory fallbacks ONLY when DatabaseService is unconfigured / disabled
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

  async withTransaction<T>(
    work: (executor: { query: DatabaseService["query"] }) => Promise<T>,
  ): Promise<T> {
    if (!this.isEnabled()) {
      throw new Error("DatabaseService is not enabled");
    }

    if (typeof this.databaseService?.connect === "function") {
      const client = await this.databaseService.connect();
      try {
        await client.query("BEGIN");
        const result = await work(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // ignore rollback error
        }
        throw error;
      } finally {
        client.release();
      }
    } else {
      return work(this.databaseService!);
    }
  }

  async save(record: DriverLeaveRecord): Promise<DriverLeaveRecord> {
    if (this.isEnabled()) {
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
          record.leaveId,
          record.driverId,
          record.leaveType,
          record.startTime,
          record.endTime,
          record.reason,
          record.status,
          record.reviewedByPrincipalId,
          record.reviewedAt,
          record.reviewNotes,
          record.impactedShiftIds,
          record.createdAt,
          record.updatedAt,
          JSON.stringify(record),
        ],
      );
      return structuredClone(record);
    }

    // In-memory fallback ONLY when DB is disabled
    const copy = structuredClone(record);
    this.leaves.set(copy.leaveId, copy);
    return copy;
  }

  async findById(leaveId: string): Promise<DriverLeaveRecord | null> {
    if (this.isEnabled()) {
      const result = await this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM ops.phase1_driver_leave_requests
          WHERE leave_id = $1
        `,
        [leaveId],
      );
      const firstRow = result.rows[0];
      return firstRow ? (firstRow.record as DriverLeaveRecord) : null;
    }

    const memory = this.leaves.get(leaveId);
    return memory ? structuredClone(memory) : null;
  }

  async findByDriver(driverId: string): Promise<DriverLeaveRecord[]> {
    if (this.isEnabled()) {
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
    executor?: { query: DatabaseService["query"] },
  ): Promise<string[]> {
    const impactedShiftIds: string[] = [];
    const leaveStartMs = new Date(startTime).getTime();
    const leaveEndMs = new Date(endTime).getTime();

    if (this.isEnabled()) {
      const db = executor ?? this.databaseService!;
      const selectResult = await db.query<{
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

        await db.query(
          `
            UPDATE ops.phase1_driver_shifts
            SET record = $1::jsonb,
                updated_at = now()
            WHERE shift_id = $2
          `,
          [JSON.stringify(updatedRecord), row.shift_id],
        );
      }

      return impactedShiftIds;
    }

    // In-memory check and annotation ONLY when DB is disabled
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

    return impactedShiftIds;
  }

  async upsertMatchingSuppression(
    driverId: string,
    leaveId: string,
    startTime: string,
    endTime: string,
    executor?: { query: DatabaseService["query"] },
  ): Promise<void> {
    const sourceKey = leaveId;
    const suppressionRecord = {
      driverId,
      reason: "DRIVER_ON_LEAVE",
      leaveId,
      effectiveStart: startTime,
      effectiveEnd: endTime,
    };

    if (this.isEnabled()) {
      const db = executor ?? this.databaseService!;
      await db.query(
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
          JSON.stringify(suppressionRecord),
        ],
      );
      return;
    }

    // In-memory fallback ONLY when DB is disabled
    this.suppressions.set(sourceKey, {
      sourceIncidentId: sourceKey,
      driverId,
      active: true,
      reasonCode: "DRIVER_ON_LEAVE",
      expiresAt: endTime,
      liftedAt: null,
      record: suppressionRecord,
    });
  }

  async withdrawLeave(
    leaveId: string,
    actorDriverId: string,
    command?: WithdrawDriverLeaveCommand,
    now?: Date,
  ): Promise<DriverLeaveRecord> {
    const current = now ?? new Date();
    const nowIso = current.toISOString();

    if (this.isEnabled()) {
      return this.withTransaction(async (executor) => {
        const selectResult = await executor.query<JsonRecordRow>(
          `
            SELECT record
            FROM ops.phase1_driver_leave_requests
            WHERE leave_id = $1
            FOR UPDATE
          `,
          [leaveId],
        );

        const existingRow = selectResult.rows[0];
        if (!existingRow) {
          throw new ApiRequestError(
            HttpStatus.NOT_FOUND,
            DRIVER_LEAVE_ERROR_CODES.LEAVE_NOT_FOUND,
            `Leave request ${leaveId} not found.`,
            { leaveId },
          );
        }

        const leave = existingRow.record as DriverLeaveRecord;

        if (!isDriverIdentityMatching(actorDriverId, leave.driverId)) {
          throw new ApiRequestError(
            HttpStatus.FORBIDDEN,
            DRIVER_LEAVE_ERROR_CODES.LEAVE_FORBIDDEN_ACCESS,
            "Driver may only withdraw their own leave requests.",
            { actorDriverId, leaveDriverId: leave.driverId },
          );
        }

        if (leave.status !== "pending") {
          throw new ApiRequestError(
            HttpStatus.CONFLICT,
            DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_STATE_TRANSITION,
            `Cannot withdraw leave request in '${leave.status}' state. Only 'pending' leave requests can be withdrawn.`,
            { leaveId, currentStatus: leave.status },
          );
        }

        const updatedRecord: DriverLeaveRecord = {
          ...leave,
          status: "withdrawn",
          updatedAt: nowIso,
          reviewNotes: command?.reason?.trim()
            ? `Withdrawn by driver: ${command.reason.trim()}`
            : leave.reviewNotes,
        };

        const updateResult = await executor.query<JsonRecordRow>(
          `
            UPDATE ops.phase1_driver_leave_requests
            SET status = $2,
                review_notes = $3,
                updated_at = $4,
                record = $5::jsonb
            WHERE leave_id = $1 AND status = 'pending'
            RETURNING record
          `,
          [
            leaveId,
            updatedRecord.status,
            updatedRecord.reviewNotes,
            updatedRecord.updatedAt,
            JSON.stringify(updatedRecord),
          ],
        );

        if (updateResult.rows.length === 0) {
          throw new ApiRequestError(
            HttpStatus.CONFLICT,
            DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_STATE_TRANSITION,
            `Cannot withdraw leave request in '${leave.status}' state. Only 'pending' leave requests can be withdrawn.`,
            { leaveId, currentStatus: leave.status },
          );
        }

        return updateResult.rows[0]!.record as DriverLeaveRecord;
      });
    }

    // In-memory fallback ONLY when DB is disabled
    const leave = this.leaves.get(leaveId);
    if (!leave) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        DRIVER_LEAVE_ERROR_CODES.LEAVE_NOT_FOUND,
        `Leave request ${leaveId} not found.`,
        { leaveId },
      );
    }

    if (!isDriverIdentityMatching(actorDriverId, leave.driverId)) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        DRIVER_LEAVE_ERROR_CODES.LEAVE_FORBIDDEN_ACCESS,
        "Driver may only withdraw their own leave requests.",
        { actorDriverId, leaveDriverId: leave.driverId },
      );
    }

    if (leave.status !== "pending") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_STATE_TRANSITION,
        `Cannot withdraw leave request in '${leave.status}' state. Only 'pending' leave requests can be withdrawn.`,
        { leaveId, currentStatus: leave.status },
      );
    }

    // CAS: update status immediately
    leave.status = "withdrawn";
    leave.updatedAt = nowIso;
    if (command?.reason?.trim()) {
      leave.reviewNotes = `Withdrawn by driver: ${command.reason.trim()}`;
    }

    return structuredClone(leave);
  }

  async reviewLeave(
    leaveId: string,
    reviewerPrincipalId: string,
    command: ReviewDriverLeaveCommand,
    now?: Date,
  ): Promise<DriverLeaveRecord> {
    if (
      !command ||
      (command.decision !== "approve" && command.decision !== "reject")
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        DRIVER_LEAVE_ERROR_CODES.LEAVE_MISSING_REQUIRED_FIELDS,
        "Review decision must be 'approve' or 'reject'.",
      );
    }

    const current = now ?? new Date();
    const nowIso = current.toISOString();

    if (this.isEnabled()) {
      return this.withTransaction(async (executor) => {
        const selectResult = await executor.query<JsonRecordRow>(
          `
            SELECT record
            FROM ops.phase1_driver_leave_requests
            WHERE leave_id = $1
            FOR UPDATE
          `,
          [leaveId],
        );

        const existingRow = selectResult.rows[0];
        if (!existingRow) {
          throw new ApiRequestError(
            HttpStatus.NOT_FOUND,
            DRIVER_LEAVE_ERROR_CODES.LEAVE_NOT_FOUND,
            `Leave request ${leaveId} not found.`,
            { leaveId },
          );
        }

        const leave = existingRow.record as DriverLeaveRecord;

        if (leave.status !== "pending") {
          throw new ApiRequestError(
            HttpStatus.CONFLICT,
            DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_STATE_TRANSITION,
            `Cannot review leave request in '${leave.status}' state. Only 'pending' leave requests can be reviewed.`,
            { leaveId, currentStatus: leave.status },
          );
        }

        let impactedShiftIds: string[] = [];

        if (command.decision === "reject") {
          const updatedRecord: DriverLeaveRecord = {
            ...leave,
            status: "rejected",
            reviewedByPrincipalId: reviewerPrincipalId,
            reviewedAt: nowIso,
            reviewNotes: command.reviewNotes?.trim() || null,
            impactedShiftIds: [],
            updatedAt: nowIso,
          };

          const updateResult = await executor.query<JsonRecordRow>(
            `
              UPDATE ops.phase1_driver_leave_requests
              SET status = $2,
                  reviewed_by_principal_id = $3,
                  reviewed_at = $4,
                  review_notes = $5,
                  impacted_shift_ids = $6,
                  updated_at = $7,
                  record = $8::jsonb
              WHERE leave_id = $1 AND status = 'pending'
              RETURNING record
            `,
            [
              leaveId,
              updatedRecord.status,
              updatedRecord.reviewedByPrincipalId,
              updatedRecord.reviewedAt,
              updatedRecord.reviewNotes,
              updatedRecord.impactedShiftIds,
              updatedRecord.updatedAt,
              JSON.stringify(updatedRecord),
            ],
          );

          if (updateResult.rows.length === 0) {
            throw new ApiRequestError(
              HttpStatus.CONFLICT,
              DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_STATE_TRANSITION,
              `Cannot review leave request in '${leave.status}' state. Only 'pending' leave requests can be reviewed.`,
              { leaveId, currentStatus: leave.status },
            );
          }

          return updateResult.rows[0]!.record as DriverLeaveRecord;
        }

        // Decision is "approve"
        // 1. Link and annotate overlapping shifts in the same transaction
        impactedShiftIds = await this.annotateOverlappingShifts(
          leave.driverId,
          leave.leaveId,
          leave.startTime,
          leave.endTime,
          executor,
        );

        // 2. Link matching suppression in the same transaction
        await this.upsertMatchingSuppression(
          leave.driverId,
          leave.leaveId,
          leave.startTime,
          leave.endTime,
          executor,
        );

        const updatedRecord: DriverLeaveRecord = {
          ...leave,
          status: "approved",
          reviewedByPrincipalId: reviewerPrincipalId,
          reviewedAt: nowIso,
          reviewNotes: command.reviewNotes?.trim() || null,
          impactedShiftIds,
          updatedAt: nowIso,
        };

        const updateResult = await executor.query<JsonRecordRow>(
          `
            UPDATE ops.phase1_driver_leave_requests
            SET status = $2,
                reviewed_by_principal_id = $3,
                reviewed_at = $4,
                review_notes = $5,
                impacted_shift_ids = $6,
                updated_at = $7,
                record = $8::jsonb
            WHERE leave_id = $1 AND status = 'pending'
            RETURNING record
          `,
          [
            leaveId,
            updatedRecord.status,
            updatedRecord.reviewedByPrincipalId,
            updatedRecord.reviewedAt,
            updatedRecord.reviewNotes,
            updatedRecord.impactedShiftIds,
            updatedRecord.updatedAt,
            JSON.stringify(updatedRecord),
          ],
        );

        if (updateResult.rows.length === 0) {
          throw new ApiRequestError(
            HttpStatus.CONFLICT,
            DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_STATE_TRANSITION,
            `Cannot review leave request in '${leave.status}' state. Only 'pending' leave requests can be reviewed.`,
            { leaveId, currentStatus: leave.status },
          );
        }

        return updateResult.rows[0]!.record as DriverLeaveRecord;
      });
    }

    // In-memory fallback ONLY when DB is disabled
    const leave = this.leaves.get(leaveId);
    if (!leave) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        DRIVER_LEAVE_ERROR_CODES.LEAVE_NOT_FOUND,
        `Leave request ${leaveId} not found.`,
        { leaveId },
      );
    }

    if (leave.status !== "pending") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        DRIVER_LEAVE_ERROR_CODES.LEAVE_INVALID_STATE_TRANSITION,
        `Cannot review leave request in '${leave.status}' state. Only 'pending' leave requests can be reviewed.`,
        { leaveId, currentStatus: leave.status },
      );
    }

    // CAS: transition status synchronously so any concurrent operation sees it immediately!
    const decision = command.decision;
    leave.status = decision === "approve" ? "approved" : "rejected";
    leave.reviewedByPrincipalId = reviewerPrincipalId;
    leave.reviewedAt = nowIso;
    leave.reviewNotes = command.reviewNotes?.trim() || null;
    leave.updatedAt = nowIso;

    if (decision === "reject") {
      leave.impactedShiftIds = [];
      return structuredClone(leave);
    }

    // Decision is "approve": annotate shifts and matching suppression in memory
    const impactedShiftIds = await this.annotateOverlappingShifts(
      leave.driverId,
      leave.leaveId,
      leave.startTime,
      leave.endTime,
    );
    leave.impactedShiftIds = impactedShiftIds;

    await this.upsertMatchingSuppression(
      leave.driverId,
      leave.leaveId,
      leave.startTime,
      leave.endTime,
    );

    return structuredClone(leave);
  }
}
