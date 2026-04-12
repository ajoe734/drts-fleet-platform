import { Injectable, Logger, Optional } from "@nestjs/common";

import type { MaintenanceLogRecord } from "./maintenance.types";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

type PersistMaintenanceChanges = {
  records?: readonly MaintenanceLogRecord[];
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
        this.parseRecord<MaintenanceLogRecord>(
          row.record,
          "ops.phase1_maintenance_logs",
        ),
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
            record.logId,
            record.vehicleId,
            record.vehicleRegNo ?? null,
            record.status,
            record.maintenanceType,
            record.description,
            record.recordedBy ?? null,
            record.costAmount ?? null,
            record.createdAt,
            record.updatedAt,
            JSON.stringify(record),
          ],
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

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }
    return record as T;
  }
}
