import { Injectable, Logger, Optional } from "@nestjs/common";

import { DatabaseService } from "../../common/db";
import type { ServiceProductRecord } from "./service-product.types";

type JsonRecordRow = {
  record: unknown;
};

type PersistServiceProductChanges = {
  records?: readonly ServiceProductRecord[];
};

@Injectable()
export class ServiceProductRepository {
  private readonly logger = new Logger(ServiceProductRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadState(): Promise<{ records: ServiceProductRecord[] }> {
    if (!this.isEnabled()) {
      return { records: [] };
    }

    const result = await this.databaseService!.query<JsonRecordRow>(
      `
        SELECT record
        FROM ops.phase1_service_products
        ORDER BY created_at DESC
      `,
    );

    return {
      records: result.rows.map((row) =>
        this.normalizeLoadedRecord(row.record, "ops.phase1_service_products"),
      ),
    };
  }

  async persistChanges(changes: PersistServiceProductChanges) {
    if (!this.isEnabled()) {
      return;
    }

    const writes = (changes.records ?? []).map((record) =>
      this.databaseService!.query(
        `
          INSERT INTO ops.phase1_service_products (
            service_product_id,
            service_product_type,
            display_name,
            active,
            timing,
            allowed_license_types,
            meter_required,
            fixed_fare_allowed,
            default_billing_mode,
            created_at,
            updated_at,
            record
          ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12::jsonb)
          ON CONFLICT (service_product_id) DO UPDATE SET
            service_product_type = EXCLUDED.service_product_type,
            display_name = EXCLUDED.display_name,
            active = EXCLUDED.active,
            timing = EXCLUDED.timing,
            allowed_license_types = EXCLUDED.allowed_license_types,
            meter_required = EXCLUDED.meter_required,
            fixed_fare_allowed = EXCLUDED.fixed_fare_allowed,
            default_billing_mode = EXCLUDED.default_billing_mode,
            updated_at = EXCLUDED.updated_at,
            record = EXCLUDED.record
        `,
        [
          record.serviceProductId,
          record.serviceProductType,
          record.displayName,
          record.active,
          record.timing,
          JSON.stringify(record.allowedLicenseTypes),
          record.meterRequired,
          record.fixedFareAllowed,
          record.defaultBillingMode,
          record.createdAt,
          record.updatedAt,
          JSON.stringify(record),
        ],
      ),
    );

    await Promise.all(writes);
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Service product persistence skipped during ${context}: ${detail}`,
    );
  }

  private normalizeLoadedRecord(
    record: unknown,
    source: string,
  ): ServiceProductRecord {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }

    const candidate = record as Record<string, unknown>;
    if (typeof candidate.serviceProductId !== "string") {
      throw new Error(
        `Unknown service product record shape loaded from ${source}`,
      );
    }

    return candidate as unknown as ServiceProductRecord;
  }
}
