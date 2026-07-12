import { Injectable, Logger, Optional } from "@nestjs/common";

import type { CommandReceipt } from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

@Injectable()
export class TeslaIntegrationRepository {
  private readonly logger = new Logger(TeslaIntegrationRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadCommandReceipts(): Promise<CommandReceipt[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const result = await this.databaseService!.query<JsonRecordRow>(
      `
        SELECT record
        FROM av_sandbox.command_receipts
        ORDER BY issued_at DESC
      `,
    );

    return result.rows.map((row) => this.parseRecord<CommandReceipt>(row.record));
  }

  async insertCommandReceipt(record: CommandReceipt) {
    if (!this.isEnabled()) {
      return;
    }

    await this.databaseService!.query(
      `
        INSERT INTO av_sandbox.command_receipts (
          command_id,
          vehicle_id,
          command_type,
          status,
          issued_by,
          issued_at,
          acknowledged_at,
          provider_ref,
          failure_reason_code,
          idempotency_key,
          record
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb
        )
        ON CONFLICT (command_id) DO NOTHING
      `,
      [
        record.commandId,
        record.vehicleId,
        record.commandType,
        record.status,
        record.issuedBy,
        record.issuedAt,
        record.acknowledgedAt,
        record.providerRef,
        record.failureReasonCode,
        record.idempotencyKey,
        JSON.stringify(record),
      ],
    );
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Tesla integration persistence skipped during ${context}: ${detail}`,
    );
  }

  private parseRecord<T>(record: unknown): T {
    if (!record || typeof record !== "object") {
      throw new Error("Invalid Tesla integration record loaded from persistence.");
    }

    return record as T;
  }
}
