import { Injectable, Logger, Optional } from "@nestjs/common";

import type { DriverProfileRecord } from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

@Injectable()
export class DriverProfileRepository {
  private readonly logger = new Logger(DriverProfileRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadAll(): Promise<DriverProfileRecord[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const result = await this.databaseService!.query<JsonRecordRow>(
      `
        SELECT record
        FROM ops.phase1_driver_profiles
        ORDER BY updated_at DESC
      `,
    );

    return result.rows.map((row) =>
      this.parseRecord<DriverProfileRecord>(
        row.record,
        "ops.phase1_driver_profiles",
      ),
    );
  }

  async upsert(profile: DriverProfileRecord) {
    if (!this.isEnabled()) {
      return;
    }

    await this.databaseService!.query(
      `
        INSERT INTO ops.phase1_driver_profiles (
          driver_id, updated_at, record
        ) VALUES ($1, $2, $3::jsonb)
        ON CONFLICT (driver_id) DO UPDATE SET
          updated_at = EXCLUDED.updated_at,
          record = EXCLUDED.record
      `,
      [profile.driverId, profile.updatedAt, JSON.stringify(profile)],
    );
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Driver profile persistence skipped during ${context}: ${detail}`,
    );
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }

    return record as T;
  }
}
