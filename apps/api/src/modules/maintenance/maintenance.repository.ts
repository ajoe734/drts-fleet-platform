import { Injectable, Logger, Optional } from "@nestjs/common";

import { MAINTENANCE_TYPE_VALUES } from "./maintenance.types";
import type {
  MaintenanceLogRecord,
  MaintenanceType,
} from "./maintenance.types";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

type PersistMaintenanceChanges = {
  records?: readonly MaintenanceLogRecord[];
  deletedIds?: readonly string[];
};

@Injectable()
export class MaintenanceRepository {
  private readonly logger = new Logger(MaintenanceRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadState(): Promise<{ records: MaintenanceLogRecord[] }> {
    if (!this.isEnabled()) {
      return { records: [] };
    }

    const result = await this.databaseService!.query<JsonRecordRow>(
      `SELECT record FROM ops.phase1_maintenance_logs ORDER BY created_at DESC`,
    );

    return {
      records: result.rows.map((row) =>
        this.normalizeLoadedRecord(row.record, "ops.phase1_maintenance_logs"),
      ),
    };
  }

  async persistChanges(changes: PersistMaintenanceChanges) {
    if (!this.isEnabled()) {
      return;
    }

    const writes: Promise<unknown>[] = [];

    for (const record of changes.records ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO ops.phase1_maintenance_logs (
              log_id, vehicle_id, vehicle_reg_no, status, maintenance_type,
              description, recorded_by, cost_amount,
              created_at, updated_at, record
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
            ON CONFLICT (log_id) DO UPDATE SET
              vehicle_id = EXCLUDED.vehicle_id,
              vehicle_reg_no = EXCLUDED.vehicle_reg_no,
              status = EXCLUDED.status,
              maintenance_type = EXCLUDED.maintenance_type,
              description = EXCLUDED.description,
              recorded_by = EXCLUDED.recorded_by,
              cost_amount = EXCLUDED.cost_amount,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            record.maintenanceId,
            record.vehicleId,
            null,
            record.status,
            record.type,
            record.description,
            record.technician ?? null,
            record.cost ?? null,
            record.createdAt,
            record.updatedAt,
            JSON.stringify(record),
          ],
        ),
      );
    }

    for (const maintenanceId of changes.deletedIds ?? []) {
      writes.push(
        this.databaseService!.query(
          `DELETE FROM ops.phase1_maintenance_logs WHERE log_id = $1`,
          [maintenanceId],
        ),
      );
    }

    await Promise.all(writes);
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Maintenance persistence skipped during ${context}: ${detail}`,
    );
  }

  private normalizeLoadedRecord(
    record: unknown,
    source: string,
  ): MaintenanceLogRecord {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }

    const candidate = record as Record<string, unknown>;

    if (typeof candidate.maintenanceId === "string") {
      return candidate as unknown as MaintenanceLogRecord;
    }

    if (typeof candidate.logId !== "string") {
      throw new Error(`Unknown maintenance record shape loaded from ${source}`);
    }

    return {
      maintenanceId: candidate.logId,
      vehicleId: this.asString(candidate.vehicleId),
      type: this.mapLegacyType(candidate.maintenanceType),
      description: this.asString(candidate.description),
      status: this.mapLegacyStatus(candidate.status),
      scheduledAt: this.asNullableString(candidate.scheduledDate),
      completedAt: this.asNullableString(candidate.completedDate),
      technician: null,
      cost:
        typeof candidate.costAmount === "number" ? candidate.costAmount : null,
      notes: this.asNullableString(candidate.notes),
      createdAt: this.asString(candidate.createdAt),
      updatedAt: this.asString(candidate.updatedAt),
    };
  }

  private mapLegacyType(value: unknown): MaintenanceType {
    if (typeof value !== "string") {
      return "other";
    }

    const mapped =
      value === "routine"
        ? "scheduled_service"
        : value === "engine" || value === "electrical" || value === "body_work"
          ? "other"
          : value;

    return MAINTENANCE_TYPE_VALUES.includes(mapped as MaintenanceType)
      ? (mapped as MaintenanceType)
      : "other";
  }

  private mapLegacyStatus(value: unknown): MaintenanceLogRecord["status"] {
    return value === "scheduled" ||
      value === "in_progress" ||
      value === "completed" ||
      value === "cancelled" ||
      value === "overdue"
      ? value
      : "scheduled";
  }

  private asString(value: unknown): string {
    if (typeof value !== "string") {
      throw new Error("Expected persisted maintenance field to be a string");
    }
    return value;
  }

  private asNullableString(value: unknown): string | null {
    return typeof value === "string" ? value : null;
  }
}
