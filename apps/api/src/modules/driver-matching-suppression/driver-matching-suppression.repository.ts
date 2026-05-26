import { Injectable, Logger, Optional } from "@nestjs/common";

import type { DriverMatchingSuppression } from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

@Injectable()
export class DriverMatchingSuppressionRepository {
  private readonly logger = new Logger(
    DriverMatchingSuppressionRepository.name,
  );

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadAll(): Promise<DriverMatchingSuppression[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const result = await this.databaseService!.query<JsonRecordRow>(
      `
        SELECT record
        FROM ops.phase1_driver_matching_suppressions
        ORDER BY created_at DESC, suppression_id DESC
      `,
    );

    return result.rows.map((row) =>
      this.parseRecord<DriverMatchingSuppression>(
        row.record,
        "ops.phase1_driver_matching_suppressions",
      ),
    );
  }

  async upsert(record: DriverMatchingSuppression) {
    if (!this.isEnabled()) {
      return;
    }

    await this.databaseService!.query(
      `
        INSERT INTO ops.phase1_driver_matching_suppressions (
          suppression_id,
          driver_id,
          platform_code,
          service_bucket,
          reason,
          reason_message,
          status,
          created_at,
          released_at,
          created_by_actor_id,
          record
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb
        )
        ON CONFLICT (suppression_id) DO UPDATE SET
          driver_id = EXCLUDED.driver_id,
          platform_code = EXCLUDED.platform_code,
          service_bucket = EXCLUDED.service_bucket,
          reason = EXCLUDED.reason,
          reason_message = EXCLUDED.reason_message,
          status = EXCLUDED.status,
          created_at = EXCLUDED.created_at,
          released_at = EXCLUDED.released_at,
          created_by_actor_id = EXCLUDED.created_by_actor_id,
          record = EXCLUDED.record
      `,
      [
        record.suppressionId,
        record.driverId,
        record.platformCode,
        record.serviceBucket ?? null,
        record.reason,
        record.reasonMessage,
        record.status,
        record.createdAt,
        record.releasedAt,
        record.createdByActorId,
        JSON.stringify(record),
      ],
    );
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
