import { Injectable, Logger, Optional } from "@nestjs/common";
import { DatabaseService } from "../../common/db";

export interface DriverOpsInstructionRecord {
  id: string;
  driverId: string;
  instructionText: string;
  expiresAt: string;
  isAcknowledged: boolean;
  acknowledgedAt?: string;
  createdAt: string;
}

@Injectable()
export class DriverInstructionRepository {
  private readonly logger = new Logger(DriverInstructionRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async create(data: Omit<DriverOpsInstructionRecord, 'id' | 'isAcknowledged' | 'createdAt'>): Promise<string | null> {
    if (!this.isEnabled()) return null;
    const result = await this.databaseService!.query<{ id: string }>(
      `
        INSERT INTO ops.driver_ops_instructions (
          driver_id, instruction_text, expires_at
        ) VALUES ($1, $2, $3)
        RETURNING id
      `,
      [data.driverId, data.instructionText, data.expiresAt]
    );
    return result.rows[0].id;
  }

  async getForDriver(driverId: string): Promise<DriverOpsInstructionRecord[]> {
    if (!this.isEnabled()) return [];
    const result = await this.databaseService!.query<DriverOpsInstructionRecord>(
      `
        SELECT * FROM ops.driver_ops_instructions
        WHERE driver_id = $1 AND expires_at > now()
        ORDER BY created_at DESC
      `,
      [driverId]
    );
    return result.rows;
  }

  async acknowledge(id: string, driverId: string): Promise<boolean> {
    if (!this.isEnabled()) return false;
    const result = await this.databaseService!.query(
      `
        UPDATE ops.driver_ops_instructions
        SET is_acknowledged = TRUE, acknowledged_at = now()
        WHERE id = $1 AND driver_id = $2
      `,
      [id, driverId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
