import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  FulfillmentSegmentRecord,
  DriverTaskRecord,
  DriverFeePlanRecord,
  DriverStatementRecord,
  MoneyAmount,
  OwnedOrderRecord,
  ReconciliationIssueRecord,
  ReimbursementBatchRecord,
  SandboxBillingTreatmentRecord,
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

type FulfillmentSegmentRow = {
  fulfillment_segment_id: string;
  booking_id: string;
  order_id: string;
  sandbox_trip_id: string | null;
  segment_type: FulfillmentSegmentRecord["segmentType"];
  segment_reason: string;
  started_at: string | null;
  ended_at: string | null;
  vehicle_id: string | null;
  vin: string | null;
  driver_id: string | null;
  safety_operator_id: string | null;
  source_platform: string | null;
  distance_km: number | null;
  duration_seconds: number | null;
  cost_minor: string | number | null;
  currency: string;
  evidence_reference: string | null;
  created_at: string;
};

type SandboxBillingTreatmentRow = {
  sandbox_billing_treatment_id: string;
  booking_id: string;
  order_id: string;
  sandbox_trip_id: string | null;
  treatment_type: SandboxBillingTreatmentRecord["treatmentType"];
  fallback_cost_absorber: SandboxBillingTreatmentRecord["fallbackCostAbsorber"];
  fallback_policy_id: string | null;
  policy_resolution: string;
  passenger_extra_charge_allowed: boolean;
  passenger_extra_charge_minor: string | number;
  internal_av_cost_minor: string | number | null;
  internal_human_fallback_cost_minor: string | number | null;
  partner_charge_minor: string | number | null;
  tenant_charge_minor: string | number | null;
  platform_absorbed_minor: string | number | null;
  currency: string;
  treatment_snapshot: unknown;
  created_at: string;
};

export type StoredTenantInvoiceRecord = TenantInvoiceRecord & {
  artifactDownloadMetadata: ControlledDownloadMetadata;
};

export type LiveSettlementTripRecord = {
  tenantId: string;
  driverId: string;
  orderId: string;
  bookingId?: string | null;
  completedAt: string;
  grossEarning: MoneyAmount;
  orderSource: OwnedOrderRecord["orderSource"];
  serviceBucket: OwnedOrderRecord["serviceBucket"];
  businessDispatchSubtype: OwnedOrderRecord["businessDispatchSubtype"];
  costCenterCode: string | null;
  riderId: string | null;
  partnerId: string | null;
  partnerProgramId: string | null;
  partnerEntrySlug: string | null;
  eligibilityVerificationId: string | null;
  issuerAuthorizationRef: string | null;
  benefitReference: string | null;
  serviceProduct?: string | null;
  tenantServiceProgramId?: string | null;
  sourcePlatform?: string | null;
  sandboxBillingTreatment?: SandboxBillingTreatmentRecord | null;
  sandboxFulfillmentSegments?: FulfillmentSegmentRecord[];
};

export type BillingSettlementState = {
  tenantBillingProfiles: TenantBillingProfile[];
  tenantInvoices: StoredTenantInvoiceRecord[];
  driverFeePlans: DriverFeePlanRecord[];
  driverStatements: DriverStatementRecord[];
  reimbursementBatches: ReimbursementBatchRecord[];
  reconciliationIssues: ReconciliationIssueRecord[];
  fulfillmentSegments: FulfillmentSegmentRecord[];
  sandboxBillingTreatments: SandboxBillingTreatmentRecord[];
};

export type PersistBillingSettlementChanges = {
  tenantBillingProfiles?: readonly TenantBillingProfile[];
  tenantInvoices?: readonly StoredTenantInvoiceRecord[];
  driverFeePlans?: readonly DriverFeePlanRecord[];
  driverStatements?: readonly DriverStatementRecord[];
  reimbursementBatches?: readonly ReimbursementBatchRecord[];
  reconciliationIssues?: readonly ReconciliationIssueRecord[];
  fulfillmentSegments?: readonly FulfillmentSegmentRecord[];
  sandboxBillingTreatments?: readonly SandboxBillingTreatmentRecord[];
};

const LIVE_TASK_COMPLETED_AT_ISO_UTC_SQL = "tasks.record->>'completedAt'";
const LIVE_TASK_COMPLETED_AT_ISO_UTC_PREDICATE_SQL = `
  COALESCE(${LIVE_TASK_COMPLETED_AT_ISO_UTC_SQL}, '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?Z$'
`;
const DEFAULT_CURRENCY = "NTD";

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
        reconciliationIssues: [],
        fulfillmentSegments: [],
        sandboxBillingTreatments: [],
      };
    }

    const [
      profileResult,
      invoicesResult,
      feePlansResult,
      statementsResult,
      reimbursementsResult,
      reconciliationResult,
      fulfillmentSegmentsResult,
      sandboxBillingTreatmentsResult,
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
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM billing.phase1_reconciliation_issues
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
      this.databaseService!.query<FulfillmentSegmentRow>(
        `
          SELECT *
          FROM av_sandbox.fulfillment_segments
          ORDER BY created_at DESC
        `,
      ),
      this.databaseService!.query<SandboxBillingTreatmentRow>(
        `
          SELECT *
          FROM av_sandbox.sandbox_billing_treatments
          ORDER BY created_at DESC
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
      reconciliationIssues: reconciliationResult.rows.map((row) =>
        this.parseRecord<ReconciliationIssueRecord>(
          row.record,
          "billing.phase1_reconciliation_issues",
        ),
      ),
      fulfillmentSegments: fulfillmentSegmentsResult.rows.map((row) =>
        this.mapFulfillmentSegmentRow(row),
      ),
      sandboxBillingTreatments: sandboxBillingTreatmentsResult.rows.map((row) =>
        this.mapSandboxBillingTreatmentRow(row),
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
          AND ${LIVE_TASK_COMPLETED_AT_ISO_UTC_PREDICATE_SQL}
          AND COALESCE(orders.record->>'tenantId', '') = $1
          AND COALESCE(orders.record->>'serviceBucket', '') = 'business_dispatch'
          AND ${LIVE_TASK_COMPLETED_AT_ISO_UTC_SQL} >= $2
          AND ${LIVE_TASK_COMPLETED_AT_ISO_UTC_SQL} <= $3
        ORDER BY ${LIVE_TASK_COMPLETED_AT_ISO_UTC_SQL} DESC
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
        orderSource: order.orderSource,
        serviceBucket: order.serviceBucket,
        businessDispatchSubtype: order.businessDispatchSubtype,
        costCenterCode: order.costCenter,
        riderId: order.passenger?.passengerId ?? null,
        partnerId: order.partnerId,
        partnerProgramId: order.partnerProgramId,
        partnerEntrySlug: order.partnerEntrySlug,
        eligibilityVerificationId: order.eligibilityVerificationId,
        issuerAuthorizationRef: order.issuerAuthorizationRef,
        benefitReference: order.benefitReference,
        serviceProduct: order.businessDispatchSubtype,
        tenantServiceProgramId: null,
        sourcePlatform: order.orderSource,
      };
    });
  }

  /**
   * Distinct `YYYY-MM` period months that have at least one live card-benefit
   * airport-transfer settlement trip for the issuer tenant. Mirrors the
   * `partner_airport` channel predicate (`settlementChannelKeyForTrip`) plus the
   * benefit/issuer reference requirement so statement period discovery does not
   * miss periods that exist only in live repository data (not seed memory).
   */
  async listLiveCardBenefitSettlementPeriods(
    tenantId: string,
  ): Promise<string[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const result = await this.databaseService!.query<{
      period_month: string | null;
    }>(
      `
        SELECT DISTINCT
          substring(${LIVE_TASK_COMPLETED_AT_ISO_UTC_SQL} FROM 1 FOR 7)
            AS period_month
        FROM ops.phase1_driver_tasks AS tasks
        INNER JOIN ops.phase1_owned_orders AS orders
          ON orders.order_id = tasks.order_id
        WHERE tasks.status = 'completed'
          AND ${LIVE_TASK_COMPLETED_AT_ISO_UTC_PREDICATE_SQL}
          AND COALESCE(orders.record->>'tenantId', '') = $1
          AND COALESCE(orders.record->>'serviceBucket', '') = 'business_dispatch'
          AND COALESCE(orders.record->>'orderSource', '')
            NOT IN ('external_platform', 'phone')
          AND (
            COALESCE(orders.record->>'businessDispatchSubtype', '')
              = 'credit_card_airport_transfer'
            OR COALESCE(orders.record->>'partnerId', '') <> ''
          )
          AND COALESCE(orders.record->>'benefitReference', '') <> ''
          AND COALESCE(orders.record->>'issuerAuthorizationRef', '') <> ''
      `,
      [tenantId],
    );

    return result.rows
      .map((row) => row.period_month)
      .filter((value): value is string => Boolean(value));
  }

  async listLiveDriverTripsInPeriod(
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
          AND ${LIVE_TASK_COMPLETED_AT_ISO_UTC_PREDICATE_SQL}
          AND COALESCE(tasks.record->>'driverId', '') <> ''
          AND COALESCE(orders.record->>'serviceBucket', '') = 'business_dispatch'
          AND ${LIVE_TASK_COMPLETED_AT_ISO_UTC_SQL} >= $1
          AND ${LIVE_TASK_COMPLETED_AT_ISO_UTC_SQL} <= $2
        ORDER BY ${LIVE_TASK_COMPLETED_AT_ISO_UTC_SQL} DESC
      `,
      [periodStart, periodEnd],
    );

    return this.mapLiveSettlementTrips(result.rows);
  }

  async listLiveDriverTripsInPeriodForDriver(
    driverId: string,
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
          AND ${LIVE_TASK_COMPLETED_AT_ISO_UTC_PREDICATE_SQL}
          AND COALESCE(tasks.record->>'driverId', '') = $1
          AND COALESCE(orders.record->>'serviceBucket', '') = 'business_dispatch'
          AND ${LIVE_TASK_COMPLETED_AT_ISO_UTC_SQL} >= $2
          AND ${LIVE_TASK_COMPLETED_AT_ISO_UTC_SQL} <= $3
        ORDER BY ${LIVE_TASK_COMPLETED_AT_ISO_UTC_SQL} DESC
      `,
      [driverId, periodStart, periodEnd],
    );

    return this.mapLiveSettlementTrips(result.rows);
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

    for (const issue of changes.reconciliationIssues ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO billing.phase1_reconciliation_issues (
              issue_id,
              issue_type,
              status,
              channel_key,
              owner_id,
              created_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8::jsonb
            )
            ON CONFLICT (issue_id) DO UPDATE SET
              issue_type = EXCLUDED.issue_type,
              status = EXCLUDED.status,
              channel_key = EXCLUDED.channel_key,
              owner_id = EXCLUDED.owner_id,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            issue.issueId,
            issue.issueType,
            issue.status,
            issue.channelKey,
            issue.ownerId,
            issue.createdAt,
            issue.updatedAt,
            JSON.stringify(issue),
          ],
        ),
      );
    }

    for (const segment of changes.fulfillmentSegments ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO av_sandbox.fulfillment_segments (
              fulfillment_segment_id,
              booking_id,
              order_id,
              sandbox_trip_id,
              segment_type,
              segment_reason,
              started_at,
              ended_at,
              vehicle_id,
              vin,
              driver_id,
              safety_operator_id,
              source_platform,
              distance_km,
              duration_seconds,
              cost_minor,
              currency,
              evidence_reference,
              created_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
              $11, $12, $13, $14, $15, $16, $17, $18, $19
            )
            ON CONFLICT (fulfillment_segment_id) DO UPDATE SET
              booking_id = EXCLUDED.booking_id,
              order_id = EXCLUDED.order_id,
              sandbox_trip_id = EXCLUDED.sandbox_trip_id,
              segment_type = EXCLUDED.segment_type,
              segment_reason = EXCLUDED.segment_reason,
              started_at = EXCLUDED.started_at,
              ended_at = EXCLUDED.ended_at,
              vehicle_id = EXCLUDED.vehicle_id,
              vin = EXCLUDED.vin,
              driver_id = EXCLUDED.driver_id,
              safety_operator_id = EXCLUDED.safety_operator_id,
              source_platform = EXCLUDED.source_platform,
              distance_km = EXCLUDED.distance_km,
              duration_seconds = EXCLUDED.duration_seconds,
              cost_minor = EXCLUDED.cost_minor,
              currency = EXCLUDED.currency,
              evidence_reference = EXCLUDED.evidence_reference,
              created_at = EXCLUDED.created_at
          `,
          [
            segment.fulfillmentSegmentId,
            segment.bookingId,
            segment.orderId,
            segment.sandboxTripId,
            segment.segmentType,
            segment.segmentReason,
            segment.startedAt,
            segment.endedAt,
            segment.vehicleId,
            segment.vin,
            segment.driverId,
            segment.safetyOperatorId,
            segment.sourcePlatform,
            segment.distanceKm,
            segment.durationSeconds,
            segment.cost?.amountMinor ?? null,
            segment.cost?.currency ?? DEFAULT_CURRENCY,
            segment.evidenceReference,
            segment.createdAt,
          ],
        ),
      );
    }

    for (const treatment of changes.sandboxBillingTreatments ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO av_sandbox.sandbox_billing_treatments (
              sandbox_billing_treatment_id,
              booking_id,
              order_id,
              sandbox_trip_id,
              treatment_type,
              fallback_cost_absorber,
              fallback_policy_id,
              policy_resolution,
              passenger_extra_charge_allowed,
              passenger_extra_charge_minor,
              internal_av_cost_minor,
              internal_human_fallback_cost_minor,
              partner_charge_minor,
              tenant_charge_minor,
              platform_absorbed_minor,
              currency,
              treatment_snapshot,
              created_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
              $11, $12, $13, $14, $15, $16, $17::jsonb, $18
            )
            ON CONFLICT (sandbox_billing_treatment_id) DO UPDATE SET
              booking_id = EXCLUDED.booking_id,
              order_id = EXCLUDED.order_id,
              sandbox_trip_id = EXCLUDED.sandbox_trip_id,
              treatment_type = EXCLUDED.treatment_type,
              fallback_cost_absorber = EXCLUDED.fallback_cost_absorber,
              fallback_policy_id = EXCLUDED.fallback_policy_id,
              policy_resolution = EXCLUDED.policy_resolution,
              passenger_extra_charge_allowed = EXCLUDED.passenger_extra_charge_allowed,
              passenger_extra_charge_minor = EXCLUDED.passenger_extra_charge_minor,
              internal_av_cost_minor = EXCLUDED.internal_av_cost_minor,
              internal_human_fallback_cost_minor = EXCLUDED.internal_human_fallback_cost_minor,
              partner_charge_minor = EXCLUDED.partner_charge_minor,
              tenant_charge_minor = EXCLUDED.tenant_charge_minor,
              platform_absorbed_minor = EXCLUDED.platform_absorbed_minor,
              currency = EXCLUDED.currency,
              treatment_snapshot = EXCLUDED.treatment_snapshot,
              created_at = EXCLUDED.created_at
          `,
          [
            treatment.sandboxBillingTreatmentId,
            treatment.bookingId,
            treatment.orderId,
            treatment.sandboxTripId,
            treatment.treatmentType,
            treatment.fallbackCostAbsorber,
            treatment.fallbackPolicyId,
            treatment.policyResolution,
            treatment.passengerExtraChargeAllowed,
            treatment.passengerExtraCharge.amountMinor,
            treatment.internalAvCost?.amountMinor ?? null,
            treatment.internalHumanFallbackCost?.amountMinor ?? null,
            treatment.partnerCharge?.amountMinor ?? null,
            treatment.tenantCharge?.amountMinor ?? null,
            treatment.platformAbsorbed?.amountMinor ?? null,
            treatment.passengerExtraCharge.currency,
            JSON.stringify({
              ...treatment.treatmentSnapshot,
              fallbackSurchargeApplied: treatment.fallbackSurchargeApplied,
            }),
            treatment.createdAt,
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

  private mapLiveSettlementTrips(
    rows: readonly LiveSettlementTripRow[],
  ): LiveSettlementTripRecord[] {
    return rows.map((row) => {
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
        tenantId: order.tenantId ?? "",
        driverId: task.driverId,
        orderId: order.orderId,
        bookingId: order.bookingId,
        completedAt: task.completedAt ?? order.updatedAt,
        grossEarning: { ...grossEarning },
        orderSource: order.orderSource,
        serviceBucket: order.serviceBucket,
        businessDispatchSubtype: order.businessDispatchSubtype,
        costCenterCode: order.costCenter,
        riderId: order.passenger?.passengerId ?? null,
        partnerId: order.partnerId,
        partnerProgramId: order.partnerProgramId,
        partnerEntrySlug: order.partnerEntrySlug,
        eligibilityVerificationId: order.eligibilityVerificationId,
        issuerAuthorizationRef: order.issuerAuthorizationRef,
        benefitReference: order.benefitReference,
        serviceProduct: order.businessDispatchSubtype,
        tenantServiceProgramId: null,
        sourcePlatform: order.orderSource,
      };
    });
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }

    return record as T;
  }

  private mapFulfillmentSegmentRow(
    row: FulfillmentSegmentRow,
  ): FulfillmentSegmentRecord {
    return {
      fulfillmentSegmentId: row.fulfillment_segment_id,
      bookingId: row.booking_id,
      orderId: row.order_id,
      sandboxTripId: row.sandbox_trip_id,
      segmentType: row.segment_type,
      segmentReason: row.segment_reason,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      vehicleId: row.vehicle_id,
      vin: row.vin,
      driverId: row.driver_id,
      safetyOperatorId: row.safety_operator_id,
      sourcePlatform: row.source_platform,
      distanceKm: row.distance_km === null ? null : Number(row.distance_km),
      durationSeconds: row.duration_seconds,
      cost:
        row.cost_minor === null
          ? null
          : {
              currency: row.currency,
              amountMinor: Number(row.cost_minor),
            },
      evidenceReference: row.evidence_reference,
      createdAt: row.created_at,
    };
  }

  private mapSandboxBillingTreatmentRow(
    row: SandboxBillingTreatmentRow,
  ): SandboxBillingTreatmentRecord {
    const treatmentSnapshot =
      row.treatment_snapshot && typeof row.treatment_snapshot === "object"
        ? (row.treatment_snapshot as Record<string, unknown>)
        : {};

    return {
      sandboxBillingTreatmentId: row.sandbox_billing_treatment_id,
      bookingId: row.booking_id,
      orderId: row.order_id,
      sandboxTripId: row.sandbox_trip_id,
      treatmentType: row.treatment_type,
      fallbackCostAbsorber: row.fallback_cost_absorber,
      fallbackPolicyId: row.fallback_policy_id,
      policyResolution: row.policy_resolution,
      passengerExtraChargeAllowed: row.passenger_extra_charge_allowed,
      passengerExtraCharge: {
        currency: row.currency,
        amountMinor: Number(row.passenger_extra_charge_minor),
      },
      internalAvCost: this.toOptionalMoney(
        row.internal_av_cost_minor,
        row.currency,
      ),
      internalHumanFallbackCost: this.toOptionalMoney(
        row.internal_human_fallback_cost_minor,
        row.currency,
      ),
      partnerCharge: this.toOptionalMoney(row.partner_charge_minor, row.currency),
      tenantCharge: this.toOptionalMoney(row.tenant_charge_minor, row.currency),
      platformAbsorbed: this.toOptionalMoney(
        row.platform_absorbed_minor,
        row.currency,
      ),
      fallbackSurchargeApplied:
        treatmentSnapshot.fallbackSurchargeApplied === true,
      treatmentSnapshot,
      createdAt: row.created_at,
    };
  }

  private toOptionalMoney(
    amountMinor: string | number | null,
    currency: string,
  ) {
    return amountMinor === null
      ? null
      : {
          currency,
          amountMinor: Number(amountMinor),
        };
  }
}
