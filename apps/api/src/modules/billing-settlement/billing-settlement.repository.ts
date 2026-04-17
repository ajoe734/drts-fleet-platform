import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  DriverTaskRecord,
  DriverFeePlanRecord,
  DriverStatementRecord,
  MoneyAmount,
  OwnedOrderRecord,
  ReimbursementBatchRecord,
  TenantBillingProfile,
  TenantInvoiceRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";
import type { ControlledDownloadMetadata } from "../reporting-filing/download-signing.util";

type JsonRecordRow = {
  record: unknown;
};

type LiveSettlementTripRow = {
  order_record: unknown;
  task_record: unknown;
};

export type StoredTenantInvoiceRecord = TenantInvoiceRecord & {
  artifactDownloadMetadata: ControlledDownloadMetadata;
};

export type LiveSettlementTripRecord = {
  tenantId: string;
  driverId: string;
  orderId: string;
  completedAt: string;
  grossEarning: MoneyAmount;
};

export type BillingSettlementState = {
  tenantBillingProfiles: TenantBillingProfile[];
  tenantInvoices: StoredTenantInvoiceRecord[];
  driverFeePlans: DriverFeePlanRecord[];
  driverStatements: DriverStatementRecord[];
  reimbursementBatches: ReimbursementBatchRecord[];
};

export type PersistBillingSettlementChanges = {
  tenantBillingProfiles?: readonly TenantBillingProfile[];
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
        tenantBillingProfiles: [],
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
      tenantBillingProfiles: profileResult.rows.map((row) =>
        this.parseRecord<TenantBillingProfile>(
          row.record,
          "billing.phase1_tenant_billing_profiles",
        ),
      ),
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

  async listLiveCompletedTenantTrips(
    tenantId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<LiveSettlementTripRecord[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const result = await this.databaseService!.query<LiveSettlementTripRow>(
      `
        SELECT
          orders.record AS order_record,
          tasks.record AS task_record
        FROM ops.phase1_driver_tasks AS tasks
        INNER JOIN ops.phase1_owned_orders AS orders
          ON orders.order_id = tasks.order_id
        WHERE tasks.status = 'completed'
          AND COALESCE(tasks.record->>'completedAt', '') <> ''
          AND COALESCE(orders.record->>'tenantId', '') = $1
          AND COALESCE(orders.record->>'serviceBucket', '') = 'business_dispatch'
          AND (tasks.record->>'completedAt')::timestamptz >= $2::timestamptz
          AND (tasks.record->>'completedAt')::timestamptz <= $3::timestamptz
        ORDER BY (tasks.record->>'completedAt')::timestamptz DESC
      `,
      [tenantId, periodStart, periodEnd],
    );

    return result.rows.map((row) => {
      const order = this.parseRecord<OwnedOrderRecord>(
        row.order_record,
        "ops.phase1_owned_orders",
      );
      const task = this.parseRecord<DriverTaskRecord>(
        row.task_record,
        "ops.phase1_driver_tasks",
      );
      const grossEarning = task.fare ??
        order.quotedFare ?? {
          currency: "NTD",
          amountMinor: 0,
        };

      return {
        tenantId: order.tenantId ?? tenantId,
        driverId: task.driverId,
        orderId: order.orderId,
        completedAt: task.completedAt ?? order.updatedAt,
        grossEarning: { ...grossEarning },
      };
    });
  }

  async persistChanges(changes: PersistBillingSettlementChanges) {
    if (!this.isEnabled()) {
      return;
    }

    const writes: Promise<unknown>[] = [];

    for (const profile of changes.tenantBillingProfiles ?? []) {
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
          [profile.tenantId, profile.updatedAt, JSON.stringify(profile)],
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
