import { HttpStatus, Injectable, Logger, Optional } from "@nestjs/common";

import type { PoolClient } from "pg";

import { ApiRequestError } from "../../common/api-envelope";
import { DatabaseService } from "../../common/db";
import type {
  RuntimeProfileServiceProductPolicy,
  ServiceProductRecord,
  ServiceProductType,
} from "./service-product.types";

type JsonRecordRow = {
  record: unknown;
};

type PersistServiceProductChanges = {
  records?: readonly ServiceProductRecord[];
  runtimePolicies?: readonly RuntimeProfileServiceProductPolicy[];
};

@Injectable()
export class ServiceProductRepository {
  private readonly logger = new Logger(ServiceProductRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async findRuntimeContext(
    runtimeProfileCode: RuntimeProfileServiceProductPolicy["runtimeProfileCode"],
    serviceProductCode: ServiceProductType,
  ) {
    if (!this.isEnabled())
      throw new Error("Runtime product lookup requires a database.");
    const [products, policies] = await Promise.all([
      this.databaseService!.query<JsonRecordRow>(
        `SELECT record FROM ops.phase1_service_products
         WHERE service_product_type = $1 ORDER BY created_at DESC`,
        [serviceProductCode],
      ),
      this.databaseService!.query<JsonRecordRow>(
        `SELECT record FROM ops.runtime_profile_service_product_policies
         WHERE runtime_profile_code = $1 AND service_product_code = $2`,
        [runtimeProfileCode, serviceProductCode],
      ),
    ]);
    this.assertUnambiguous(
      products.rows.map((row) =>
        this.normalizeLoadedRecord(row.record, "ops.phase1_service_products"),
      ),
    );
    if (policies.rows.length > 1) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "CONFLICT",
        "Ambiguous runtime product policy.",
      );
    }
    return {
      record: products.rows[0]
        ? this.normalizeLoadedRecord(
            products.rows[0].record,
            "ops.phase1_service_products",
          )
        : null,
      policy: policies.rows[0]
        ? this.normalizeLoadedPolicy(
            policies.rows[0].record,
            "ops.runtime_profile_service_product_policies",
          )
        : null,
    };
  }

  async loadState(): Promise<{
    records: ServiceProductRecord[];
    runtimePolicies: RuntimeProfileServiceProductPolicy[];
  }> {
    if (!this.isEnabled()) {
      return { records: [], runtimePolicies: [] };
    }

    const [productResult, policyResult] = await Promise.all([
      this.databaseService!.query<JsonRecordRow>(`
        SELECT record
        FROM ops.phase1_service_products
        ORDER BY created_at DESC
      `),
      this.databaseService!.query<JsonRecordRow>(`
        SELECT record
        FROM ops.runtime_profile_service_product_policies
        ORDER BY runtime_profile_code, service_product_code
      `),
    ]);

    const records = productResult.rows.map((row) =>
      this.normalizeLoadedRecord(row.record, "ops.phase1_service_products"),
    );
    this.assertUnambiguous(records);
    return {
      records,
      runtimePolicies: policyResult.rows.map((row) =>
        this.normalizeLoadedPolicy(
          row.record,
          "ops.runtime_profile_service_product_policies",
        ),
      ),
    };
  }

  async findById(serviceProductId: string) {
    const result = await this.databaseService!.query<JsonRecordRow>(
      `SELECT record FROM ops.phase1_service_products WHERE service_product_id = $1`,
      [serviceProductId],
    );
    const records = result.rows.map((row) =>
      this.normalizeLoadedRecord(row.record, "ops.phase1_service_products"),
    );
    this.assertUnambiguous(records);
    if (!records[0]) return null;
    // A historical duplicate type must not become a silent winner via get-by-ID.
    const peers = await this.databaseService!.query<JsonRecordRow>(
      `SELECT record FROM ops.phase1_service_products WHERE service_product_type = $1`,
      [records[0].serviceProductType],
    );
    this.assertUnambiguous(
      peers.rows.map((row) =>
        this.normalizeLoadedRecord(row.record, "ops.phase1_service_products"),
      ),
    );
    return records[0];
  }

  async createCanonical(record: ServiceProductRecord, generated: boolean) {
    return this.mutateCanonical(
      record.serviceProductId,
      async (client, records) => {
        if (generated) {
          const next =
            records.reduce((max, current) => {
              const match = /^SVP-(\d+)$/.exec(current.serviceProductId);
              return match && BigInt(match[1]!) > max ? BigInt(match[1]!) : max;
            }, 0n) + 1n;
          record = {
            ...record,
            serviceProductId: `SVP-${String(next).padStart(6, "0")}`,
          };
        }
        if (
          records.some(
            (current) => current.serviceProductId === record.serviceProductId,
          )
        ) {
          throw new ApiRequestError(
            HttpStatus.CONFLICT,
            "CONFLICT",
            "Service product ID already exists.",
            { serviceProductId: record.serviceProductId },
          );
        }
        if (
          records.some(
            (current) =>
              current.serviceProductType === record.serviceProductType,
          )
        ) {
          throw new ApiRequestError(
            HttpStatus.CONFLICT,
            "CONFLICT",
            "Service product type already exists.",
            { serviceProductType: record.serviceProductType },
          );
        }
        await client.query(
          `INSERT INTO ops.phase1_service_products (
          service_product_id, service_product_type, display_name, active, timing,
          allowed_license_types, meter_required, fixed_fare_allowed,
          default_billing_mode, created_at, updated_at, record
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12::jsonb)`,
          this.recordValues(record),
        );
        return record;
      },
    );
  }

  async updateCanonical(
    serviceProductId: string,
    apply: (current: ServiceProductRecord) => ServiceProductRecord,
  ) {
    return this.mutateCanonical(serviceProductId, async (client, records) => {
      const current = records.find(
        (record) => record.serviceProductId === serviceProductId,
      );
      if (!current) {
        throw new ApiRequestError(
          HttpStatus.NOT_FOUND,
          "NOT_FOUND",
          "Service product not found.",
          { serviceProductId },
        );
      }
      const record = apply(current);
      await client.query(
        `UPDATE ops.phase1_service_products SET
          service_product_type = $2, display_name = $3, active = $4, timing = $5,
          allowed_license_types = $6::jsonb, meter_required = $7, fixed_fare_allowed = $8,
          default_billing_mode = $9, created_at = $10, updated_at = $11, record = $12::jsonb
         WHERE service_product_id = $1`,
        this.recordValues(record),
      );
      return record;
    });
  }

  private recordValues(record: ServiceProductRecord) {
    return [
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
    ];
  }

  private async mutateCanonical(
    originalId: string,
    apply: (
      client: PoolClient,
      records: ServiceProductRecord[],
    ) => Promise<ServiceProductRecord>,
  ) {
    const client = await this.databaseService!.connect();
    let commitStarted = false;
    let released = false;
    let resolvedId = originalId;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      // V0027 has an ID primary key but no type unique constraint. Serialize the
      // small catalog with a table lock, including ordinary SQL/upsert writers.
      // READ COMMITTED reads AFTER acquiring the lock see the previous commit.
      await client.query(
        "LOCK TABLE ops.phase1_service_products IN SHARE ROW EXCLUSIVE MODE",
      );
      const result = await client.query<JsonRecordRow>(
        `SELECT record FROM ops.phase1_service_products ORDER BY created_at DESC FOR UPDATE`,
      );
      const records = result.rows.map((row) =>
        this.normalizeLoadedRecord(row.record, "ops.phase1_service_products"),
      );
      this.assertUnambiguous(records);
      const record = await apply(client, records);
      resolvedId = record.serviceProductId;
      commitStarted = true;
      await client.query("COMMIT");
      return record;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* Preserve original failure. */
      }
      if (commitStarted) {
        // COMMIT transport loss is not proof of rollback. Read the resolved
        // canonical identity using another connection; never retry or invent
        // a success ACK/audit from a matching row. Subsequent admin reads and
        // runtime prepare use this same authority rather than the old cache.
        client.release(true);
        released = true;
        try {
          const canonical = await this.findById(resolvedId);
          this.logger.warn(
            `Unacknowledged service product commit reconciled for ${resolvedId}: ${canonical ? "row present" : "row absent"}`,
          );
        } catch (readError) {
          this.reportPersistenceFailure(readError, `reconcile ${resolvedId}`);
        }
      }
      throw error;
    } finally {
      if (!commitStarted) client.release();
      // On success the connection is healthy; on uncertain COMMIT it was
      // destroyed above before reconciliation to avoid pool-size-one deadlock.
      else if (!released) client.release();
    }
  }

  private assertUnambiguous(records: readonly ServiceProductRecord[]) {
    const ids = new Set<string>();
    const types = new Set<ServiceProductType>();
    for (const record of records) {
      if (
        ids.has(record.serviceProductId) ||
        types.has(record.serviceProductType)
      ) {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "CONFLICT",
          "Ambiguous canonical service products.",
          {
            serviceProductId: record.serviceProductId,
            serviceProductType: record.serviceProductType,
          },
        );
      }
      ids.add(record.serviceProductId);
      types.add(record.serviceProductType);
    }
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
    const policyWrites = (changes.runtimePolicies ?? []).map((policy) =>
      this.databaseService!.query(
        `
          INSERT INTO ops.runtime_profile_service_product_policies (
            runtime_profile_code,
            service_product_code,
            active,
            effective_from,
            effective_until,
            created_at,
            updated_at,
            record
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
          ON CONFLICT (runtime_profile_code, service_product_code) DO UPDATE SET
            active = EXCLUDED.active,
            effective_from = EXCLUDED.effective_from,
            effective_until = EXCLUDED.effective_until,
            updated_at = EXCLUDED.updated_at,
            record = EXCLUDED.record
        `,
        [
          policy.runtimeProfileCode,
          policy.serviceProductCode,
          policy.active,
          policy.effectiveFrom,
          policy.effectiveUntil,
          policy.createdAt,
          policy.updatedAt,
          JSON.stringify(policy),
        ],
      ),
    );

    await Promise.all([...writes, ...policyWrites]);
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

  private normalizeLoadedPolicy(
    record: unknown,
    source: string,
  ): RuntimeProfileServiceProductPolicy {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted policy loaded from ${source}`);
    }
    const candidate = record as Record<string, unknown>;
    if (
      typeof candidate.runtimeProfileCode !== "string" ||
      typeof candidate.serviceProductCode !== "string"
    ) {
      throw new Error(`Unknown runtime policy shape loaded from ${source}`);
    }
    return candidate as unknown as RuntimeProfileServiceProductPolicy;
  }
}
