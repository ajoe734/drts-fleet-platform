import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  VehicleEligibilityMatrixRecord,
  VehicleLicenseType,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";
import type { RuntimeEligibilityDecisionRecord } from "./runtime-eligibility.types";

type JsonRecordRow = {
  record: unknown;
};

@Injectable()
export class VehicleEligibilityRepository {
  private readonly logger = new Logger(VehicleEligibilityRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadAll(): Promise<VehicleEligibilityMatrixRecord[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const result = await this.databaseService!.query<JsonRecordRow>(
      `
        SELECT record
        FROM admin.phase1_vehicle_eligibility_matrix
        ORDER BY license_type ASC, effective_from DESC, updated_at DESC
      `,
    );

    return result.rows.map((row) =>
      this.parseRecord<VehicleEligibilityMatrixRecord>(
        row.record,
        "admin.phase1_vehicle_eligibility_matrix",
      ),
    );
  }

  async findByLicenseTypes(licenseTypes: readonly VehicleLicenseType[]) {
    const result = await this.databaseService!.query<{
      configured: boolean;
      records: unknown[];
    }>(
      `
      SELECT EXISTS (SELECT 1 FROM admin.phase1_vehicle_eligibility_matrix) AS configured,
        COALESCE((SELECT jsonb_agg(record ORDER BY license_type, effective_from DESC, updated_at DESC)
          FROM admin.phase1_vehicle_eligibility_matrix
          WHERE license_type = ANY($1::text[])), '[]'::jsonb) AS records
    `,
      [licenseTypes],
    );
    const context = result.rows[0]!;
    return {
      configured: context.configured,
      items: context.records.map((record) =>
        this.parseRecord<VehicleEligibilityMatrixRecord>(
          record,
          "admin.phase1_vehicle_eligibility_matrix",
        ),
      ),
    };
  }

  /** Serialize a configuration amendment with the existing replace-all writer.
   * Only new/changed capabilities are upserted; other configuration is retained.
   * The caller commits its cache/audit only after this transaction acknowledges.
   */
  async amendMatrix(
    amend: (
      current: VehicleEligibilityMatrixRecord[],
    ) => VehicleEligibilityMatrixRecord[],
  ) {
    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "LOCK TABLE admin.phase1_vehicle_eligibility_matrix IN SHARE ROW EXCLUSIVE MODE",
      );
      const result = await client.query<JsonRecordRow>(
        "SELECT record FROM admin.phase1_vehicle_eligibility_matrix",
      );
      const current = result.rows.map((row) =>
        this.parseRecord<VehicleEligibilityMatrixRecord>(
          row.record,
          "admin.phase1_vehicle_eligibility_matrix",
        ),
      );
      const next = amend(structuredClone(current));
      for (const item of next) {
        const previous = current.find(
          (row) => row.capabilityId === item.capabilityId,
        );
        if (previous && JSON.stringify(previous) === JSON.stringify(item))
          continue;
        await client.query(
          `
          INSERT INTO admin.phase1_vehicle_eligibility_matrix (
            capability_id, license_type, active, effective_from, effective_until,
            conditionally_allowed, required_documents, training_required, permit_required,
            created_at, updated_at, record
          ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12::jsonb)
          ON CONFLICT (capability_id) DO UPDATE SET
            license_type=EXCLUDED.license_type, active=EXCLUDED.active,
            effective_from=EXCLUDED.effective_from, effective_until=EXCLUDED.effective_until,
            conditionally_allowed=EXCLUDED.conditionally_allowed,
            required_documents=EXCLUDED.required_documents, training_required=EXCLUDED.training_required,
            permit_required=EXCLUDED.permit_required, updated_at=EXCLUDED.updated_at, record=EXCLUDED.record
        `,
          [
            item.capabilityId,
            item.licenseType,
            item.active,
            item.effectiveFrom,
            item.effectiveUntil,
            item.conditionallyAllowed,
            JSON.stringify(item.requiredDocuments),
            item.trainingRequired,
            item.permitRequired,
            item.createdAt,
            item.updatedAt,
            JSON.stringify(item),
          ],
        );
      }
      await client.query("COMMIT");
      return next;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async replaceAll(items: readonly VehicleEligibilityMatrixRecord[]) {
    if (!this.isEnabled()) {
      return;
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM admin.phase1_vehicle_eligibility_matrix`);

      for (const item of items) {
        await client.query(
          `
            INSERT INTO admin.phase1_vehicle_eligibility_matrix (
              capability_id,
              license_type,
              active,
              effective_from,
              effective_until,
              conditionally_allowed,
              required_documents,
              training_required,
              permit_required,
              created_at,
              updated_at,
              record
            ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12::jsonb)
          `,
          [
            item.capabilityId,
            item.licenseType,
            item.active,
            item.effectiveFrom,
            item.effectiveUntil,
            item.conditionallyAllowed,
            JSON.stringify(item.requiredDocuments),
            item.trainingRequired,
            item.permitRequired,
            item.createdAt,
            item.updatedAt,
            JSON.stringify(item),
          ],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async insertRuntimeEligibilityDecision(
    record: RuntimeEligibilityDecisionRecord,
  ) {
    if (!this.isEnabled()) {
      return;
    }

    await this.databaseService!.query(
      `
        INSERT INTO mobility.runtime_eligibility_decisions (
          decision_id,
          order_id,
          dispatch_job_id,
          driver_id,
          vehicle_id,
          service_product_id,
          service_product_code,
          policy_version,
          decision,
          hard_reason_codes,
          soft_reason_codes,
          missing_requirements,
          location_state,
          evaluated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10::jsonb, $11::jsonb, $12::jsonb, $13, $14
        )
      `,
      [
        record.decisionId,
        record.orderId,
        record.dispatchJobId,
        record.driverId,
        record.vehicleId,
        record.serviceProductId,
        record.serviceProductCode,
        record.policyVersion,
        record.decision,
        JSON.stringify(record.hardReasonCodes),
        JSON.stringify(record.softReasonCodes),
        JSON.stringify(record.missingRequirements),
        record.locationState,
        record.evaluatedAt,
      ],
    );
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Vehicle eligibility persistence skipped during ${context}: ${detail}`,
    );
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }

    return record as T;
  }
}
