import { Injectable, Logger, Optional } from "@nestjs/common";

import type { DriverSettings } from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

@Injectable()
export class DriverSettingsRepository {
  private readonly logger = new Logger(DriverSettingsRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadAll(): Promise<DriverSettings[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const result = await this.databaseService!.query<JsonRecordRow>(
      `
        SELECT record
        FROM ops.phase1_driver_settings
        ORDER BY updated_at DESC
      `,
    );

    return result.rows.map((row) =>
      this.parseRecord<DriverSettings>(
        row.record,
        "ops.phase1_driver_settings",
      ),
    );
  }

  async upsert(settings: DriverSettings) {
    if (!this.isEnabled()) {
      return;
    }

    await this.databaseService!.query(
      `
        INSERT INTO ops.phase1_driver_settings (
          driver_id, updated_at, record
        ) VALUES ($1, $2, $3::jsonb)
        ON CONFLICT (driver_id) DO UPDATE SET
          updated_at = EXCLUDED.updated_at,
          record = EXCLUDED.record
      `,
      [settings.driverId, settings.updatedAt, JSON.stringify(settings)],
    );
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Driver settings persistence skipped during ${context}: ${detail}`,
    );
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }
    return record as T;
  }
}
