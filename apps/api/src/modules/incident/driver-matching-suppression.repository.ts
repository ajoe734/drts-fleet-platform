import { Injectable, Logger, Optional } from "@nestjs/common";

import type { DriverMatchingSuppressionRecord } from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

type SuppressionState = {
  suppressions: DriverMatchingSuppressionRecord[];
};

@Injectable()
export class DriverMatchingSuppressionRepository {
  private readonly logger = new Logger(DriverMatchingSuppressionRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadState(): Promise<SuppressionState> {
    if (!this.isEnabled()) {
      return { suppressions: [] };
    }

    const result = await this.databaseService!.query<JsonRecordRow>(
      `
        SELECT record
        FROM ops.phase1_driver_matching_suppressions
        ORDER BY created_at ASC
      `,
    );

    return {
      suppressions: result.rows.map((row) =>
        this.parseRecord<DriverMatchingSuppressionRecord>(
          row.record,
          "ops.phase1_driver_matching_suppressions",
        ),
      ),
    };
  }

  async persistChanges(
    suppressions: readonly DriverMatchingSuppressionRecord[],
  ) {
    if (!this.isEnabled()) {
      return;
    }

    const writes = suppressions.map((suppression) =>
      this.databaseService!.query(
        `
          INSERT INTO ops.phase1_driver_matching_suppressions (
            suppression_id, driver_id, active, reason_code,
            source_incident_id, expires_at, lifted_at,
            created_by, extended_by, created_at, updated_at, record
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
          ON CONFLICT (suppression_id) DO UPDATE SET
            active = EXCLUDED.active,
            reason_code = EXCLUDED.reason_code,
            source_incident_id = EXCLUDED.source_incident_id,
            expires_at = EXCLUDED.expires_at,
            lifted_at = EXCLUDED.lifted_at,
            extended_by = EXCLUDED.extended_by,
            updated_at = EXCLUDED.updated_at,
            record = EXCLUDED.record
        `,
        [
          suppression.suppressionId,
          suppression.driverId,
          suppression.active,
          suppression.reasonCode,
          suppression.sourceIncidentId ?? null,
          suppression.expiresAt,
          suppression.liftedAt,
          suppression.createdBy ?? null,
          suppression.extendedBy ?? null,
          suppression.createdAt,
          suppression.updatedAt,
          JSON.stringify(suppression),
        ],
      ),
    );

    await Promise.all(writes);
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Driver matching suppression persistence skipped during ${context}: ${detail}`,
    );
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }
    return record as T;
  }
}
