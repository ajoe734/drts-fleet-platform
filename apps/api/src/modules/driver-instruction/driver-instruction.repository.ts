import { Injectable, Logger, Optional } from "@nestjs/common";

import { DatabaseService } from "../../common/db";
import type { PersistedDriverInstructionRecord } from "./driver-instruction.service";

type JsonRecordRow = {
  record: unknown;
};

@Injectable()
export class DriverInstructionRepository {
  private readonly logger = new Logger(DriverInstructionRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadAll(): Promise<PersistedDriverInstructionRecord[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const result = await this.databaseService!.query<JsonRecordRow>(
      `
        SELECT record
        FROM ops.phase1_driver_ops_instructions
        ORDER BY issued_at DESC
      `,
    );

    return result.rows.map((row) =>
      this.parseRecord<PersistedDriverInstructionRecord>(
        row.record,
        "ops.phase1_driver_ops_instructions",
      ),
    );
  }

  async upsert(record: PersistedDriverInstructionRecord) {
    if (!this.isEnabled()) {
      return;
    }

    await this.databaseService!.query(
      `
        INSERT INTO ops.phase1_driver_ops_instructions (
          instruction_id,
          driver_id,
          task_id,
          issued_at,
          expires_at,
          acknowledged_at,
          updated_at,
          record
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        ON CONFLICT (instruction_id) DO UPDATE SET
          driver_id = EXCLUDED.driver_id,
          task_id = EXCLUDED.task_id,
          issued_at = EXCLUDED.issued_at,
          expires_at = EXCLUDED.expires_at,
          acknowledged_at = EXCLUDED.acknowledged_at,
          updated_at = EXCLUDED.updated_at,
          record = EXCLUDED.record
      `,
      [
        record.instructionId,
        record.driverId,
        record.taskId,
        record.issuedAt,
        record.expiresAt,
        record.acknowledgedAt,
        record.updatedAt,
        JSON.stringify(record),
      ],
    );
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Driver ops instruction persistence skipped during ${context}: ${detail}`,
    );
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }

    return record as T;
  }
}
