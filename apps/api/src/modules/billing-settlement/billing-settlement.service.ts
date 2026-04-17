import { createHash, randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  ApproveReimbursementBatchCommand,
  AuditLogRecord,
  DriverFeePlanRecord,
  DriverStatementLineRecord,
  DriverStatementRecord,
  GenerateDriverStatementCommand,
  GenerateTenantInvoiceCommand,
  InvoiceLineRecord,
  MarkReimbursementPaidCommand,
  MoneyAmount,
  PublishDriverFeePlanCommand,
  ReimbursementBatchRecord,
  ReimbursementItemRecord,
  TenantBillingProfile,
  TenantInvoiceRecord,
  UpdateTenantBillingProfileCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import {
  BillingSettlementRepository,
  type LiveSettlementTripRecord,
  type PersistBillingSettlementChanges,
} from "./billing-settlement.repository";
import {
  DEFAULT_CONTROLLED_DOWNLOAD_HOST,
  DEFAULT_CONTROLLED_DOWNLOAD_KEY_ID,
  DEFAULT_CONTROLLED_DOWNLOAD_SECRET,
  DEFAULT_CONTROLLED_DOWNLOAD_SIGNATURE_VERSION,
  DEFAULT_CONTROLLED_DOWNLOAD_TTL_MINUTES,
  createControlledDownloadMetadata,
  type ControlledDownloadMetadata,
} from "../reporting-filing/download-signing.util";

const DEMO_TENANT_ID = "tenant-demo-001";
const DEFAULT_CURRENCY = "NTD";
const LIVE_SETTLEMENT_PRICING_VERSION = "tenant-pricing-live";

type SettlementTripSnapshot = {
  settlementId: string;
  tenantId: string;
  driverId: string;
  orderId: string;
  completedAt: string;
  grossEarning: MoneyAmount;
  subsidy: MoneyAmount;
  platformFundedDiscount: MoneyAmount;
  pricingVersionSnapshot: string;
  eligibleForTenantInvoice: boolean;
  eligibleForDriverStatement: boolean;
};

type StoredTenantInvoice = TenantInvoiceRecord & {
  artifactDownloadMetadata: ControlledDownloadMetadata;
};

type ReimbursementBatchFilters = {
  status?: ReimbursementBatchRecord["status"];
  periodMonth?: string;
  driverId?: string;
  statementId?: string;
};

const SETTLEMENT_TRIP_SEED: SettlementTripSnapshot[] = [
  {
    settlementId: "settlement-202603-001",
    tenantId: DEMO_TENANT_ID,
    driverId: "drv-demo-001",
    orderId: "order-demo-031",
    completedAt: "2026-03-05T09:40:00Z",
    grossEarning: {
      currency: DEFAULT_CURRENCY,
      amountMinor: 120000,
    },
    subsidy: {
      currency: DEFAULT_CURRENCY,
      amountMinor: 5000,
    },
    platformFundedDiscount: {
      currency: DEFAULT_CURRENCY,
      amountMinor: 0,
    },
    pricingVersionSnapshot: "tenant-pricing-v1",
    eligibleForTenantInvoice: true,
    eligibleForDriverStatement: true,
  },
  {
    settlementId: "settlement-202603-002",
    tenantId: DEMO_TENANT_ID,
    driverId: "drv-demo-001",
    orderId: "order-demo-032",
    completedAt: "2026-03-18T18:20:00Z",
    grossEarning: {
      currency: DEFAULT_CURRENCY,
      amountMinor: 80000,
    },
    subsidy: {
      currency: DEFAULT_CURRENCY,
      amountMinor: 0,
    },
    platformFundedDiscount: {
      currency: DEFAULT_CURRENCY,
      amountMinor: 20000,
    },
    pricingVersionSnapshot: "tenant-pricing-v1",
    eligibleForTenantInvoice: true,
    eligibleForDriverStatement: true,
  },
  {
    settlementId: "settlement-202603-003",
    tenantId: DEMO_TENANT_ID,
    driverId: "drv-demo-002",
    orderId: "order-demo-033",
    completedAt: "2026-03-22T12:00:00Z",
    grossEarning: {
      currency: DEFAULT_CURRENCY,
      amountMinor: 150000,
    },
    subsidy: {
      currency: DEFAULT_CURRENCY,
      amountMinor: 10000,
    },
    platformFundedDiscount: {
      currency: DEFAULT_CURRENCY,
      amountMinor: 0,
    },
    pricingVersionSnapshot: "tenant-pricing-v1",
    eligibleForTenantInvoice: true,
    eligibleForDriverStatement: true,
  },
];

@Injectable()
export class BillingSettlementService implements OnModuleInit {
  private tenantBillingProfiles = new Map<string, TenantBillingProfile>([
    [DEMO_TENANT_ID, this.createDefaultBillingProfile(DEMO_TENANT_ID)],
  ]);

  private tenantInvoices: StoredTenantInvoice[] = [];

  private driverFeePlans: DriverFeePlanRecord[] = [];

  private driverStatements: DriverStatementRecord[] = [];

  private reimbursementBatches: ReimbursementBatchRecord[] = [];

  private readonly downloadHost = DEFAULT_CONTROLLED_DOWNLOAD_HOST;

  private readonly downloadSigningKeyId = DEFAULT_CONTROLLED_DOWNLOAD_KEY_ID;

  private readonly downloadSigningSecret = DEFAULT_CONTROLLED_DOWNLOAD_SECRET;

  private readonly downloadSignatureVersion =
    DEFAULT_CONTROLLED_DOWNLOAD_SIGNATURE_VERSION;

  private readonly downloadExpiryMinutes =
    DEFAULT_CONTROLLED_DOWNLOAD_TTL_MINUTES;

  private settlementTrips = SETTLEMENT_TRIP_SEED.map((trip) => ({
    ...trip,
    grossEarning: { ...trip.grossEarning },
    subsidy: { ...trip.subsidy },
    platformFundedDiscount: { ...trip.platformFundedDiscount },
  }));

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    @Optional()
    private readonly billingSettlementRepository?: BillingSettlementRepository,
  ) {}

  async onModuleInit() {
    if (!this.billingSettlementRepository) {
      return;
    }

    try {
      const persistedState = await this.billingSettlementRepository.loadState();
      const hasPersistedState =
        persistedState.tenantBillingProfiles.length > 0 ||
        persistedState.tenantInvoices.length > 0 ||
        persistedState.driverFeePlans.length > 0 ||
        persistedState.driverStatements.length > 0 ||
        persistedState.reimbursementBatches.length > 0;

      if (!hasPersistedState) {
        this.persistChanges(
          {
            tenantBillingProfiles: this.listStoredTenantBillingProfiles(),
          },
          "module init bootstrap",
        );
        return;
      }

      this.tenantBillingProfiles = new Map(
        persistedState.tenantBillingProfiles.map((profile) => [
          profile.tenantId,
          this.cloneBillingProfile(profile),
        ]),
      );
      this.tenantInvoices = persistedState.tenantInvoices.map((invoice) =>
        this.cloneInvoice(invoice),
      );
      this.driverFeePlans = persistedState.driverFeePlans.map((plan) => ({
        ...plan,
      }));
      this.driverStatements = persistedState.driverStatements.map((statement) =>
        this.cloneStatement(statement),
      );
      this.reimbursementBatches = persistedState.reimbursementBatches.map(
        (batch) => this.cloneReimbursementBatch(batch),
      );
    } catch (error) {
      this.billingSettlementRepository.reportPersistenceFailure(
        error,
        "module init",
      );
    }
  }

  getTenantBillingProfile(tenantId: string) {
    return this.cloneBillingProfile(this.requireTenantBillingProfile(tenantId));
  }

  updateTenantBillingProfile(
    tenantId: string,
    command: UpdateTenantBillingProfileCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.invoiceTitle, "invoiceTitle");
    this.assertNonBlank(command.email, "email");

    const profile: TenantBillingProfile = {
      tenantId,
      invoiceTitle: command.invoiceTitle,
      taxId: command.taxId?.trim() || null,
      address: command.address?.trim() || null,
      contactName: command.contactName?.trim() || null,
      email: command.email,
      updatedAt: new Date().toISOString(),
    };
    this.tenantBillingProfiles.set(tenantId, this.cloneBillingProfile(profile));
    this.persistChanges(
      {
        tenantBillingProfiles: [this.cloneBillingProfile(profile)],
      },
      "update_tenant_billing_profile",
    );

    this.recordAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId,
        moduleName: "billing-settlement",
        actionName: "update_tenant_billing_profile",
        resourceType: "tenant_billing_profile",
        resourceId: tenantId,
        newValuesSummary: {
          invoiceTitle: profile.invoiceTitle,
          email: profile.email,
        },
      },
      requestId,
    );

    return this.getTenantBillingProfile(tenantId);
  }

  async generateTenantInvoice(
    tenantId: string,
    command: GenerateTenantInvoiceCommand,
    requestId?: string,
  ) {
    this.assertTenantScope(tenantId, command.tenantId);
    this.assertClosedPeriod(command.periodStart, command.periodEnd);

    const existingInvoice = this.tenantInvoices.find(
      (invoice) =>
        invoice.tenantId === command.tenantId &&
        invoice.periodStart === command.periodStart &&
        invoice.periodEnd === command.periodEnd,
    );
    if (existingInvoice) {
      return this.cloneInvoice(existingInvoice);
    }

    const eligibleTrips = (
      await this.listTenantInvoiceTripsInPeriod(
        command.tenantId,
        command.periodStart,
        command.periodEnd,
      )
    ).filter((trip) => trip.eligibleForTenantInvoice);

    if (eligibleTrips.length === 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "No eligible trips found for the requested billing period.",
        {
          tenantId: command.tenantId,
          periodStart: command.periodStart,
          periodEnd: command.periodEnd,
        },
      );
    }

    const lines: InvoiceLineRecord[] = eligibleTrips.map((trip) => ({
      lineId: `invoice-line-${randomUUID()}`,
      orderId: trip.orderId,
      description: `Completed owned trip ${trip.orderId}`,
      amount: { ...trip.grossEarning },
    }));
    const amount = this.sumMoney(lines.map((line) => line.amount));
    const now = new Date().toISOString();
    const invoiceId = `invoice-${randomUUID()}`;
    const artifactDownloadMetadata = createControlledDownloadMetadata({
      kind: "tenant-invoice",
      subjectId: invoiceId,
      manifestHash: this.computeHash({
        invoiceId,
        tenantId: command.tenantId,
        periodStart: command.periodStart,
        periodEnd: command.periodEnd,
        amount,
        lineCount: lines.length,
      }),
      createdAt: now,
      host: this.downloadHost,
      keyId: this.downloadSigningKeyId,
      signingSecret: this.downloadSigningSecret,
      ttlMinutes: this.downloadExpiryMinutes,
      signatureVersion: this.downloadSignatureVersion,
    });
    const invoice: StoredTenantInvoice = {
      invoiceId,
      tenantId: command.tenantId,
      periodStart: command.periodStart,
      periodEnd: command.periodEnd,
      amount,
      status: "issued",
      artifactUrl: artifactDownloadMetadata.downloadUrl,
      pricingVersionSnapshot: eligibleTrips[0]!.pricingVersionSnapshot,
      lines,
      createdAt: now,
      updatedAt: now,
      artifactDownloadMetadata,
    };

    this.tenantInvoices = [this.cloneInvoice(invoice), ...this.tenantInvoices];
    this.persistChanges(
      {
        tenantInvoices: [this.cloneInvoice(invoice)],
      },
      "generate_tenant_invoice",
    );
    this.auditNotificationService.recordNotification({
      tenantId: command.tenantId,
      channel: "ops_notice",
      title: "Tenant invoice generated",
      message: `Invoice ${invoiceId} was generated for ${command.periodStart} to ${command.periodEnd}.`,
      status: "unread",
    });
    this.recordAudit(
      {
        actorId: null,
        actorType: "system",
        tenantId: command.tenantId,
        moduleName: "billing-settlement",
        actionName: "generate_tenant_invoice",
        resourceType: "tenant_invoice",
        resourceId: invoiceId,
        newValuesSummary: {
          status: invoice.status,
          lineCount: invoice.lines.length,
          artifactUrl: invoice.artifactUrl,
          artifactDownloadExpiresAt: artifactDownloadMetadata.expiresAt,
          artifactDownloadKeyId: artifactDownloadMetadata.keyId,
        },
      },
      requestId,
    );

    return this.cloneInvoice(invoice);
  }

  listTenantInvoices(tenantId: string) {
    return this.tenantInvoices
      .filter((invoice) => invoice.tenantId === tenantId)
      .map((invoice) => this.cloneInvoice(invoice));
  }

  getTenantInvoice(tenantId: string, invoiceId: string) {
    const invoice = this.tenantInvoices.find(
      (candidate) =>
        candidate.invoiceId === invoiceId && candidate.tenantId === tenantId,
    );
    if (!invoice) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "Tenant invoice not found.",
        {
          invoiceId,
        },
      );
    }
    return this.cloneInvoice(invoice);
  }

  publishDriverFeePlan(
    command: PublishDriverFeePlanCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.planName, "planName");
    this.assertNonBlank(command.version, "version");

    const duplicatePlan = this.driverFeePlans.find(
      (plan) =>
        plan.planName === command.planName && plan.version === command.version,
    );
    if (duplicatePlan) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "FEE_PLAN_IMMUTABLE",
        "Published driver fee plan versions are immutable.",
        {
          planName: command.planName,
          version: command.version,
        },
      );
    }

    const feePlan: DriverFeePlanRecord = {
      feePlanId: `fee-plan-${randomUUID()}`,
      planName: command.planName,
      version: command.version,
      serviceFeeBps: command.serviceFeeBps,
      reimbursementMode: command.reimbursementMode,
      status: "published",
      publishedAt: new Date().toISOString(),
    };

    this.driverFeePlans = [{ ...feePlan }, ...this.driverFeePlans];
    this.persistChanges(
      {
        driverFeePlans: [{ ...feePlan }],
      },
      "publish_driver_fee_plan",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "billing-settlement",
        actionName: "publish_driver_fee_plan",
        resourceType: "driver_fee_plan",
        resourceId: feePlan.feePlanId,
        newValuesSummary: {
          version: feePlan.version,
          serviceFeeBps: feePlan.serviceFeeBps,
          reimbursementMode: feePlan.reimbursementMode,
        },
      },
      requestId,
    );

    return {
      ...feePlan,
    };
  }

  listDriverFeePlans() {
    return this.driverFeePlans.map((plan) => ({
      ...plan,
    }));
  }

  generateDriverStatements(
    command: GenerateDriverStatementCommand,
    requestId?: string,
  ) {
    const activeFeePlan = this.driverFeePlans[0];
    if (!activeFeePlan) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "An active published driver fee plan is required.",
        {
          periodMonth: command.periodMonth,
        },
      );
    }

    const existingStatements = this.driverStatements.filter(
      (statement) =>
        statement.periodMonth === command.periodMonth &&
        statement.feePlanVersion === activeFeePlan.version,
    );
    if (existingStatements.length > 0) {
      const reimbursementBatchIds = this.reimbursementBatches
        .filter((batch) => batch.periodMonth === command.periodMonth)
        .map((batch) => batch.batchId);
      return {
        items: existingStatements.map((statement) =>
          this.cloneStatement(statement),
        ),
        reimbursementBatchIds,
      };
    }

    const eligibleTrips = this.settlementTrips.filter(
      (trip) =>
        this.toPeriodMonth(trip.completedAt) === command.periodMonth &&
        trip.eligibleForDriverStatement,
    );
    if (eligibleTrips.length === 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "No eligible trips found for the requested statement period.",
        {
          periodMonth: command.periodMonth,
        },
      );
    }

    const statementsByDriver = new Map<string, SettlementTripSnapshot[]>();
    for (const trip of eligibleTrips) {
      const currentTrips = statementsByDriver.get(trip.driverId) ?? [];
      statementsByDriver.set(trip.driverId, [...currentTrips, trip]);
    }

    const generatedStatements: DriverStatementRecord[] = [];
    const generatedReimbursements: ReimbursementBatchRecord[] = [];

    for (const [driverId, driverTrips] of statementsByDriver.entries()) {
      const lines = driverTrips.map((trip) =>
        this.createStatementLine(trip, activeFeePlan.serviceFeeBps),
      );
      const now = new Date().toISOString();
      const statementId = `statement-${randomUUID()}`;
      const statement: DriverStatementRecord = {
        statementId,
        driverId,
        periodMonth: command.periodMonth,
        receiptNo: `DRV-${command.periodMonth.replace("-", "")}-${driverId.slice(-3)}`,
        payoutStatus: "pending",
        grossEarning: this.sumMoney(lines.map((line) => line.grossEarning)),
        serviceFee: this.sumMoney(lines.map((line) => line.serviceFee)),
        subsidy: this.sumMoney(lines.map((line) => line.subsidy)),
        netAmount: this.sumMoney(lines.map((line) => line.netAmount)),
        feePlanVersion: activeFeePlan.version,
        lines,
        createdAt: now,
        updatedAt: now,
      };

      generatedStatements.push(statement);
      this.auditNotificationService.recordNotification({
        tenantId: null,
        channel: "driver_task",
        title: "Driver statement generated",
        message: `Statement ${statement.receiptNo} is ready for driver ${driverId}.`,
        status: "unread",
      });
      this.recordAudit(
        {
          actorId: null,
          actorType: "system",
          tenantId: null,
          moduleName: "billing-settlement",
          actionName: "generate_driver_statement",
          resourceType: "driver_statement",
          resourceId: statement.statementId,
          newValuesSummary: {
            driverId,
            periodMonth: statement.periodMonth,
            feePlanVersion: statement.feePlanVersion,
          },
        },
        requestId,
      );

      const reimbursementItems = this.createReimbursementItems(
        driverTrips,
        activeFeePlan.reimbursementMode,
      );
      if (reimbursementItems.length > 0) {
        const reimbursementBatch: ReimbursementBatchRecord = {
          batchId: `reimbursement-${randomUUID()}`,
          driverId,
          statementId,
          periodMonth: command.periodMonth,
          status: "pending",
          totalAmount: this.sumMoney(
            reimbursementItems.map((item) => item.amount),
          ),
          remittanceProofId: null,
          items: reimbursementItems,
          approvedAt: null,
          paidAt: null,
        };
        generatedReimbursements.push(reimbursementBatch);
        this.auditNotificationService.recordNotification({
          tenantId: null,
          channel: "ops_notice",
          title: "Driver reimbursement batch created",
          message: `Reimbursement batch ${reimbursementBatch.batchId} was created for driver ${driverId}.`,
          status: "unread",
        });
        this.recordAudit(
          {
            actorId: null,
            actorType: "system",
            tenantId: null,
            moduleName: "billing-settlement",
            actionName: "generate_reimbursement_batch",
            resourceType: "driver_reimbursement_batch",
            resourceId: reimbursementBatch.batchId,
            newValuesSummary: {
              driverId,
              statementId,
              totalAmountMinor: reimbursementBatch.totalAmount.amountMinor,
            },
          },
          requestId,
        );
      }
    }

    this.driverStatements = [...generatedStatements, ...this.driverStatements];
    this.reimbursementBatches = [
      ...generatedReimbursements,
      ...this.reimbursementBatches,
    ];
    this.persistChanges(
      {
        driverStatements: generatedStatements.map((statement) =>
          this.cloneStatement(statement),
        ),
        reimbursementBatches: generatedReimbursements.map((batch) =>
          this.cloneReimbursementBatch(batch),
        ),
      },
      "generate_driver_statements",
    );

    return {
      items: generatedStatements.map((statement) =>
        this.cloneStatement(statement),
      ),
      reimbursementBatchIds: generatedReimbursements.map(
        (batch) => batch.batchId,
      ),
    };
  }

  listDriverStatements(periodMonth?: string) {
    return this.driverStatements
      .filter(
        (statement) =>
          !periodMonth || statement.periodMonth.trim() === periodMonth.trim(),
      )
      .map((statement) => this.cloneStatement(statement));
  }

  getDriverStatement(statementId: string) {
    const statement = this.driverStatements.find(
      (candidate) => candidate.statementId === statementId,
    );
    if (!statement) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "Driver statement not found.",
        {
          statementId,
        },
      );
    }
    return this.cloneStatement(statement);
  }

  listReimbursementBatches(filters: ReimbursementBatchFilters = {}) {
    return this.reimbursementBatches
      .filter((batch) => {
        if (filters.status && batch.status !== filters.status) {
          return false;
        }
        if (filters.periodMonth && batch.periodMonth !== filters.periodMonth) {
          return false;
        }
        if (filters.driverId && batch.driverId !== filters.driverId) {
          return false;
        }
        if (filters.statementId && batch.statementId !== filters.statementId) {
          return false;
        }
        return true;
      })
      .map((batch) => this.cloneReimbursementBatch(batch));
  }

  approveReimbursementBatch(
    batchId: string,
    command: ApproveReimbursementBatchCommand,
    requestId?: string,
  ) {
    const batch = this.requireReimbursementBatch(batchId);
    if (batch.statementId !== command.statementId) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "Statement id does not match the reimbursement batch.",
        {
          batchId,
          statementId: command.statementId,
          expectedStatementId: batch.statementId,
        },
      );
    }

    if (batch.approvedAt) {
      return this.cloneReimbursementBatch(batch);
    }

    batch.approvedAt = new Date().toISOString();
    this.persistChanges(
      {
        reimbursementBatches: [this.cloneReimbursementBatch(batch)],
      },
      "approve_reimbursement_batch",
    );
    this.auditNotificationService.recordNotification({
      tenantId: null,
      channel: "ops_notice",
      title: "Reimbursement batch approved",
      message: `Reimbursement batch ${batch.batchId} is approved and ready for remittance.`,
      status: "unread",
    });
    this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "billing-settlement",
        actionName: "approve_reimbursement_batch",
        resourceType: "driver_reimbursement_batch",
        resourceId: batch.batchId,
        newValuesSummary: {
          driverId: batch.driverId,
          statementId: batch.statementId,
          approvedAt: batch.approvedAt,
        },
      },
      requestId,
    );

    return this.cloneReimbursementBatch(batch);
  }

  markReimbursementPaid(
    batchId: string,
    command: MarkReimbursementPaidCommand,
    requestId?: string,
  ) {
    const batch = this.requireReimbursementBatch(batchId);
    if (!batch.approvedAt) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "REIMBURSEMENT_NOT_APPROVED",
        "Reimbursement batch must be approved before it can be marked as paid.",
        {
          batchId,
        },
      );
    }

    if (batch.status === "paid") {
      return this.cloneReimbursementBatch(batch);
    }

    const remittanceProofId =
      command.remittanceProofId?.trim() || batch.remittanceProofId;
    if (!remittanceProofId) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "remittanceProofId is required to mark reimbursement paid.",
        {
          batchId,
        },
      );
    }

    const paidAt = command.paidAt?.trim() || new Date().toISOString();
    if (Number.isNaN(new Date(paidAt).getTime())) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "paidAt must be a valid ISO timestamp.",
        {
          batchId,
          paidAt,
        },
      );
    }

    batch.status = "paid";
    batch.paidAt = paidAt;
    batch.remittanceProofId = remittanceProofId;

    const relatedStatement = this.driverStatements.find(
      (statement) => statement.statementId === batch.statementId,
    );
    if (relatedStatement) {
      relatedStatement.payoutStatus = "paid";
      relatedStatement.updatedAt = paidAt;
    }

    this.persistChanges(
      {
        reimbursementBatches: [this.cloneReimbursementBatch(batch)],
        ...(relatedStatement
          ? {
              driverStatements: [this.cloneStatement(relatedStatement)],
            }
          : {}),
      },
      "mark_reimbursement_paid",
    );
    this.auditNotificationService.recordNotification({
      tenantId: null,
      channel: "ops_notice",
      title: "Reimbursement batch paid",
      message: `Reimbursement batch ${batch.batchId} was marked paid with remittance proof ${remittanceProofId}.`,
      status: "unread",
    });
    this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "billing-settlement",
        actionName: "mark_reimbursement_paid",
        resourceType: "driver_reimbursement_batch",
        resourceId: batch.batchId,
        newValuesSummary: {
          driverId: batch.driverId,
          statementId: batch.statementId,
          remittanceProofId,
          paidAt,
          status: batch.status,
        },
      },
      requestId,
    );

    return this.cloneReimbursementBatch(batch);
  }

  getReimbursementBatch(batchId: string) {
    const batch = this.requireReimbursementBatch(batchId);
    return this.cloneReimbursementBatch(batch);
  }

  private createStatementLine(
    trip: SettlementTripSnapshot,
    serviceFeeBps: number,
  ): DriverStatementLineRecord {
    const serviceFeeMinor = Math.round(
      (trip.grossEarning.amountMinor * serviceFeeBps) / 10000,
    );
    const netAmountMinor =
      trip.grossEarning.amountMinor -
      serviceFeeMinor +
      trip.subsidy.amountMinor;

    return {
      lineId: `statement-line-${randomUUID()}`,
      orderId: trip.orderId,
      grossEarning: { ...trip.grossEarning },
      serviceFee: this.money(serviceFeeMinor),
      subsidy: { ...trip.subsidy },
      netAmount: this.money(netAmountMinor),
      reimbursementRequired: trip.platformFundedDiscount.amountMinor > 0,
    };
  }

  private createReimbursementItems(
    trips: SettlementTripSnapshot[],
    reimbursementMode: DriverFeePlanRecord["reimbursementMode"],
  ) {
    if (reimbursementMode !== "platform_funded") {
      return [];
    }

    return trips
      .filter((trip) => trip.platformFundedDiscount.amountMinor > 0)
      .map(
        (trip): ReimbursementItemRecord => ({
          itemId: `reimbursement-item-${randomUUID()}`,
          orderId: trip.orderId,
          amount: { ...trip.platformFundedDiscount },
          reason: "platform_funded_discount",
        }),
      );
  }

  private async listTenantInvoiceTripsInPeriod(
    tenantId: string,
    periodStart: string,
    periodEnd: string,
  ) {
    const seededTrips = this.listSeedSettlementTripsInPeriod(
      tenantId,
      periodStart,
      periodEnd,
    );
    const liveTrips = await this.listLiveSettlementTripsInPeriod(
      tenantId,
      periodStart,
      periodEnd,
    );
    const tripMap = new Map<string, SettlementTripSnapshot>();

    for (const trip of seededTrips) {
      tripMap.set(trip.orderId, trip);
    }
    for (const trip of liveTrips) {
      tripMap.set(trip.orderId, trip);
    }

    return [...tripMap.values()].sort((left, right) =>
      right.completedAt.localeCompare(left.completedAt),
    );
  }

  private async listLiveSettlementTripsInPeriod(
    tenantId: string,
    periodStart: string,
    periodEnd: string,
  ) {
    if (!this.billingSettlementRepository?.isEnabled()) {
      return [];
    }

    try {
      const trips =
        await this.billingSettlementRepository.listLiveCompletedTenantTrips(
          tenantId,
          periodStart,
          periodEnd,
        );
      return trips.map((trip) => this.mapLiveTripToSettlementSnapshot(trip));
    } catch (error) {
      this.billingSettlementRepository.reportPersistenceFailure(
        error,
        "list_live_completed_tenant_trips",
      );
      return [];
    }
  }

  private listSeedSettlementTripsInPeriod(
    tenantId: string,
    periodStart: string,
    periodEnd: string,
  ) {
    const start = new Date(periodStart).getTime();
    const end = new Date(periodEnd).getTime();

    return this.settlementTrips.filter((trip) => {
      const completedAt = new Date(trip.completedAt).getTime();
      return (
        trip.tenantId === tenantId && completedAt >= start && completedAt <= end
      );
    });
  }

  private mapLiveTripToSettlementSnapshot(
    trip: LiveSettlementTripRecord,
  ): SettlementTripSnapshot {
    return {
      settlementId: `settlement-live-${trip.orderId}`,
      tenantId: trip.tenantId,
      driverId: trip.driverId,
      orderId: trip.orderId,
      completedAt: trip.completedAt,
      grossEarning: { ...trip.grossEarning },
      subsidy: this.money(0),
      platformFundedDiscount: this.money(0),
      pricingVersionSnapshot: LIVE_SETTLEMENT_PRICING_VERSION,
      eligibleForTenantInvoice: true,
      eligibleForDriverStatement: true,
    };
  }

  private assertClosedPeriod(periodStart: string, periodEnd: string) {
    const start = new Date(periodStart).getTime();
    const end = new Date(periodEnd).getTime();
    const now = Date.now();

    if (Number.isNaN(start) || Number.isNaN(end) || start >= end) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "Billing period is invalid.",
        {
          periodStart,
          periodEnd,
        },
      );
    }

    if (end >= now) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "Billing period must be closed before invoice generation.",
        {
          periodStart,
          periodEnd,
        },
      );
    }
  }

  private requireReimbursementBatch(batchId: string) {
    const batch = this.reimbursementBatches.find(
      (candidate) => candidate.batchId === batchId,
    );
    if (!batch) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "Reimbursement batch not found.",
        {
          batchId,
        },
      );
    }
    return batch;
  }

  private toPeriodMonth(dateTime: string) {
    return dateTime.slice(0, 7);
  }

  private getPeriodMonthRange(periodMonth: string) {
    const periodStart = `${periodMonth}-01T00:00:00.000Z`;
    const start = new Date(periodStart);
    if (
      Number.isNaN(start.getTime()) ||
      this.toPeriodMonth(periodStart) !== periodMonth
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "periodMonth must be in YYYY-MM format.",
        {
          periodMonth,
        },
      );
    }

    const periodEnd = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1, 0, 0, 0, -1),
    ).toISOString();

    return {
      periodStart,
      periodEnd,
    };
  }

  private createDefaultBillingProfile(tenantId: string): TenantBillingProfile {
    const normalizedTenantId = tenantId.trim() || DEMO_TENANT_ID;
    const emailLocalPart = normalizedTenantId
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return {
      tenantId: normalizedTenantId,
      invoiceTitle:
        normalizedTenantId === DEMO_TENANT_ID
          ? "DRTS Fleet Platform Demo Tenant"
          : `Tenant ${normalizedTenantId}`,
      taxId: normalizedTenantId === DEMO_TENANT_ID ? "12345678" : null,
      address:
        normalizedTenantId === DEMO_TENANT_ID ? "Taichung Port District" : null,
      contactName: "Tenant Billing Owner",
      email: `billing@${emailLocalPart || "tenant"}.example.com`,
      updatedAt: "2026-03-01T00:00:00Z",
    };
  }

  private requireTenantBillingProfile(tenantId: string) {
    return (
      this.tenantBillingProfiles.get(tenantId) ??
      this.createDefaultBillingProfile(tenantId)
    );
  }

  private listStoredTenantBillingProfiles() {
    return [...this.tenantBillingProfiles.values()].map((profile) =>
      this.cloneBillingProfile(profile),
    );
  }

  private assertTenantScope(headerTenantId: string, commandTenantId: string) {
    if (headerTenantId === commandTenantId) {
      return;
    }

    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "TENANT_SCOPE_MISMATCH",
      "Tenant invoice command tenantId must match x-tenant-id.",
      {
        tenantId: headerTenantId,
        commandTenantId,
      },
    );
  }

  private sumMoney(amounts: MoneyAmount[]) {
    return this.money(
      amounts.reduce((sum, amount) => sum + amount.amountMinor, 0),
    );
  }

  private money(amountMinor: number): MoneyAmount {
    return {
      currency: DEFAULT_CURRENCY,
      amountMinor,
    };
  }

  private computeHash(value: unknown) {
    return createHash("sha256")
      .update(this.stableSerialize(value))
      .digest("hex");
  }

  private assertNonBlank(value: string, fieldName: string) {
    if (!value.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${fieldName} is required.`,
        {
          field: fieldName,
        },
      );
    }
  }

  private stableSerialize(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableSerialize(item)).join(",")}]`;
    }
    if (value && typeof value === "object") {
      return `{${Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => {
          const nestedValue = (value as Record<string, unknown>)[key];
          return `${JSON.stringify(key)}:${this.stableSerialize(nestedValue)}`;
        })
        .join(",")}}`;
    }
    return JSON.stringify(value);
  }

  private cloneBillingProfile(
    profile: TenantBillingProfile,
  ): TenantBillingProfile {
    return { ...profile };
  }

  private cloneInvoice(invoice: StoredTenantInvoice) {
    return {
      ...invoice,
      amount: { ...invoice.amount },
      lines: invoice.lines.map((line) => ({
        ...line,
        amount: { ...line.amount },
      })),
      artifactDownloadMetadata: {
        ...invoice.artifactDownloadMetadata,
      },
    };
  }

  private cloneStatement(statement: DriverStatementRecord) {
    return {
      ...statement,
      grossEarning: { ...statement.grossEarning },
      serviceFee: { ...statement.serviceFee },
      subsidy: { ...statement.subsidy },
      netAmount: { ...statement.netAmount },
      lines: statement.lines.map((line) => ({
        ...line,
        grossEarning: { ...line.grossEarning },
        serviceFee: { ...line.serviceFee },
        subsidy: { ...line.subsidy },
        netAmount: { ...line.netAmount },
      })),
    };
  }

  private cloneReimbursementBatch(batch: ReimbursementBatchRecord) {
    return {
      ...batch,
      totalAmount: { ...batch.totalAmount },
      items: batch.items.map((item) => ({
        ...item,
        amount: { ...item.amount },
      })),
    };
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId"> & {
      requestId?: string;
    },
    requestId?: string,
  ) {
    const auditLogInput = {
      ...input,
    };
    if (requestId !== undefined) {
      auditLogInput.requestId = requestId;
    }
    this.auditNotificationService.recordAuditLog(auditLogInput);
  }

  private persistChanges(
    changes: PersistBillingSettlementChanges,
    context: string,
  ) {
    if (!this.billingSettlementRepository) {
      return;
    }

    void this.billingSettlementRepository
      .persistChanges(changes)
      .catch((error: unknown) => {
        this.billingSettlementRepository!.reportPersistenceFailure(
          error,
          context,
        );
      });
  }
}
