import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  DriverFeePlanRecord,
  DriverStatementRecord,
  ReimbursementBatchRecord,
  TenantBillingProfile,
  TenantInvoiceRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";
import type { ControlledDownloadMetadata } from "../reporting-filing/download-signing.util";

type JsonRecordRow = {
  record: unknown;
};

export type StoredTenantInvoiceRecord = TenantInvoiceRecord & {
  artifactDownloadMetadata: ControlledDownloadMetadata;
};

export type BillingSettlementState = {
  tenantBillingProfile: TenantBillingProfile | null;
  tenantInvoices: StoredTenantInvoiceRecord[];
  driverFeePlans: DriverFeePlanRecord[];
  driverStatements: DriverStatementRecord[];
  reimbursementBatches: ReimbursementBatchRecord[];
};

export type PersistBillingSettlementChanges = {
  tenantBillingProfile?: TenantBillingProfile;
  tenantInvoices?: readonly StoredTenantInvoiceRecord[];
  driverFeePlans?: readonly DriverFeePlanRecord[];
  driverStatements?: readonly DriverStatementRecord[];
  reimbursementBatches?: readonly ReimbursementBatchRecord[];
};

@Injectable()
export class BillingSettlementRepository {
  private readonly logger = new Logger(BillingSettlementRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadState(): Promise<BillingSettlementState> {
    if (!this.isEnabled()) {
      return {
        tenantBillingProfile: null,
        tenantInvoices: [],
        driverFeePlans: [],
        driverStatements: [],
        reimbursementBatches: [],
      };
    }

    const [
      profileResult,
      invoicesResult,
      feePlansResult,
      statementsResult,
      reimbursementsResult,
    ] = await Promise.all([
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM billing.phase1_tenant_billing_profiles
          ORDER BY updated_at DESC
          LIMIT 1
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM billing.phase1_tenant_invoices
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM billing.phase1_driver_fee_plans
          ORDER BY published_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM billing.phase1_driver_statements
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM billing.phase1_reimbursement_batches
          ORDER BY updated_at DESC
        `,
      ),
    ]);

    return {
      tenantBillingProfile: profileResult.rows[0]
        ? this.parseRecord<TenantBillingProfile>(
            profileResult.rows[0].record,
            "billing.phase1_tenant_billing_profiles",
          )
        : null,
      tenantInvoices: invoicesResult.rows.map((row) =>
        this.parseRecord<StoredTenantInvoiceRecord>(
          row.record,
          "billing.phase1_tenant_invoices",
        ),
      ),
      driverFeePlans: feePlansResult.rows.map((row) =>
        this.parseRecord<DriverFeePlanRecord>(
          row.record,
          "billing.phase1_driver_fee_plans",
        ),
      ),
      driverStatements: statementsResult.rows.map((row) =>
        this.parseRecord<DriverStatementRecord>(
          row.record,
          "billing.phase1_driver_statements",
        ),
      ),
      reimbursementBatches: reimbursementsResult.rows.map((row) =>
        this.parseRecord<ReimbursementBatchRecord>(
          row.record,
          "billing.phase1_reimbursement_batches",
        ),
      ),
    };
  }

  async persistChanges(changes: PersistBillingSettlementChanges) {
    if (!this.isEnabled()) {
      return;
    }

    const writes: Promise<unknown>[] = [];

    if (changes.tenantBillingProfile) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO billing.phase1_tenant_billing_profiles (
              tenant_id,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3::jsonb
            )
            ON CONFLICT (tenant_id) DO UPDATE SET
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            changes.tenantBillingProfile.tenantId,
            changes.tenantBillingProfile.updatedAt,
            JSON.stringify(changes.tenantBillingProfile),
          ],
        ),
      );
    }

    for (const invoice of changes.tenantInvoices ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO billing.phase1_tenant_invoices (
              invoice_id,
              tenant_id,
              status,
              period_start,
              period_end,
              created_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8::jsonb
            )
            ON CONFLICT (invoice_id) DO UPDATE SET
              tenant_id = EXCLUDED.tenant_id,
              status = EXCLUDED.status,
              period_start = EXCLUDED.period_start,
              period_end = EXCLUDED.period_end,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            invoice.invoiceId,
            invoice.tenantId,
            invoice.status,
            invoice.periodStart,
            invoice.periodEnd,
            invoice.createdAt,
            invoice.updatedAt,
            JSON.stringify(invoice),
          ],
        ),
      );
    }

    for (const feePlan of changes.driverFeePlans ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO billing.phase1_driver_fee_plans (
              fee_plan_id,
              plan_name,
              version,
              status,
              published_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6::jsonb
            )
            ON CONFLICT (fee_plan_id) DO UPDATE SET
              plan_name = EXCLUDED.plan_name,
              version = EXCLUDED.version,
              status = EXCLUDED.status,
              published_at = EXCLUDED.published_at,
              record = EXCLUDED.record
          `,
          [
            feePlan.feePlanId,
            feePlan.planName,
            feePlan.version,
            feePlan.status,
            feePlan.publishedAt,
            JSON.stringify(feePlan),
          ],
        ),
      );
    }

    for (const statement of changes.driverStatements ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO billing.phase1_driver_statements (
              statement_id,
              driver_id,
              period_month,
              payout_status,
              created_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7::jsonb
            )
            ON CONFLICT (statement_id) DO UPDATE SET
              driver_id = EXCLUDED.driver_id,
              period_month = EXCLUDED.period_month,
              payout_status = EXCLUDED.payout_status,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            statement.statementId,
            statement.driverId,
            statement.periodMonth,
            statement.payoutStatus,
            statement.createdAt,
            statement.updatedAt,
            JSON.stringify(statement),
          ],
        ),
      );
    }

    for (const batch of changes.reimbursementBatches ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO billing.phase1_reimbursement_batches (
              batch_id,
              driver_id,
              statement_id,
              period_month,
              status,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7::jsonb
            )
            ON CONFLICT (batch_id) DO UPDATE SET
              driver_id = EXCLUDED.driver_id,
              statement_id = EXCLUDED.statement_id,
              period_month = EXCLUDED.period_month,
              status = EXCLUDED.status,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            batch.batchId,
            batch.driverId,
            batch.statementId,
            batch.periodMonth,
            batch.status,
            batch.paidAt ?? batch.approvedAt ?? new Date().toISOString(),
            JSON.stringify(batch),
          ],
        ),
      );
    }

    await Promise.all(writes);
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Billing-settlement persistence skipped during ${context}: ${detail}`,
    );
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }

    return record as T;
  }
}
