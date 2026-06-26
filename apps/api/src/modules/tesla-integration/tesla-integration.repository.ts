import { Injectable, Logger, Optional } from "@nestjs/common";

import type { CommandReceipt } from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type CommandReceiptRow = {
  commandId: string;
  idempotencyKey: string;
  vehicleId: string;
  commandType: string;
  status: string;
  issuedBy: string;
  issuedAt: string;
  acknowledgedAt: string | null;
  providerRef: string | null;
  failureReasonCode: string | null;
  sourceSystem: string;
  sourceRef: string | null;
  sourceIngestedAt: string;
  sourceRecordedAt: string | null;
  sourceSignatureRef: string | null;
  sourceSchemaVersion: string;
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

    const result = await this.databaseService!.query<CommandReceiptRow>(
      `
        SELECT
          command_id AS "commandId",
          idempotency_key AS "idempotencyKey",
          vehicle_id AS "vehicleId",
          command_type AS "commandType",
          status,
          issued_by AS "issuedBy",
          issued_at AS "issuedAt",
          acknowledged_at AS "acknowledgedAt",
          provider_ref AS "providerRef",
          failure_reason_code AS "failureReasonCode",
          source_system AS "sourceSystem",
          source_ref AS "sourceRef",
          source_ingested_at AS "sourceIngestedAt",
          source_recorded_at AS "sourceRecordedAt",
          source_signature_ref AS "sourceSignatureRef",
          source_schema_version AS "sourceSchemaVersion"
        FROM av_sandbox.command_receipts
        ORDER BY issued_at DESC
      `,
    );

    return result.rows.map((row) => this.mapCommandReceipt(row));
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
          source_system,
          source_ref,
          source_ingested_at,
          source_recorded_at,
          source_signature_ref,
          source_schema_version
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
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
        record.source.sourceSystem,
        record.source.sourceRef,
        record.source.ingestedAt,
        record.source.recordedAt,
        record.source.signatureRef,
        record.source.schemaVersion,
      ],
    );
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Tesla integration persistence skipped during ${context}: ${detail}`,
    );
  }

  private mapCommandReceipt(row: CommandReceiptRow): CommandReceipt {
    return {
      commandId: row.commandId,
      idempotencyKey: row.idempotencyKey,
      vehicleId: row.vehicleId,
      commandType: row.commandType as CommandReceipt["commandType"],
      status: row.status as CommandReceipt["status"],
      issuedBy: row.issuedBy,
      issuedAt: row.issuedAt,
      acknowledgedAt: row.acknowledgedAt,
      providerRef: row.providerRef,
      failureReasonCode: row.failureReasonCode,
      source: {
        sourceSystem: row.sourceSystem as CommandReceipt["source"]["sourceSystem"],
        sourceRef: row.sourceRef,
        ingestedAt: row.sourceIngestedAt,
        recordedAt: row.sourceRecordedAt ?? row.sourceIngestedAt,
        signatureRef: row.sourceSignatureRef,
        schemaVersion: row.sourceSchemaVersion,
      },
    };
  }
}
