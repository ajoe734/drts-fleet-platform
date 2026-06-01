import { Injectable, Logger, Optional } from "@nestjs/common";

import type { DriverOpsInstruction } from "@drts/contracts";

import { DatabaseService } from "../../common/db";

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

  async loadAll(): Promise<DriverOpsInstruction[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const result = await this.databaseService!.query<JsonRecordRow>(
      `
        SELECT record
        FROM ops.phase1_driver_ops_instructions
        ORDER BY created_at DESC
      `,
    );

    return result.rows.map((row) =>
      this.parseRecord<DriverOpsInstruction>(
        row.record,
        "ops.phase1_driver_ops_instructions",
      ),
    );
  }

  async upsert(instruction: DriverOpsInstruction) {
    if (!this.isEnabled()) {
      return;
    }

    await this.databaseService!.query(
      `
        INSERT INTO ops.phase1_driver_ops_instructions (
          instruction_id, driver_id, created_at, record
        ) VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (instruction_id) DO UPDATE SET
          driver_id = EXCLUDED.driver_id,
          created_at = EXCLUDED.created_at,
          record = EXCLUDED.record
      `,
      [
        instruction.instructionId,
        instruction.driverId,
        instruction.createdAt,
        JSON.stringify(instruction),
      ],
    );
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Driver instruction persistence skipped during ${context}: ${detail}`,
    );
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }
    return record as T;
  }
}
