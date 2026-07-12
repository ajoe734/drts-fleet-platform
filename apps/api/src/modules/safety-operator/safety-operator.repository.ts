import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  SafetyOperatorAssignment,
  SafetyOperatorPreTripChecklist,
  SafetyOperatorShift,
  SafetyOperatorTakeoverReport,
  SafetyOperatorTripCloseout,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type AssignmentRow = {
  assignment_id: string;
  safety_operator_id: string;
  vehicle_id: string;
  order_id: string | null;
  status: SafetyOperatorAssignment["status"];
  assigned_at: Date | string;
  released_at: Date | string | null;
  sandbox_program_id: string;
};

type JsonRecordRow = {
  record: unknown;
};

export interface SafetyOperatorRepositoryState {
  assignments: SafetyOperatorAssignment[];
  shifts: SafetyOperatorShift[];
  checklists: SafetyOperatorPreTripChecklist[];
  takeoverReports: SafetyOperatorTakeoverReport[];
  tripCloseouts: SafetyOperatorTripCloseout[];
}

@Injectable()
export class SafetyOperatorRepository {
  private readonly logger = new Logger(SafetyOperatorRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadState(): Promise<SafetyOperatorRepositoryState> {
    if (!this.isEnabled()) {
      return this.emptyState();
    }

    try {
      const [assignments, shifts, checklists, takeoverReports, tripCloseouts] =
        await Promise.all([
          this.loadAssignments(),
          this.loadJsonRecords<SafetyOperatorShift>(
            "av_sandbox.safety_operator_shifts",
          ),
          this.loadJsonRecords<SafetyOperatorPreTripChecklist>(
            "av_sandbox.safety_operator_pre_trip_checklists",
          ),
          this.loadJsonRecords<SafetyOperatorTakeoverReport>(
            "av_sandbox.safety_operator_takeover_reports",
          ),
          this.loadJsonRecords<SafetyOperatorTripCloseout>(
            "av_sandbox.safety_operator_trip_closeouts",
          ),
        ]);

      return {
        assignments,
        shifts,
        checklists,
        takeoverReports,
        tripCloseouts,
      };
    } catch (error) {
      this.reportPersistenceFailure(error, "loadState");
      return this.emptyState();
    }
  }

  async saveAssignment(
    assignment: SafetyOperatorAssignment,
  ): Promise<SafetyOperatorAssignment> {
    if (!this.isEnabled()) {
      return assignment;
    }

    try {
      const result = await this.databaseService!.query<AssignmentRow>(
        `
          INSERT INTO av_sandbox.safety_operator_assignments (
            assignment_id,
            safety_operator_id,
            vehicle_id,
            order_id,
            status,
            assigned_at,
            released_at,
            sandbox_program_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (assignment_id) DO UPDATE SET
            safety_operator_id = EXCLUDED.safety_operator_id,
            vehicle_id = EXCLUDED.vehicle_id,
            order_id = EXCLUDED.order_id,
            status = EXCLUDED.status,
            assigned_at = EXCLUDED.assigned_at,
            released_at = EXCLUDED.released_at,
            sandbox_program_id = EXCLUDED.sandbox_program_id
          RETURNING
            assignment_id,
            safety_operator_id,
            vehicle_id,
            order_id,
            status,
            assigned_at,
            released_at,
            sandbox_program_id
        `,
        [
          assignment.assignmentId,
          assignment.safetyOperatorId,
          assignment.vehicleId,
          assignment.orderId,
          assignment.status,
          assignment.assignedAt,
          assignment.releasedAt,
          assignment.sandboxProgramId,
        ],
      );

      return this.mapAssignmentRow(result.rows[0]!);
    } catch (error) {
      this.reportPersistenceFailure(error, "saveAssignment");
      return assignment;
    }
  }

  async saveShift(shift: SafetyOperatorShift): Promise<SafetyOperatorShift> {
    return this.saveJsonRecord(
      "av_sandbox.safety_operator_shifts",
      "shift_id",
      shift.shiftId,
      shift,
      `
        safety_operator_id,
        sandbox_program_id,
        device_id,
        vehicle_id,
        assignment_id,
        status,
        started_at,
        ended_at,
        start_location,
        end_location,
        notes,
        record
      `,
      [
        shift.safetyOperatorId,
        shift.sandboxProgramId,
        shift.deviceId,
        shift.vehicleId,
        shift.assignmentId,
        shift.status,
        shift.startedAt,
        shift.endedAt,
        shift.startLocation ? JSON.stringify(shift.startLocation) : null,
        shift.endLocation ? JSON.stringify(shift.endLocation) : null,
        shift.notes,
      ],
      "saveShift",
    );
  }

  async savePreTripChecklist(
    checklist: SafetyOperatorPreTripChecklist,
  ): Promise<SafetyOperatorPreTripChecklist> {
    return this.saveJsonRecord(
      "av_sandbox.safety_operator_pre_trip_checklists",
      "checklist_id",
      checklist.checklistId,
      checklist,
      `
        shift_id,
        assignment_id,
        safety_operator_id,
        vehicle_id,
        completed_at,
        all_passed,
        blocker_codes,
        items,
        notes,
        record
      `,
      [
        checklist.shiftId,
        checklist.assignmentId,
        checklist.safetyOperatorId,
        checklist.vehicleId,
        checklist.completedAt,
        checklist.allPassed,
        JSON.stringify(checklist.blockerCodes),
        JSON.stringify(checklist.items),
        checklist.notes,
      ],
      "savePreTripChecklist",
    );
  }

  async saveTakeoverReport(
    report: SafetyOperatorTakeoverReport,
  ): Promise<SafetyOperatorTakeoverReport> {
    if (!this.isEnabled()) {
      return report;
    }

    try {
      const result = await this.databaseService!.query<JsonRecordRow>(
        `
          INSERT INTO av_sandbox.safety_operator_takeover_reports (
            report_id,
            client_generated_report_id,
            safety_operator_id,
            vehicle_id,
            order_id,
            sandbox_program_id,
            shift_id,
            assignment_id,
            correlation_id,
            trigger,
            reason_code,
            disposition,
            fsd_resumed,
            bookmark_id,
            incident_id,
            evidence_artifact_ids,
            notes,
            occurred_at,
            server_received_at,
            record
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16::jsonb, $17, $18, $19, $20::jsonb
          )
          ON CONFLICT (client_generated_report_id) DO UPDATE SET
            client_generated_report_id = EXCLUDED.client_generated_report_id
          RETURNING record
        `,
        [
          report.reportId,
          report.clientGeneratedReportId,
          report.safetyOperatorId,
          report.vehicleId,
          report.orderId,
          report.sandboxProgramId,
          report.shiftId,
          report.assignmentId,
          report.correlationId,
          report.trigger,
          report.reasonCode,
          report.disposition,
          report.fsdResumed,
          report.bookmarkId,
          report.incidentId,
          JSON.stringify(report.evidenceArtifactIds),
          report.notes,
          report.occurredAt,
          report.serverReceivedAt,
          JSON.stringify(report),
        ],
      );

      return this.parseJsonRecord<SafetyOperatorTakeoverReport>(
        result.rows[0]!.record,
      );
    } catch (error) {
      this.reportPersistenceFailure(error, "saveTakeoverReport");
      return report;
    }
  }

  async saveTripCloseout(
    closeout: SafetyOperatorTripCloseout,
  ): Promise<SafetyOperatorTripCloseout> {
    return this.saveJsonRecord(
      "av_sandbox.safety_operator_trip_closeouts",
      "closeout_id",
      closeout.closeoutId,
      closeout,
      `
        assignment_id,
        shift_id,
        safety_operator_id,
        vehicle_id,
        order_id,
        closeout_status,
        closeout_at,
        takeover_report_ids,
        incident_id,
        evidence_artifact_ids,
        notes,
        record
      `,
      [
        closeout.assignmentId,
        closeout.shiftId,
        closeout.safetyOperatorId,
        closeout.vehicleId,
        closeout.orderId,
        closeout.closeoutStatus,
        closeout.closeoutAt,
        JSON.stringify(closeout.takeoverReportIds),
        closeout.incidentId,
        JSON.stringify(closeout.evidenceArtifactIds),
        closeout.notes,
      ],
      "saveTripCloseout",
    );
  }

  reportPersistenceFailure(error: unknown, context: string) {
    this.logger.warn(
      `Safety-operator persistence failed during ${context}: ${error}`,
    );
  }

  private emptyState(): SafetyOperatorRepositoryState {
    return {
      assignments: [],
      shifts: [],
      checklists: [],
      takeoverReports: [],
      tripCloseouts: [],
    };
  }

  private async loadAssignments(): Promise<SafetyOperatorAssignment[]> {
    const result = await this.databaseService!.query<AssignmentRow>(
      `
        SELECT
          assignment_id,
          safety_operator_id,
          vehicle_id,
          order_id,
          status,
          assigned_at,
          released_at,
          sandbox_program_id
        FROM av_sandbox.safety_operator_assignments
        ORDER BY assigned_at DESC
      `,
    );

    return result.rows.map((row) => this.mapAssignmentRow(row));
  }

  private async loadJsonRecords<T>(tableName: string): Promise<T[]> {
    const result = await this.databaseService!.query<JsonRecordRow>(
      `SELECT record FROM ${tableName} ORDER BY created_at DESC`,
    );

    return result.rows.map((row) => this.parseJsonRecord<T>(row.record));
  }

  private async saveJsonRecord<T>(
    tableName: string,
    idColumn: string,
    idValue: string,
    record: T,
    columnsSql: string,
    values: readonly unknown[],
    context: string,
  ): Promise<T> {
    if (!this.isEnabled()) {
      return record;
    }

    const valuePlaceholders = values
      .map((_, index) => `$${index + 2}`)
      .join(", ");
    const updateAssignments = columnsSql
      .split(",")
      .map((column) => column.trim())
      .filter((column) => column !== "record")
      .map((column) => `${column} = EXCLUDED.${column}`)
      .concat("record = EXCLUDED.record", "updated_at = now()")
      .join(",\n            ");

    try {
      const result = await this.databaseService!.query<JsonRecordRow>(
        `
          INSERT INTO ${tableName} (
            ${idColumn},
            ${columnsSql}
          ) VALUES (
            $1,
            ${valuePlaceholders},
            $${values.length + 2}::jsonb
          )
          ON CONFLICT (${idColumn}) DO UPDATE SET
            ${updateAssignments}
          RETURNING record
        `,
        [idValue, ...values, JSON.stringify(record)],
      );

      return this.parseJsonRecord<T>(result.rows[0]!.record);
    } catch (error) {
      this.reportPersistenceFailure(error, context);
      return record;
    }
  }

  private mapAssignmentRow(row: AssignmentRow): SafetyOperatorAssignment {
    return {
      assignmentId: row.assignment_id,
      safetyOperatorId: row.safety_operator_id,
      vehicleId: row.vehicle_id,
      orderId: row.order_id,
      status: row.status,
      assignedAt: this.toIso(row.assigned_at)!,
      releasedAt: this.toIso(row.released_at),
      sandboxProgramId: row.sandbox_program_id,
    };
  }

  private parseJsonRecord<T>(record: unknown): T {
    if (!record || typeof record !== "object") {
      throw new Error("Expected JSON object record.");
    }

    return record as T;
  }

  private toIso(value: Date | string | null): string | null {
    if (value == null) {
      return null;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    return new Date(value).toISOString();
  }
}
