import { PLATFORM_CURRENCY } from "@drts/contracts";

import { createHash, randomUUID } from "node:crypto";

import {
  HttpStatus,
  Inject,
  Injectable,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";

import type {
  AddReconciliationIssueCommentCommand,
  ActionReceipt,
  ApproveReimbursementBatchCommand,
  AssignReconciliationIssueCommand,
  AuditLogRecord,
  CrossAppResourceLink,
  CreateReconciliationIssueCommand,
  DriverFeePlanRecord,
  FulfillmentSegmentRecord,
  DriverStatementLineRecord,
  DriverStatementRecord,
  EmptyStateEnvelope,
  GenerateDriverStatementCommand,
  GenerateTenantInvoiceCommand,
  InvoiceLineRecord,
  MarkReimbursementBatchReconciledCommand,
  MarkReimbursementPaidCommand,
  MarkReimbursementPaidWithProofCommand,
  MoneyAmount,
  PassengerPaymentStatus,
  PublishDriverFeePlanCommand,
  ReconciliationIssueCommentRecord,
  ReconciliationIssueRecord,
  ReimbursementBatchExportReceipt,
  ReimbursementBatchReconciliationReceipt,
  ReimbursementBatchRecord,
  ReimbursementBatchWorkflowState,
  ReimbursementItemRecord,
  RemittanceProofPaymentReceipt,
  RemittanceProofReadbackGrant,
  RemittanceProofRecord,
  RequestRemittanceProofReadbackCommand,
  ResourceActionDescriptor,
  SandboxBillingTreatmentRecord,
  ResolveReconciliationIssueCommand,
  ReopenReconciliationIssueCommand,
  SettlementMatrixRecord,
  TenantBillingProfile,
  TenantInvoiceListData,
  TenantInvoiceRecord,
  TenantInvoiceRuntimeRecord,
  TenantPayableLineItem,
  TenantPayableSummary,
  TenantPayableInvoiceStatus,
  UiRefreshMetadata,
  UpdateTenantBillingProfileCommand,
  ReferralRevenueShareRule,
  UploadRemittanceProofCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { sumMoney as sharedSumMoney } from "../../common/money";
import { toActionReceipt } from "../../common/action-receipt";
import type { BootstrapRequestIdentity } from "../../common/auth";
import {
  DOCUMENT_ARTIFACT_REBUILD_REGISTRY,
  DOCUMENT_ARTIFACT_STORE,
  InMemoryDocumentArtifactStore,
  type DocumentArtifactRebuildRegistry,
  type DocumentArtifactRecord,
  type DocumentArtifactStore,
} from "../../common/document-artifacts";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import {
  BillingSettlementRepository,
  type LiveSettlementTripRecord,
  type MultiTaxiPaymentAuditRecord,
  type MultiTaxiPaymentExceptionRecord,
  type PaymentRecoveryState,
  type PersistBillingSettlementChanges,
  type DriverStatementTargetProposal,
  type DriverStatementTargetState,
  type DriverStatementTargetPersistence,
} from "./billing-settlement.repository";
import {
  InjectPaymentRecoveryPort,
  PAYMENT_RECOVERY_ACTIONS,
  type PaymentRecoveryAction,
  type PaymentRecoveryPort,
  UnavailablePaymentRecoveryPort,
} from "./payment-recovery.port";
import { RemittanceProofService } from "./remittance-proof.service";
import { renderBillingDocumentPdf } from "./billing-document-pdf.renderer";
import {
  DEFAULT_CONTROLLED_DOWNLOAD_HOST,
  DEFAULT_CONTROLLED_DOWNLOAD_KEY_ID,
  DEFAULT_CONTROLLED_DOWNLOAD_SECRET,
  DEFAULT_CONTROLLED_DOWNLOAD_SIGNATURE_VERSION,
  DEFAULT_CONTROLLED_DOWNLOAD_TTL_MINUTES,
  createControlledDownloadMetadata,
  type ControlledDownloadMetadata,
} from "../reporting-filing/download-signing.util";
import {
  buildSettlementMatrix,
  settlementChannelKeyForTrip,
} from "./settlement-matrix";
import {
  SETTLEMENT_STATEMENT_CHANNEL_KEY,
  SETTLEMENT_STATEMENT_DIRECTION,
  type SettlementStatementLine,
  type SettlementStatementRecord,
  type SettlementStatementStatus,
} from "./settlement-statement.types";
import {
  REFERRAL_STATEMENT_CHANNEL_KEY,
  REFERRAL_STATEMENT_DIRECTION,
  type ReferralStatementLine,
  type ReferralStatementRecord,
  type ReferralStatementStatus,
} from "./referral-statement.types";
import { ForwarderService } from "../forwarder/forwarder.service";
import {
  OWNED_MOBILITY_TRIP_COMPLETED_EVENT,
  type OwnedMobilityTripCompletedEvent,
} from "../owned-mobility/owned-mobility-events";
import { maskOpaqueToken } from "../../common/sensitive-data-policy";
import { detectAuthEnvironment } from "../../config/auth-startup-config";

const DEMO_TENANT_ID = "tenant-demo-001";
const DEFAULT_CURRENCY = PLATFORM_CURRENCY;
const LIVE_SETTLEMENT_PRICING_VERSION = "tenant-pricing-live";
const TENANT_REFRESH_INTERVAL_MS = 30_000;
const DEFAULT_TENANT_SERVICE_PROGRAM_ID = "tenant-program-enterprise-dispatch";
const PAYMENT_RECOVERY_PROVIDER_NOT_PROVISIONED =
  "payment_recovery_provider_not_provisioned";
const PAYMENT_RECOVERY_PENDING = "payment_recovery_pending";
const PAYMENT_RECOVERY_WRITE_AUTHORITY_REQUIRED =
  "payment_recovery_write_authority_required";
const PAYMENT_RECOVERY_ACTION_SET = new Set<string>(PAYMENT_RECOVERY_ACTIONS);

export type MultiTaxiPaymentExceptionView = {
  paymentId: string;
  orderId: string;
  tripId: string | null;
  status: PassengerPaymentStatus;
  amount: {
    amountMinor: number;
    currency: string;
  } | null;
  safeProviderReference: string | null;
  attemptCount: number;
  recoveryState: PaymentRecoveryState | null;
  lastRecoveryAction: PaymentRecoveryAction | null;
  updatedAt: string;
  availableActions: ResourceActionDescriptor[];
  auditTimeline: Array<{
    auditId: string;
    actorId: string | null;
    actorType: string;
    actionName: string;
    requestId: string | null;
    createdAt: string;
  }>;
};

export type BillingSettlementTripRecord = {
  settlementId: string;
  tenantId: string;
  driverId: string;
  orderId: string;
  completedAt: string;
  orderSource: NonNullable<InvoiceLineRecord["orderSource"]>;
  grossEarning: MoneyAmount;
  subsidy: MoneyAmount;
  platformFundedDiscount: MoneyAmount;
  pricingVersionSnapshot: string;
  eligibleForTenantInvoice: boolean;
  eligibleForDriverStatement: boolean;
  serviceBucket: "business_dispatch";
  businessDispatchSubtype:
    | "enterprise_dispatch"
    | "credit_card_airport_transfer"
    | "insurance_replacement_vehicle"
    | "travel_agency_transfer";
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

type ReconciliationIssueFilters = {
  status?: ReconciliationIssueRecord["status"];
  issueType?: ReconciliationIssueRecord["issueType"];
  channelKey?: string;
};

const PARTNER_SPONSOR_MISMATCH_SEED: ReconciliationIssueRecord[] = [
  {
    issueId: "recon-partner-sponsor-202603-001",
    issueType: "partner_sponsor_mismatch",
    source: "finance_manual",
    status: "open",
    channelKey: "partner_airport",
    summary:
      "Partner sponsor claim does not match issuer authorization references for March airport-transfer settlement.",
    ownerId: "fin-partner-ops",
    openedBy: "finance.review.bot",
    orderId: "order-demo-032",
    tenantId: DEMO_TENANT_ID,
    partnerId: "partner-bank-demo-001",
    partnerProgramId: "program-airport-alpha",
    sponsorReference: "benefit-bank-demo-032",
    mirrorOrderId: null,
    externalOrderId: null,
    linkedReconciliationJobId: null,
    linkedInvoiceId: "invoice-demo-partner-airport-202603",
    linkedReimbursementBatchId: "reimbursement-demo-partner-airport-202603",
    forwardedFinanceContext: null,
    resolutionCode: null,
    resolutionSummary: null,
    resolvedAt: null,
    reopenCount: 0,
    evidenceArtifactIds: [
      "artifact-benefit-ledger-202603",
      "artifact-issuer-032",
    ],
    comments: [
      {
        commentId: "recon-comment-seed-001",
        actorId: "finance.review.bot",
        message:
          "Benefit reference exists, but sponsor export attributes the trip to an inactive March campaign. Finance review required before closeout.",
        artifactIds: ["artifact-benefit-ledger-202603"],
        createdAt: "2026-04-01T03:00:00.000Z",
      },
    ],
    createdAt: "2026-04-01T03:00:00.000Z",
    updatedAt: "2026-04-01T03:00:00.000Z",
  },
];

const SETTLEMENT_TRIP_SEED: BillingSettlementTripRecord[] = [
  {
    settlementId: "settlement-202603-001",
    tenantId: DEMO_TENANT_ID,
    driverId: "drv-demo-001",
    orderId: "order-demo-031",
    completedAt: "2026-03-05T09:40:00Z",
    orderSource: "portal",
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
    serviceBucket: "business_dispatch",
    businessDispatchSubtype: "enterprise_dispatch",
    costCenterCode: "CC-SALES",
    riderId: "rider-demo-001",
    partnerId: null,
    partnerProgramId: null,
    partnerEntrySlug: null,
    eligibilityVerificationId: null,
    issuerAuthorizationRef: null,
    benefitReference: null,
    serviceProduct: "enterprise_dispatch",
    tenantServiceProgramId: null,
    sourcePlatform: "portal",
  },
  {
    settlementId: "settlement-202603-002",
    tenantId: DEMO_TENANT_ID,
    driverId: "drv-demo-001",
    orderId: "order-demo-032",
    completedAt: "2026-03-18T18:20:00Z",
    orderSource: "api",
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
    serviceBucket: "business_dispatch",
    businessDispatchSubtype: "credit_card_airport_transfer",
    costCenterCode: "CC-TRAVEL",
    riderId: "rider-demo-002",
    partnerId: "partner-bank-demo-001",
    partnerProgramId: "program-airport-alpha",
    partnerEntrySlug: "bank-demo-alpha-airport",
    eligibilityVerificationId: "elig-demo-032",
    issuerAuthorizationRef: "issuer-auth-bank-demo-032",
    benefitReference: "benefit-bank-demo-032",
    serviceProduct: "credit_card_airport_transfer",
    tenantServiceProgramId: null,
    sourcePlatform: "api",
  },
  {
    settlementId: "settlement-202603-003",
    tenantId: DEMO_TENANT_ID,
    driverId: "drv-demo-002",
    orderId: "order-demo-033",
    completedAt: "2026-03-22T12:00:00Z",
    orderSource: "portal",
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
    serviceBucket: "business_dispatch",
    businessDispatchSubtype: "enterprise_dispatch",
    costCenterCode: "CC-FINANCE",
    riderId: "rider-demo-003",
    partnerId: null,
    partnerProgramId: null,
    partnerEntrySlug: null,
    eligibilityVerificationId: null,
    issuerAuthorizationRef: null,
    benefitReference: null,
    serviceProduct: "enterprise_dispatch",
    tenantServiceProgramId: null,
    sourcePlatform: "portal",
  },
  // Referral-channel attributed trips (community-app导流): owned rides tagged
  // with a referral partnerEntrySlug. These settle drts_pays_partner — DRTS
  // owes the channel a revenue share per completed ride.
  {
    settlementId: "settlement-referral-yuhe-202606-001",
    tenantId: DEMO_TENANT_ID,
    driverId: "drv-demo-002",
    orderId: "order-referral-yuhe-001",
    completedAt: "2026-06-04T08:15:00Z",
    orderSource: "portal",
    grossEarning: { currency: DEFAULT_CURRENCY, amountMinor: 60000 },
    subsidy: { currency: DEFAULT_CURRENCY, amountMinor: 0 },
    platformFundedDiscount: { currency: DEFAULT_CURRENCY, amountMinor: 0 },
    pricingVersionSnapshot: "tenant-pricing-v1",
    eligibleForTenantInvoice: true,
    eligibleForDriverStatement: true,
    serviceBucket: "business_dispatch",
    businessDispatchSubtype: "enterprise_dispatch",
    costCenterCode: null,
    riderId: "rider-referral-001",
    partnerId: "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118",
    partnerProgramId: null,
    partnerEntrySlug: "yuhe-residence",
    eligibilityVerificationId: null,
    issuerAuthorizationRef: null,
    benefitReference: null,
    serviceProduct: "enterprise_dispatch",
    tenantServiceProgramId: null,
    sourcePlatform: "portal",
  },
  {
    settlementId: "settlement-referral-yuhe-202606-002",
    tenantId: DEMO_TENANT_ID,
    driverId: "drv-demo-003",
    orderId: "order-referral-yuhe-002",
    completedAt: "2026-06-18T19:40:00Z",
    orderSource: "portal",
    grossEarning: { currency: DEFAULT_CURRENCY, amountMinor: 90000 },
    subsidy: { currency: DEFAULT_CURRENCY, amountMinor: 0 },
    platformFundedDiscount: { currency: DEFAULT_CURRENCY, amountMinor: 0 },
    pricingVersionSnapshot: "tenant-pricing-v1",
    eligibleForTenantInvoice: true,
    eligibleForDriverStatement: true,
    serviceBucket: "business_dispatch",
    businessDispatchSubtype: "enterprise_dispatch",
    costCenterCode: null,
    riderId: "rider-referral-002",
    partnerId: "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118",
    partnerProgramId: null,
    partnerEntrySlug: "yuhe-residence",
    eligibilityVerificationId: null,
    issuerAuthorizationRef: null,
    benefitReference: null,
    serviceProduct: "enterprise_dispatch",
    tenantServiceProgramId: null,
    sourcePlatform: "portal",
  },
  {
    settlementId: "settlement-referral-202606-001",
    tenantId: DEMO_TENANT_ID,
    driverId: "drv-demo-002",
    orderId: "order-referral-001",
    completedAt: "2026-06-04T08:15:00Z",
    orderSource: "portal",
    grossEarning: { currency: DEFAULT_CURRENCY, amountMinor: 60000 },
    subsidy: { currency: DEFAULT_CURRENCY, amountMinor: 0 },
    platformFundedDiscount: { currency: DEFAULT_CURRENCY, amountMinor: 0 },
    pricingVersionSnapshot: "tenant-pricing-v1",
    eligibleForTenantInvoice: true,
    eligibleForDriverStatement: true,
    serviceBucket: "business_dispatch",
    businessDispatchSubtype: "enterprise_dispatch",
    costCenterCode: null,
    riderId: "rider-referral-001",
    partnerId: "partner-referral-demo-001",
    partnerProgramId: null,
    partnerEntrySlug: "referral-demo-community",
    eligibilityVerificationId: null,
    issuerAuthorizationRef: null,
    benefitReference: null,
    serviceProduct: "enterprise_dispatch",
    tenantServiceProgramId: null,
    sourcePlatform: "portal",
  },
  {
    settlementId: "settlement-referral-202606-002",
    tenantId: DEMO_TENANT_ID,
    driverId: "drv-demo-003",
    orderId: "order-referral-002",
    completedAt: "2026-06-18T19:40:00Z",
    orderSource: "portal",
    grossEarning: { currency: DEFAULT_CURRENCY, amountMinor: 90000 },
    subsidy: { currency: DEFAULT_CURRENCY, amountMinor: 0 },
    platformFundedDiscount: { currency: DEFAULT_CURRENCY, amountMinor: 0 },
    pricingVersionSnapshot: "tenant-pricing-v1",
    eligibleForTenantInvoice: true,
    eligibleForDriverStatement: true,
    serviceBucket: "business_dispatch",
    businessDispatchSubtype: "enterprise_dispatch",
    costCenterCode: null,
    riderId: "rider-referral-002",
    partnerId: "partner-referral-demo-001",
    partnerProgramId: null,
    partnerEntrySlug: "referral-demo-community",
    eligibilityVerificationId: null,
    issuerAuthorizationRef: null,
    benefitReference: null,
    serviceProduct: "enterprise_dispatch",
    tenantServiceProgramId: null,
    sourcePlatform: "portal",
  },
];

// Referral revenue-share rules keyed by partnerEntrySlug. BE-006 surfaces these
// for admin config; here they back the per-trip share computation. Seeded to
// match the WP0 referral-channel scaffold seed.
const REFERRAL_REVENUE_SHARE_RULE_SEED: readonly ReferralRevenueShareRule[] =
  Object.freeze([
    Object.freeze({
      ruleId: "referral-rule-342de003-aed1-4f55-8dd2-bbd7738a2731",
      partnerId: "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118",
      partnerEntrySlug: "yuhe-residence",
      rateType: "percent" as const,
      value: 15,
      currency: "TWD",
      effectiveFrom: "2026-06-01T00:00:00.000Z",
      effectiveUntil: null,
      settlementDirection: REFERRAL_STATEMENT_DIRECTION,
      channelKey: REFERRAL_STATEMENT_CHANNEL_KEY,
      createdAt: "2026-08-01T05:25:58.237Z",
      updatedAt: "2026-08-01T05:25:58.237Z",
    }),
    Object.freeze({
      ruleId: "referral-rule-demo-001",
      partnerId: "partner-referral-demo-001",
      partnerEntrySlug: "referral-demo-community",
      rateType: "percent" as const,
      value: 15,
      currency: DEFAULT_CURRENCY,
      effectiveFrom: "2026-06-01T00:00:00.000Z",
      effectiveUntil: null,
      settlementDirection: REFERRAL_STATEMENT_DIRECTION,
      channelKey: REFERRAL_STATEMENT_CHANNEL_KEY,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    }),
  ]);

function isStrictAuthEnvironment(): boolean {
  const environment = detectAuthEnvironment(process.env);
  return environment === "production" || environment === "staging";
}

function cloneReferralRevenueShareRuleSeed(): ReferralRevenueShareRule[] {
  return REFERRAL_REVENUE_SHARE_RULE_SEED.map((rule) => ({ ...rule }));
}

function createInitialReferralRevenueShareRules(): ReferralRevenueShareRule[] {
  return isStrictAuthEnvironment() ? [] : cloneReferralRevenueShareRuleSeed();
}

// Finance document rows preserve the producer's original Unicode text. The
// shared renderer embeds the already packaged CJK font and wraps complete rows.
function toPdfText(value?: string | null): string {
  return String(value ?? "");
}

function formatMoneyForPdf(amount: MoneyAmount): string {
  const sign = amount.amountMinor < 0 ? "-" : "";
  const absMinor = Math.abs(amount.amountMinor);
  const whole = Math.floor(absMinor / 100);
  const cents = String(absMinor % 100).padStart(2, "0");
  return `${sign}${amount.currency} ${whole}.${cents}`;
}

function buildTenantInvoicePdfRows(input: {
  invoiceId: string;
  tenantId: string;
  billingProfile: TenantBillingProfile;
  periodStart: string;
  periodEnd: string;
  amount: MoneyAmount;
  lines: InvoiceLineRecord[];
  generatedAt: string;
}): string[] {
  return [
    `Tenant Invoice ${input.invoiceId}`,
    `Bill To: ${toPdfText(input.billingProfile.invoiceTitle)} (${input.tenantId})`,
    ...(input.billingProfile.taxId
      ? [`Tax ID: ${toPdfText(input.billingProfile.taxId)}`]
      : []),
    ...(input.billingProfile.address
      ? [`Address: ${toPdfText(input.billingProfile.address)}`]
      : []),
    `Billing Period: ${input.periodStart} to ${input.periodEnd}`,
    `Generated At: ${input.generatedAt}`,
    "",
    "Order ID | Description | Channel | Amount",
    "----------------------------------------------------------------",
    ...input.lines.map(
      (line) =>
        `${line.orderId} | ${toPdfText(line.description)} | ${
          line.channelKey ?? "-"
        } | ${formatMoneyForPdf(line.amount)}`,
    ),
    "----------------------------------------------------------------",
    `Total (${input.lines.length} line${input.lines.length === 1 ? "" : "s"}): ${formatMoneyForPdf(input.amount)}`,
  ];
}

function buildDriverStatementPdfRows(
  statement: DriverStatementRecord,
): string[] {
  return [
    `Driver Statement ${statement.statementId}`,
    `Driver ID: ${statement.driverId}`,
    `Period: ${statement.periodMonth}`,
    `Receipt No: ${statement.receiptNo}`,
    `Payout Status: ${statement.payoutStatus}`,
    `Fee Plan Version: ${statement.feePlanVersion}`,
    `Generated At: ${statement.createdAt}`,
    "",
    `Gross Earning: ${formatMoneyForPdf(statement.grossEarning)}`,
    `Service Fee: ${formatMoneyForPdf(statement.serviceFee)}`,
    `Subsidy: ${formatMoneyForPdf(statement.subsidy)}`,
    `Net Amount: ${formatMoneyForPdf(statement.netAmount)}`,
    "",
    "Order ID | Channel | Net Amount | Reimbursement Required",
    "----------------------------------------------------------------",
    ...statement.lines.map(
      (line) =>
        `${line.orderId} | ${toPdfText(line.channelKey ?? "-")} | ${formatMoneyForPdf(line.netAmount)} | ${line.reimbursementRequired ? "yes" : "no"}`,
    ),
    "----------------------------------------------------------------",
    `Total Lines: ${statement.lines.length}`,
  ];
}

/**
 * C080 batch export: binds the batch-owned canonical snapshot (driver,
 * period, per-item order id and amount) plus the originating fee-plan
 * version for subsidy traceability. This is the platform finance artifact
 * export, never the driver's own remittance-proof upload.
 */
function buildReimbursementBatchExportPdfRows(
  batch: ReimbursementBatchRecord,
  feePlanVersion: string | null,
  exportedAt: string,
): string[] {
  return [
    `Reimbursement Batch Export ${batch.batchId}`,
    `Driver ID: ${batch.driverId}`,
    `Statement ID: ${batch.statementId}`,
    `Period: ${batch.periodMonth}`,
    `Fee Plan Version: ${feePlanVersion ?? "-"}`,
    `Approved At: ${batch.approvedAt ?? "-"}`,
    `Exported At: ${exportedAt}`,
    "",
    "Order ID | Channel | Amount | Reason",
    "----------------------------------------------------------------",
    ...batch.items.map(
      (item) =>
        `${item.orderId} | ${toPdfText(item.channelKey ?? "-")} | ${formatMoneyForPdf(item.amount)} | ${toPdfText(item.reason)}`,
    ),
    "----------------------------------------------------------------",
    `Total (${batch.items.length} line${batch.items.length === 1 ? "" : "s"}): ${formatMoneyForPdf(batch.totalAmount)}`,
  ];
}

/** Monotonic Q-ADM12 ordering; see `ReimbursementBatchRecord.workflowState`. */
const REIMBURSEMENT_BATCH_WORKFLOW_RANK: Record<
  ReimbursementBatchWorkflowState,
  number
> = {
  draft: 0,
  pending_approval: 1,
  approved: 2,
  exported: 3,
  paid: 4,
  reconciled: 5,
};

function advanceReimbursementWorkflowState(
  current: ReimbursementBatchWorkflowState | undefined,
  next: ReimbursementBatchWorkflowState,
): ReimbursementBatchWorkflowState {
  if (!current) {
    return next;
  }
  return REIMBURSEMENT_BATCH_WORKFLOW_RANK[next] >
    REIMBURSEMENT_BATCH_WORKFLOW_RANK[current]
    ? next
    : current;
}

@Injectable()
export class BillingSettlementService implements OnModuleInit {
  private tenantBillingProfiles = new Map<string, TenantBillingProfile>([
    [DEMO_TENANT_ID, this.createDefaultBillingProfile(DEMO_TENANT_ID)],
  ]);

  private tenantInvoices: StoredTenantInvoice[] = [];

  private driverFeePlans: DriverFeePlanRecord[] = [];

  private driverStatements: DriverStatementRecord[] = [];

  private reimbursementBatches: ReimbursementBatchRecord[] = [];

  private readonly driverTargetCommands = new Map<string, Promise<unknown>>();
  private readonly driverTargetProposals = new Map<
    string,
    DriverStatementTargetProposal
  >();
  private readonly driverTargetFanouts = new Set<string>();

  private reconciliationIssues = PARTNER_SPONSOR_MISMATCH_SEED.map((issue) =>
    this.cloneReconciliationIssue(issue),
  );

  private readonly reconciliationIssueUpdates = new Map<
    string,
    Promise<void>
  >();

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

  private readonly liveSettlementTrips = new Map<
    string,
    LiveSettlementTripRecord
  >();

  private fulfillmentSegments: FulfillmentSegmentRecord[] = [];

  private sandboxBillingTreatments: SandboxBillingTreatmentRecord[] = [];

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    @Optional()
    private readonly billingSettlementRepository?: BillingSettlementRepository,
    @Optional() private readonly forwarderService?: ForwarderService,
    @Optional()
    @InjectPaymentRecoveryPort()
    private readonly paymentRecoveryPort: PaymentRecoveryPort = new UnavailablePaymentRecoveryPort(),
    @Optional()
    @Inject(DOCUMENT_ARTIFACT_STORE)
    private readonly documentArtifactStore: DocumentArtifactStore = new InMemoryDocumentArtifactStore(),
    @Optional()
    private readonly remittanceProofService: RemittanceProofService = new RemittanceProofService(),
    @Optional()
    @Inject(DOCUMENT_ARTIFACT_REBUILD_REGISTRY)
    documentArtifactRebuildRegistry?: DocumentArtifactRebuildRegistry,
  ) {
    // Registered unconditionally (not gated on a repository being present):
    // `this.tenantInvoices` / `this.driverStatements` are populated either
    // way -- from seed data, from a prior `generate*` call in this process,
    // or (see `onModuleInit`) from the shared repository -- and a rebuilder
    // must answer "no such subjectId on this instance" rather than throw
    // when there genuinely is none, which it already does below.
    documentArtifactRebuildRegistry?.register("tenant-invoice", (subjectId) =>
      this.rebuildTenantInvoiceArtifact(subjectId),
    );
    // A single "report" rebuilder covers both producers that share this
    // kind: a subjectId is either a driver statement id or a reimbursement
    // batch id, never both, so trying the statement first and falling back
    // to the batch export is unambiguous and loses no coverage.
    documentArtifactRebuildRegistry?.register("report", async (subjectId) => {
      const statementArtifact =
        await this.rebuildDriverStatementArtifact(subjectId);
      if (statementArtifact) {
        return statementArtifact;
      }
      return this.rebuildReimbursementBatchExportArtifact(subjectId);
    });
  }

  async getMultiTaxiPaymentException(
    orderId: string,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ): Promise<MultiTaxiPaymentExceptionView> {
    const normalizedOrderId = orderId.trim();
    if (!normalizedOrderId) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PAYMENT_EXCEPTION_ORDER_ID_REQUIRED",
        "orderId is required.",
      );
    }
    if (
      !this.billingSettlementRepository ||
      !this.billingSettlementRepository.isEnabled()
    ) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "PAYMENT_EXCEPTION_READ_AUTHORITY_UNAVAILABLE",
        "Payment exception read authority requires the billing database.",
        { orderId: normalizedOrderId },
        true,
      );
    }

    const payment =
      await this.billingSettlementRepository.findMultiTaxiPaymentException(
        normalizedOrderId,
      );
    if (!payment) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PAYMENT_EXCEPTION_NOT_FOUND",
        "Payment exception was not found.",
        { orderId: normalizedOrderId },
      );
    }
    const auditTrail =
      await this.billingSettlementRepository.listMultiTaxiPaymentAuditTrail(
        payment.orderId,
        payment.paymentId,
      );
    const view = this.buildMultiTaxiPaymentExceptionView(
      payment,
      auditTrail,
      identity,
    );

    this.recordAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType:
          identity?.actorType === "driver_user"
            ? "system"
            : (identity?.actorType ?? "system"),
        tenantId: identity?.tenantId ?? null,
        moduleName: "billing-settlement",
        actionName: "read_multi_taxi_payment_exception",
        resourceType: "multi_taxi_payment_exception",
        resourceId: payment.paymentId,
        newValuesSummary: {
          orderId: payment.orderId,
          status: payment.status,
          availableActionCount: view.availableActions.length,
        },
      },
      requestId,
    );

    return view;
  }

  async executeMultiTaxiPaymentRecovery(
    orderId: string,
    actionValue: string,
    command: unknown,
    identity: BootstrapRequestIdentity | null,
    context: {
      idempotencyKey?: string;
      requestId?: string;
    },
  ): Promise<ActionReceipt> {
    const normalizedOrderId = orderId.trim();
    if (!normalizedOrderId) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PAYMENT_EXCEPTION_ORDER_ID_REQUIRED",
        "orderId is required.",
      );
    }
    const action = this.requirePaymentRecoveryAction(actionValue);
    const actorId = identity?.actorId?.trim();
    if (
      !actorId ||
      identity?.realm !== "platform" ||
      !identity.scopes.includes("billing:write")
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "PAYMENT_RECOVERY_WRITE_AUTHORITY_REQUIRED",
        "Platform billing:write authority is required for payment recovery.",
      );
    }
    const idempotencyKey = context.idempotencyKey?.trim();
    if (!idempotencyKey) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key is required for payment recovery.",
      );
    }
    if (idempotencyKey.length > 255) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "IDEMPOTENCY_KEY_INVALID",
        "Idempotency-Key must not exceed 255 characters.",
      );
    }
    const { reason } = this.parsePaymentRecoveryCommand(command);

    if (
      !this.billingSettlementRepository ||
      !this.billingSettlementRepository.isEnabled()
    ) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "PAYMENT_RECOVERY_AUTHORITY_UNAVAILABLE",
        "Payment recovery requires the billing database.",
        { orderId: normalizedOrderId },
        true,
      );
    }

    const payment =
      await this.billingSettlementRepository.findMultiTaxiPaymentException(
        normalizedOrderId,
      );
    if (!payment) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PAYMENT_EXCEPTION_NOT_FOUND",
        "Payment exception was not found.",
        { orderId: normalizedOrderId },
      );
    }

    const existingCommand = await this.billingSettlementRepository
      .findMultiTaxiPaymentRecoveryCommand(
        payment.paymentId,
        action,
        idempotencyKey,
      )
      .catch(() => {
        throw new ApiRequestError(
          HttpStatus.SERVICE_UNAVAILABLE,
          "PAYMENT_RECOVERY_PERSISTENCE_UNAVAILABLE",
          "Payment recovery idempotency ledger is unavailable.",
          { orderId: normalizedOrderId, action },
          true,
        );
      });
    if (existingCommand) {
      if (existingCommand.receipt) {
        return existingCommand.receipt;
      }
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        existingCommand.state === "processing"
          ? "PAYMENT_RECOVERY_IN_PROGRESS"
          : "PAYMENT_RECOVERY_IDEMPOTENCY_KEY_TERMINAL",
        "The idempotent payment recovery command has no successful receipt.",
        {
          orderId: normalizedOrderId,
          action,
          state: existingCommand.state,
        },
      );
    }

    const descriptor = this.buildPaymentRecoveryDescriptors(
      payment,
      identity,
    ).find((candidate) => candidate.action === action);
    if (!descriptor?.enabled) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        descriptor?.disabledReasonCode ?? "PAYMENT_RECOVERY_NOT_AVAILABLE",
        "Payment recovery is not available for this payment.",
        {
          orderId: normalizedOrderId,
          action,
          status: payment.status,
        },
      );
    }
    if (descriptor.requiresReason && !reason) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PAYMENT_RECOVERY_REASON_REQUIRED",
        "A reason is required for this payment recovery action.",
      );
    }

    const recoveryCommandId = randomUUID();
    let claim;
    try {
      claim =
        await this.billingSettlementRepository.claimMultiTaxiPaymentRecoveryCommand(
          {
            recoveryCommandId,
            paymentId: payment.paymentId,
            orderId: payment.orderId,
            action,
            idempotencyKey,
            actorId,
            ...(context.requestId ? { requestId: context.requestId } : {}),
            ...(reason ? { reason } : {}),
          },
        );
    } catch {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "PAYMENT_RECOVERY_PERSISTENCE_UNAVAILABLE",
        "Payment recovery command could not be durably claimed.",
        { orderId: normalizedOrderId, action },
        true,
      );
    }
    if (!claim.claimed) {
      if (claim.command.receipt) {
        return claim.command.receipt;
      }
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        claim.command.state === "processing"
          ? "PAYMENT_RECOVERY_IN_PROGRESS"
          : "PAYMENT_RECOVERY_IDEMPOTENCY_KEY_TERMINAL",
        "The idempotent payment recovery command has no successful receipt.",
        {
          orderId: normalizedOrderId,
          action,
          state: claim.command.state,
        },
      );
    }

    let providerResult;
    try {
      providerResult = await this.paymentRecoveryPort.recover(
        action,
        {
          paymentId: payment.paymentId,
          orderId: payment.orderId,
          status: payment.status,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          attemptCount: payment.attemptCount,
        },
        {
          actorId,
          idempotencyKey,
          ...(context.requestId ? { requestId: context.requestId } : {}),
          ...(reason ? { reason } : {}),
        },
      );
    } catch {
      await this.billingSettlementRepository
        .failMultiTaxiPaymentRecoveryCommand(recoveryCommandId)
        .catch(() => undefined);
      this.recordAudit(
        {
          actorId,
          actorType: "platform_admin",
          tenantId: null,
          moduleName: "billing-settlement",
          actionName: `${action}_failed`,
          resourceType: "multi_taxi_payment_exception",
          resourceId: payment.paymentId,
          oldValuesSummary: {
            status: payment.status,
            attemptCount: payment.attemptCount,
          },
          newValuesSummary: {
            recoveryState: "failed",
            action,
          },
        },
        context.requestId,
      );
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "PAYMENT_RECOVERY_PROVIDER_UNAVAILABLE",
        "The configured payment recovery provider did not accept the command.",
        { orderId: normalizedOrderId, action },
        true,
      );
    }
    if (
      providerResult.status !== "accepted" &&
      providerResult.status !== "completed"
    ) {
      await this.billingSettlementRepository
        .failMultiTaxiPaymentRecoveryCommand(recoveryCommandId)
        .catch(() => undefined);
      throw new ApiRequestError(
        HttpStatus.BAD_GATEWAY,
        "PAYMENT_RECOVERY_PROVIDER_RESPONSE_INVALID",
        "The payment recovery provider returned an invalid result.",
        { orderId: normalizedOrderId, action },
        true,
      );
    }

    const auditLog = this.auditNotificationService.recordAuditLog({
      actorId,
      actorType: "platform_admin",
      tenantId: null,
      moduleName: "billing-settlement",
      actionName: action,
      resourceType: "multi_taxi_payment_exception",
      resourceId: payment.paymentId,
      oldValuesSummary: {
        status: payment.status,
        attemptCount: payment.attemptCount,
        recoveryState: payment.recoveryState,
      },
      newValuesSummary: {
        action,
        recoveryState: providerResult.status,
        paymentStatus:
          action === "begin_manual_recovery"
            ? "manual_recovery"
            : providerResult.status === "completed"
              ? "captured"
              : payment.status,
      },
      ...(context.requestId ? { requestId: context.requestId } : {}),
    });
    const receipt = toActionReceipt({
      auditLog,
      actionId: idempotencyKey,
      status: providerResult.status,
      message: this.paymentRecoveryReceiptMessage(
        action,
        providerResult.status,
      ),
    });

    try {
      await this.billingSettlementRepository.completeMultiTaxiPaymentRecoveryCommand(
        {
          recoveryCommandId,
          paymentId: payment.paymentId,
          action,
          state: providerResult.status,
          receipt,
          ...(providerResult.passengerLedgerManaged
            ? { passengerLedgerManaged: true }
            : {}),
        },
      );
    } catch {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "PAYMENT_RECOVERY_PERSISTENCE_UNAVAILABLE",
        "Payment recovery was accepted but its receipt could not be durably persisted.",
        { orderId: normalizedOrderId, action, auditId: auditLog.auditId },
        true,
      );
    }

    return receipt;
  }

  @OnEvent(OWNED_MOBILITY_TRIP_COMPLETED_EVENT, {
    async: true,
    suppressErrors: false,
  })
  async handleOwnedMobilityTripCompleted(
    event: OwnedMobilityTripCompletedEvent,
  ) {
    if (
      !event.tenantId ||
      !event.driverId ||
      !event.orderId ||
      event.serviceBucket !== "business_dispatch" ||
      !event.businessDispatchSubtype ||
      Number.isNaN(new Date(event.completedAt).getTime())
    ) {
      return;
    }

    this.liveSettlementTrips.set(event.orderId, {
      ...event,
      grossEarning: { ...event.grossEarning },
    });
    if (event.sandboxFulfillmentSegments?.length) {
      this.fulfillmentSegments = this.mergeFulfillmentSegments(
        this.fulfillmentSegments,
        event.sandboxFulfillmentSegments,
      );
    }
    if (event.sandboxBillingTreatment) {
      this.sandboxBillingTreatments = this.mergeSandboxBillingTreatments(
        this.sandboxBillingTreatments,
        [event.sandboxBillingTreatment],
      );
    }
    if (
      event.sandboxFulfillmentSegments?.length ||
      event.sandboxBillingTreatment
    ) {
      await this.persistChangesRequired(
        {
          ...(event.sandboxFulfillmentSegments?.length
            ? {
                fulfillmentSegments: event.sandboxFulfillmentSegments.map(
                  (segment) => this.cloneFulfillmentSegment(segment),
                ),
              }
            : {}),
          ...(event.sandboxBillingTreatment
            ? {
                sandboxBillingTreatments: [
                  this.cloneSandboxBillingTreatment(
                    event.sandboxBillingTreatment,
                  ),
                ],
              }
            : {}),
        },
        "owned_mobility_trip_completed_sandbox_ledger",
      );
    }
  }

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
        persistedState.reimbursementBatches.length > 0 ||
        persistedState.reconciliationIssues.length > 0 ||
        persistedState.fulfillmentSegments.length > 0 ||
        persistedState.sandboxBillingTreatments.length > 0;

      if (!hasPersistedState) {
        await this.persistChanges(
          {
            tenantBillingProfiles: this.listStoredTenantBillingProfiles(),
            reconciliationIssues: this.reconciliationIssues.map((issue) =>
              this.cloneReconciliationIssue(issue),
            ),
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
      this.fulfillmentSegments = persistedState.fulfillmentSegments.map(
        (segment) => this.cloneFulfillmentSegment(segment),
      );
      this.sandboxBillingTreatments =
        persistedState.sandboxBillingTreatments.map((treatment) =>
          this.cloneSandboxBillingTreatment(treatment),
        );
      this.reconciliationIssues =
        persistedState.reconciliationIssues.length > 0
          ? persistedState.reconciliationIssues.map((issue) =>
              this.cloneReconciliationIssue(issue),
            )
          : PARTNER_SPONSOR_MISMATCH_SEED.map((issue) =>
              this.cloneReconciliationIssue(issue),
            );
      this.syncDerivedForwarderIssues();
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

  async updateTenantBillingProfile(
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
    await this.persistChanges(
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
      return this.cloneInvoice(
        this.ensureTenantInvoiceArtifact(existingInvoice),
      );
    }

    const eligibleTrips = (
      await this.listTenantInvoiceTripsInPeriod(
        command.tenantId,
        command.periodStart,
        command.periodEnd,
        { requireAuthoritativeRead: true },
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
      description: this.buildInvoiceLineDescription(trip),
      amount: { ...trip.grossEarning },
      channelKey: this.getSettlementChannelKey(trip),
      orderSource: trip.orderSource,
      serviceBucket: trip.serviceBucket,
      businessDispatchSubtype: trip.businessDispatchSubtype,
      partnerId: trip.partnerId,
      partnerProgramId: trip.partnerProgramId,
      partnerEntrySlug: trip.partnerEntrySlug,
      eligibilityVerificationId: trip.eligibilityVerificationId,
      issuerAuthorizationRef: trip.issuerAuthorizationRef,
      benefitReference: trip.benefitReference,
    }));
    const amount = this.sumMoney(lines.map((line) => line.amount));
    const now = new Date().toISOString();
    const invoiceId = `invoice-${randomUUID()}`;
    const billingProfile = this.requireTenantBillingProfile(command.tenantId);
    const artifactRecord = await this.documentArtifactStore.put({
      kind: "tenant-invoice",
      subjectId: invoiceId,
      mimeType: "application/pdf",
      bytes: await renderBillingDocumentPdf(
        buildTenantInvoicePdfRows({
          invoiceId,
          tenantId: command.tenantId,
          billingProfile,
          periodStart: command.periodStart,
          periodEnd: command.periodEnd,
          amount,
          lines,
          generatedAt: now,
        }),
      ),
    });
    const artifactDownloadMetadata = createControlledDownloadMetadata({
      kind: "tenant-invoice",
      subjectId: invoiceId,
      // The signature must cover the hash of the bytes actually behind the
      // link, not a separate metadata digest -- otherwise a verified,
      // unexpired signature would still fail `resolveDocumentArtifact`'s
      // content-mismatch check against the real stored artifact.
      manifestHash: artifactRecord.sha256,
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
    await this.persistChanges(
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

  private buildInvoiceLineDescription(trip: BillingSettlementTripRecord) {
    if (
      trip.businessDispatchSubtype === "credit_card_airport_transfer" &&
      trip.partnerEntrySlug
    ) {
      return `Bank-airport benefit trip ${trip.orderId} (${trip.partnerEntrySlug})`;
    }

    return `Completed owned trip ${trip.orderId}`;
  }

  private toTenantInvoiceRuntimeRecord(
    invoice: StoredTenantInvoice,
  ): TenantInvoiceRuntimeRecord {
    const cloned = this.cloneInvoice(invoice);

    return {
      ...cloned,
      availableActions: this.buildTenantInvoiceActions(cloned),
      deepLinks: this.buildTenantInvoiceDeepLinks(cloned),
    };
  }

  private buildTenantInvoiceActions(
    invoice: TenantInvoiceRecord,
  ): ResourceActionDescriptor[] {
    const artifactExpired = this.isInvoiceArtifactExpired(invoice.artifactUrl);
    // `draft` is not produced by `generateTenantInvoice` today, but the
    // contract's `BillingDocumentStatus` allows it and a not-yet-finalised
    // bill must never be downloadable just because a link happens to exist.
    const isUnfinalised = invoice.status === "draft";

    return [
      {
        action: "download_artifact",
        enabled:
          Boolean(invoice.artifactUrl) && !artifactExpired && !isUnfinalised,
        riskLevel: "low",
        ...(isUnfinalised
          ? { disabledReasonCode: "invoice_not_finalized" }
          : !invoice.artifactUrl
            ? { disabledReasonCode: "artifact_missing" }
            : artifactExpired
              ? { disabledReasonCode: "artifact_expired" }
              : {}),
      },
      {
        action: "view_detail",
        enabled: true,
        riskLevel: "low",
      },
      {
        action: "open_billing",
        enabled: true,
        riskLevel: "low",
      },
      {
        action: "open_platform_audit",
        enabled: true,
        riskLevel: "low",
      },
    ];
  }

  private buildTenantInvoiceDeepLinks(
    invoice: TenantInvoiceRecord,
  ): CrossAppResourceLink[] {
    const invoiceId = encodeURIComponent(invoice.invoiceId);

    return [
      {
        targetApp: "tenant-console",
        route: `/billing?invoiceId=${invoiceId}`,
        resourceType: "invoice",
        resourceId: invoice.invoiceId,
        openMode: "same_tab",
        label: "返回帳務概覽",
      },
      {
        targetApp: "tenant-console",
        route: `/audit?resourceType=tenant_invoice&resourceId=${invoiceId}`,
        resourceType: "audit_event",
        resourceId: invoice.invoiceId,
        openMode: "same_tab",
        label: "查看租戶稽核",
      },
      {
        targetApp: "platform-admin",
        route: `/payments?invoiceId=${invoiceId}`,
        resourceType: "invoice",
        resourceId: invoice.invoiceId,
        openMode: "new_tab",
        label: "前往 Platform Admin 付款治理",
      },
      {
        targetApp: "platform-admin",
        route: `/audit?resourceType=tenant_invoice&resourceId=${invoiceId}`,
        resourceType: "audit_event",
        resourceId: invoice.invoiceId,
        openMode: "new_tab",
        label: "前往 Platform Admin 稽核",
      },
    ];
  }

  private buildTenantInvoicesEmptyState(tenantId: string): EmptyStateEnvelope {
    if (!this.tenantBillingProfiles.has(tenantId)) {
      return {
        reason: "not_provisioned",
        messageCode: "tenant_invoice_not_provisioned",
        nextAction: {
          action: "open_billing_setup",
          enabled: true,
          riskLevel: "medium",
        },
      };
    }

    return {
      reason: "no_data",
      messageCode: "tenant_invoice_no_data",
      nextAction: {
        action: "open_billing",
        enabled: true,
        riskLevel: "low",
      },
    };
  }

  private isInvoiceArtifactExpired(artifactUrl: string | null) {
    if (!artifactUrl) {
      return false;
    }

    try {
      // `artifactUrl` is host-relative by default (`DEFAULT_CONTROLLED_DOWNLOAD_HOST`
      // is `/downloads`, not an absolute origin), and `new URL()` throws on a
      // relative string with no base -- which silently made this method
      // return "never expired" for every real invoice link. The dummy base is
      // ignored by the URL parser whenever `artifactUrl` is already absolute
      // (a deployment that sets `CONTROLLED_DOWNLOAD_HOST`), so this is safe
      // either way.
      const parsed = new URL(artifactUrl, "http://controlled-download.invalid");
      const expiresAt = parsed.searchParams.get("expires_at");
      if (!expiresAt) {
        return false;
      }

      const expiresAtMs = Date.parse(expiresAt);
      return Number.isFinite(expiresAtMs) && expiresAtMs < Date.now();
    } catch {
      return false;
    }
  }

  /**
   * Makes a stored invoice's download link trustworthy before it is handed
   * back to a caller: reissues the signed link if its time window has
   * lapsed. `DOCUMENT_ARTIFACT_STORE` is now a durable, shared backend (see
   * `document-artifact-runtime.config.ts`): the exact bytes `put` there at
   * issuance survive a restart and are visible from every instance, so
   * there is no need to re-check the store on every read, and -- critically
   * -- no need to ever re-render from this tenant's *current* billing
   * profile just to answer a list/get call. `invoice.artifactDownloadMetadata
   * .manifestHash` is the permanent proof of what was actually stored; only
   * the signature/expiry window is ever recomputed here, over that same
   * unchanged hash.
   *
   * If the durable store genuinely lost the bytes behind this hash (not a
   * restart -- an actual deletion), `ControlledDownloadController`'s own
   * registered rebuilder (`rebuildTenantInvoiceArtifact`) is the fallback,
   * and it re-renders from the CURRENT billing profile on purpose: a
   * mismatch against this invoice's immutable manifest hash is then reported
   * as a genuine content mismatch, not silently served.
   *
   * `createdAt` (the invoice's actual issuance date), `lines`, and `amount`
   * are read, never recalculated, so viewing this invoice on a later date
   * can never change what it says was issued or owed.
   */
  private ensureTenantInvoiceArtifact(
    invoice: StoredTenantInvoice,
  ): StoredTenantInvoice {
    const expired = this.isInvoiceArtifactExpired(invoice.artifactUrl);
    if (!expired) {
      return invoice;
    }

    const artifactDownloadMetadata = createControlledDownloadMetadata({
      kind: "tenant-invoice",
      subjectId: invoice.invoiceId,
      manifestHash: invoice.artifactDownloadMetadata.manifestHash,
      host: this.downloadHost,
      keyId: this.downloadSigningKeyId,
      signingSecret: this.downloadSigningSecret,
      ttlMinutes: this.downloadExpiryMinutes,
      signatureVersion: this.downloadSignatureVersion,
    });

    const refreshed: StoredTenantInvoice = {
      ...invoice,
      artifactUrl: artifactDownloadMetadata.downloadUrl,
      artifactDownloadMetadata,
    };

    this.tenantInvoices = this.tenantInvoices.map((candidate) =>
      candidate.invoiceId === refreshed.invoiceId ? refreshed : candidate,
    );
    this.persistChanges(
      { tenantInvoices: [this.cloneInvoice(refreshed)] },
      "reissue_tenant_invoice_artifact",
    );

    return refreshed;
  }

  /**
   * Used ONLY by `rebuildTenantInvoiceArtifact`, the recovery fallback for a
   * verified link whose object is genuinely missing -- never by issuance,
   * which writes its own bytes directly. `putIfAbsent` (not `put`) matters
   * here specifically because this path races a sibling instance's own
   * concurrent recovery of the exact same (kind, subjectId): an unconditional
   * overwrite could clobber bytes a sibling already correctly restored with
   * this instance's independently re-rendered (and not necessarily
   * byte-identical, if the current billing profile has since changed) copy.
   */
  private async renderTenantInvoiceArtifact(
    invoice: StoredTenantInvoice,
  ): Promise<DocumentArtifactRecord> {
    const { record } = await this.documentArtifactStore.putIfAbsent({
      kind: "tenant-invoice",
      subjectId: invoice.invoiceId,
      mimeType: "application/pdf",
      bytes: await renderBillingDocumentPdf(
        buildTenantInvoicePdfRows({
          invoiceId: invoice.invoiceId,
          tenantId: invoice.tenantId,
          billingProfile: this.requireTenantBillingProfile(invoice.tenantId),
          periodStart: invoice.periodStart,
          periodEnd: invoice.periodEnd,
          amount: invoice.amount,
          lines: invoice.lines,
          generatedAt: invoice.createdAt,
        }),
      ),
    });
    return record;
  }

  /**
   * Registered with `DocumentArtifactRebuildRegistry` for kind
   * "tenant-invoice": lets `ControlledDownloadController` recover a
   * verified, unexpired link whose bytes are genuinely missing from the
   * durable store (not the common case -- that is served directly from the
   * shared store without ever reaching this fallback) by re-deriving a file
   * from this invoice's own durably persisted record. Returns null -- not a
   * thrown error -- when this instance's own invoice list genuinely has no
   * such id, which the registry contract treats as "nothing to rebuild", not
   * a rebuild failure.
   */
  private async rebuildTenantInvoiceArtifact(
    invoiceId: string,
  ): Promise<DocumentArtifactRecord | null> {
    const invoice = this.tenantInvoices.find(
      (candidate) => candidate.invoiceId === invoiceId,
    );
    if (!invoice) {
      return null;
    }
    try {
      return await this.renderTenantInvoiceArtifact(invoice);
    } catch {
      // A billing profile or other precondition `requireTenantBillingProfile`
      // enforces could have been removed since this invoice was issued; the
      // caller treats a null rebuild the same as "nothing to rebuild".
      return null;
    }
  }

  listTenantInvoices(tenantId: string) {
    return this.tenantInvoices
      .filter((invoice) => invoice.tenantId === tenantId)
      .map((invoice) =>
        this.cloneInvoice(this.ensureTenantInvoiceArtifact(invoice)),
      );
  }

  listTenantInvoicesRuntime(tenantId: string): TenantInvoiceListData {
    const items = this.tenantInvoices
      .filter((invoice) => invoice.tenantId === tenantId)
      .map((invoice) =>
        this.toTenantInvoiceRuntimeRecord(
          this.ensureTenantInvoiceArtifact(invoice),
        ),
      );

    const refresh: UiRefreshMetadata = {
      generatedAt: new Date().toISOString(),
      staleAfterMs: TENANT_REFRESH_INTERVAL_MS,
      dataFreshness: "fresh",
      source: "live",
    };
    const emptyState =
      items.length === 0
        ? this.buildTenantInvoicesEmptyState(tenantId)
        : undefined;

    return {
      items,
      pageInfo: {
        page: 1,
        pageSize: items.length > 0 ? items.length : 20,
        totalItems: items.length,
        totalPages: items.length > 0 ? 1 : 0,
      },
      refresh,
      ...(emptyState ? { emptyState } : {}),
    };
  }

  async getTenantPayableSummary(
    tenantId: string,
    periodMonth?: string,
  ): Promise<TenantPayableSummary> {
    const resolvedPeriodMonth = await this.resolveTenantSettlementPeriodMonth(
      tenantId,
      periodMonth,
    );
    const lineItems = await this.listTenantPayableLineItems(tenantId, {
      periodMonth: resolvedPeriodMonth,
    });
    const summaryInvoiceStatus = this.resolveTenantInvoiceStatusForPeriod(
      tenantId,
      resolvedPeriodMonth,
    );

    return {
      tenantId,
      periodMonth: resolvedPeriodMonth,
      totalTrips: lineItems.length,
      completedTrips: lineItems.length,
      cancelledTrips: 0,
      noShowTrips: 0,
      grossAmountMinor: lineItems.reduce(
        (sum, item) => sum + item.baseAmountMinor,
        0,
      ),
      adjustmentAmountMinor: lineItems.reduce(
        (sum, item) => sum + item.extraAmountMinor - item.discountAmountMinor,
        0,
      ),
      taxAmountMinor: lineItems.reduce(
        (sum, item) => sum + item.taxAmountMinor,
        0,
      ),
      payableAmountMinor: lineItems.reduce(
        (sum, item) => sum + item.payableAmountMinor,
        0,
      ),
      invoiceStatus: summaryInvoiceStatus,
    };
  }

  async listTenantPayableLineItems(
    tenantId: string,
    query: {
      periodMonth?: string;
      serviceProduct?: string;
      costCenterCode?: string;
      tenantServiceProgramId?: string;
      riderId?: string;
      invoiceStatus?: string;
    } = {},
  ): Promise<TenantPayableLineItem[]> {
    const resolvedPeriodMonth = await this.resolveTenantSettlementPeriodMonth(
      tenantId,
      query.periodMonth,
    );
    const { periodStart, periodEnd } =
      this.getPeriodMonthRange(resolvedPeriodMonth);
    const invoiceStatusByOrder = this.buildInvoiceStatusByOrder(tenantId);
    const lines = (
      await this.listTenantInvoiceTripsInPeriod(
        tenantId,
        periodStart,
        periodEnd,
      )
    ).map(
      (trip): TenantPayableLineItem => ({
        lineItemId: `tenant-payable-${trip.settlementId}`,
        orderId: trip.orderId,
        tripId: trip.settlementId,
        serviceProduct: trip.businessDispatchSubtype ?? "enterprise_dispatch",
        costCenterCode: trip.costCenterCode,
        tenantServiceProgramId:
          trip.partnerProgramId ?? DEFAULT_TENANT_SERVICE_PROGRAM_ID,
        riderId: trip.riderId,
        baseAmountMinor: trip.grossEarning.amountMinor,
        extraAmountMinor: trip.subsidy.amountMinor,
        discountAmountMinor: trip.platformFundedDiscount.amountMinor,
        taxAmountMinor: 0,
        payableAmountMinor:
          trip.grossEarning.amountMinor +
          trip.subsidy.amountMinor -
          trip.platformFundedDiscount.amountMinor,
      }),
    );

    return lines.filter((line) => {
      if (
        query.serviceProduct &&
        line.serviceProduct !== query.serviceProduct.trim()
      ) {
        return false;
      }
      if (
        query.costCenterCode &&
        line.costCenterCode !== query.costCenterCode.trim().toUpperCase()
      ) {
        return false;
      }
      if (
        query.tenantServiceProgramId &&
        line.tenantServiceProgramId !== query.tenantServiceProgramId.trim()
      ) {
        return false;
      }
      if (query.riderId && line.riderId !== query.riderId.trim()) {
        return false;
      }
      if (
        query.invoiceStatus &&
        invoiceStatusByOrder.get(line.orderId) !== query.invoiceStatus.trim()
      ) {
        return false;
      }
      return true;
    });
  }

  async listTenantStatements(tenantId: string, periodMonth?: string) {
    const resolvedPeriodMonth = await this.resolveTenantSettlementPeriodMonth(
      tenantId,
      periodMonth,
    );
    const { periodStart, periodEnd } =
      this.getPeriodMonthRange(resolvedPeriodMonth);
    const tenantOrderIds = new Set(
      (
        await this.listTenantInvoiceTripsInPeriod(
          tenantId,
          periodStart,
          periodEnd,
        )
      ).map((trip) => trip.orderId),
    );

    return this.driverStatements
      .filter((statement) => statement.periodMonth === resolvedPeriodMonth)
      .filter((statement) =>
        statement.lines.some((line) => tenantOrderIds.has(line.orderId)),
      )
      .map((statement) => this.cloneStatement(statement));
  }

  listPlatformInvoices() {
    return this.tenantInvoices.map((invoice) => this.cloneInvoice(invoice));
  }

  listSettlementMatrix(): SettlementMatrixRecord[] {
    return buildSettlementMatrix();
  }

  /** Mail links may land on any replica; resolve the register from shared state. */
  async listTenantInvoicesFresh(tenantId: string) {
    if (this.billingSettlementRepository?.isEnabled()) {
      const invoices =
        await this.billingSettlementRepository.listInvoicesForTenant(tenantId);
      this.tenantInvoices = [
        ...this.tenantInvoices.filter(
          (invoice) => invoice.tenantId !== tenantId,
        ),
        ...invoices,
      ];
    }
    return this.listTenantInvoicesRuntime(tenantId);
  }

  async getTenantInvoiceFresh(tenantId: string, invoiceId: string) {
    if (this.billingSettlementRepository?.isEnabled()) {
      const invoice = await this.billingSettlementRepository.findInvoiceForMail(
        tenantId,
        invoiceId,
      );
      if (!invoice)
        throw new ApiRequestError(
          404,
          "NOT_FOUND",
          "Tenant invoice not found.",
        );
      return this.cloneInvoice(this.ensureTenantInvoiceArtifact(invoice));
    }
    return this.getTenantInvoice(tenantId, invoiceId);
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
    return this.cloneInvoice(this.ensureTenantInvoiceArtifact(invoice));
  }

  async publishDriverFeePlan(
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
    await this.persistChanges(
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

  async generateDriverStatements(
    command: GenerateDriverStatementCommand,
    requestId?: string,
    options: { authoritativeSource?: boolean } = {},
  ) {
    const driverId = command.driverId?.trim() || undefined;
    if (command.driverId !== undefined && !driverId) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "driverId must not be blank.",
        { periodMonth: command.periodMonth },
      );
    }
    this.getPeriodMonthRange(command.periodMonth);
    const activeFeePlan = this.driverFeePlans[0];
    if (!activeFeePlan) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "An active published driver fee plan is required.",
        { periodMonth: command.periodMonth },
      );
    }
    // Enumerate sources before any completion decision. One successful driver
    // is never evidence that all eligible drivers in the period completed.
    const eligibleTrips = (
      await this.driverStatementSourceTrips(
        command.periodMonth,
        driverId,
        options.authoritativeSource ?? false,
      )
    ).filter((trip) => trip.eligibleForDriverStatement);
    if (eligibleTrips.length === 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "No eligible trips found for the requested statement period.",
        { periodMonth: command.periodMonth, ...(driverId ? { driverId } : {}) },
      );
    }
    const byDriver = new Map<string, BillingSettlementTripRecord[]>();
    for (const trip of eligibleTrips)
      byDriver.set(trip.driverId, [
        ...(byDriver.get(trip.driverId) ?? []),
        trip,
      ]);
    const items: DriverStatementRecord[] = [];
    const reimbursementBatchIds: string[] = [];
    for (const [targetDriverId, trips] of byDriver) {
      const identity = {
        periodMonth: command.periodMonth,
        driverId: targetDriverId,
        feePlanVersion: activeFeePlan.version,
      };
      const key = JSON.stringify([
        identity.periodMonth,
        identity.driverId,
        identity.feePlanVersion,
      ]);
      const prior = this.driverTargetCommands.get(key) ?? Promise.resolve();
      const run = prior
        .catch(() => undefined)
        .then(async () => {
          const execute = (target: DriverStatementTargetPersistence) =>
            this.completeDriverStatementTarget(
              identity,
              activeFeePlan,
              trips,
              target,
              requestId,
            );
          if (this.billingSettlementRepository?.isEnabled()) {
            return this.billingSettlementRepository.withDriverStatementTarget(
              identity,
              execute,
            );
          }
          return execute({
            load: async () => ({
              statements: this.driverStatements
                .filter(
                  (statement) =>
                    statement.periodMonth === identity.periodMonth &&
                    statement.driverId === identity.driverId &&
                    statement.feePlanVersion === identity.feePlanVersion,
                )
                .map((statement) => this.cloneStatement(statement)),
              reimbursements: this.reimbursementBatches
                .filter(
                  (batch) =>
                    batch.periodMonth === identity.periodMonth &&
                    batch.driverId === identity.driverId,
                )
                .map((batch) => this.cloneReimbursementBatch(batch)),
            }),
            reserve: async (create) => {
              const proposal = this.driverTargetProposals.get(key) ?? create();
              this.driverTargetProposals.set(key, structuredClone(proposal));
              return structuredClone(proposal);
            },
            persist: (changes) =>
              this.persistChanges(changes, "generate_driver_statements"),
            claimSuccessEffects: async () => {
              if (this.driverTargetFanouts.has(key)) return false;
              this.driverTargetFanouts.add(key);
              return true;
            },
          });
        });
      this.driverTargetCommands.set(key, run);
      try {
        const result = await run;
        items.push(result.statement);
        reimbursementBatchIds.push(...result.reimbursementBatchIds);
      } finally {
        if (this.driverTargetCommands.get(key) === run)
          this.driverTargetCommands.delete(key);
      }
    }
    return { items, reimbursementBatchIds };
  }

  async bindScheduledBillingOperation(
    operationId: string,
    periodMonth: string,
  ) {
    if (!this.billingSettlementRepository?.isEnabled()) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "BILLING_MONTHLY_SOURCE_UNAVAILABLE",
        "Scheduled billing requires canonical operation persistence.",
        { periodMonth },
        true,
      );
    }
    let matches: boolean;
    try {
      matches =
        await this.billingSettlementRepository.bindMonthlyBillingOperation(
          operationId,
          periodMonth,
        );
    } catch (error) {
      this.billingSettlementRepository.reportPersistenceFailure(
        error,
        "scheduled_billing_operation",
      );
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "BILLING_MONTHLY_OPERATION_UNAVAILABLE",
        "Monthly operation binding could not be acknowledged.",
        { periodMonth },
        true,
      );
    }
    if (!matches)
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "IDEMPOTENCY_KEY_REUSED",
        "Monthly operationId is already bound to another period.",
        { periodMonth },
      );
  }

  /** Scheduled discovery is always canonical live data, with no seed fallback. */
  async listScheduledDriverStatementTargets(periodMonth: string) {
    return [
      ...new Set(
        (await this.driverStatementSourceTrips(periodMonth, undefined, true))
          .filter((trip) => trip.eligibleForDriverStatement)
          .map((trip) => trip.driverId),
      ),
    ].sort();
  }

  private async driverStatementSourceTrips(
    periodMonth: string,
    driverId: string | undefined,
    authoritative: boolean,
  ) {
    if (!authoritative)
      return this.listDriverStatementTripsInPeriod(periodMonth, driverId);
    const { periodStart, periodEnd } = this.getPeriodMonthRange(periodMonth);
    if (!this.billingSettlementRepository?.isEnabled()) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "BILLING_MONTHLY_SOURCE_UNAVAILABLE",
        "Scheduled billing requires the canonical completed-trip source.",
        { periodMonth },
        true,
      );
    }
    try {
      const trips = driverId
        ? await this.billingSettlementRepository.listLiveDriverTripsInPeriodForDriver(
            driverId,
            periodStart,
            periodEnd,
          )
        : await this.billingSettlementRepository.listLiveDriverTripsInPeriod(
            periodStart,
            periodEnd,
          );
      return trips.map((trip) => this.mapLiveTripToSettlementSnapshot(trip));
    } catch (error) {
      this.billingSettlementRepository.reportPersistenceFailure(
        error,
        "scheduled_driver_statement_source",
      );
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "BILLING_MONTHLY_SOURCE_UNAVAILABLE",
        "Canonical completed-trip source could not be read.",
        { periodMonth },
        true,
      );
    }
  }

  private async completeDriverStatementTarget(
    identity: { periodMonth: string; driverId: string; feePlanVersion: string },
    feePlan: DriverFeePlanRecord,
    trips: BillingSettlementTripRecord[],
    target: DriverStatementTargetPersistence,
    requestId?: string,
  ) {
    const syncCanonical = (state: DriverStatementTargetState) => {
      this.driverStatements = [
        ...state.statements.map((statement) => this.cloneStatement(statement)),
        ...this.driverStatements.filter(
          (statement) =>
            !(
              statement.periodMonth === identity.periodMonth &&
              statement.driverId === identity.driverId &&
              statement.feePlanVersion === identity.feePlanVersion
            ),
        ),
      ];
      this.reimbursementBatches = [
        ...state.reimbursements.map((batch) =>
          this.cloneReimbursementBatch(batch),
        ),
        ...this.reimbursementBatches.filter(
          (batch) =>
            !(
              batch.periodMonth === identity.periodMonth &&
              batch.driverId === identity.driverId
            ),
        ),
      ];
    };
    try {
      const canonical = await target.load();
      const proposal = await target.reserve(() => {
        const existing = canonical.statements[0];
        const now = new Date().toISOString();
        const lines =
          existing?.lines ??
          trips.map((trip) =>
            this.createStatementLine(trip, feePlan.serviceFeeBps),
          );
        const statement: DriverStatementRecord = existing
          ? this.cloneStatement(existing)
          : {
              statementId: `statement-${randomUUID()}`,
              driverId: identity.driverId,
              periodMonth: identity.periodMonth,
              receiptNo: `DRV-${identity.periodMonth.replace("-", "")}-${identity.driverId.slice(-3)}`,
              payoutStatus: "pending",
              grossEarning: this.sumMoney(
                lines.map((line) => line.grossEarning),
              ),
              serviceFee: this.sumMoney(lines.map((line) => line.serviceFee)),
              subsidy: this.sumMoney(lines.map((line) => line.subsidy)),
              netAmount: this.sumMoney(lines.map((line) => line.netAmount)),
              feePlanVersion: feePlan.version,
              lines,
              createdAt: now,
              updatedAt: now,
            };
        const oldBatch = canonical.reimbursements.find(
          (batch) => batch.statementId === statement.statementId,
        );
        // A legacy independently committed statement owns its original lines.
        // Repair only its missing relation, never include newly arrived orders.
        const orderIds = new Set(statement.lines.map((line) => line.orderId));
        const source = trips.filter((trip) => orderIds.has(trip.orderId));
        if (
          existing &&
          !oldBatch &&
          feePlan.reimbursementMode === "platform_funded" &&
          statement.lines.some(
            (line) =>
              line.reimbursementRequired &&
              !source.some((trip) => trip.orderId === line.orderId),
          )
        ) {
          throw new ApiRequestError(
            HttpStatus.SERVICE_UNAVAILABLE,
            "BILLING_TARGET_SOURCE_UNAVAILABLE",
            "Original reimbursement source is unavailable for the committed statement.",
            { statementId: statement.statementId },
            true,
          );
        }
        const reimbursementItems = this.createReimbursementItems(
          source,
          feePlan.reimbursementMode,
        );
        const reimbursement: ReimbursementBatchRecord | null = oldBatch
          ? this.cloneReimbursementBatch(oldBatch)
          : reimbursementItems.length
            ? {
                batchId: `reimbursement-${randomUUID()}`,
                driverId: identity.driverId,
                statementId: statement.statementId,
                periodMonth: identity.periodMonth,
                status: "pending",
                totalAmount: this.sumMoney(
                  reimbursementItems.map((item) => item.amount),
                ),
                remittanceProofId: null,
                items: reimbursementItems,
                approvedAt: null,
                paidAt: null,
                workflowState: "pending_approval",
                exportedAt: null,
                exportedByActorId: null,
                exportReceiptId: null,
                exportManifestHash: null,
                exportDownloadMetadata: null,
                reconciledAt: null,
                reconciledByActorId: null,
                reconciliationReason: null,
                reconciliationEvidenceRef: null,
                reconciliationReceiptId: null,
              }
            : null;
        return {
          statement,
          reimbursement,
          statementAlreadyExisted: Boolean(existing),
          reimbursementAlreadyExisted: Boolean(oldBatch),
        };
      });
      const statement =
        canonical.statements.find(
          (row) => row.statementId === proposal.statement.statementId,
        ) ?? this.cloneStatement(proposal.statement);
      const existingBatch = canonical.reimbursements.find(
        (batch) => batch.statementId === statement.statementId,
      );
      const reimbursement =
        existingBatch ??
        (proposal.reimbursement
          ? this.cloneReimbursementBatch(proposal.reimbursement)
          : null);
      const statementMissing = !canonical.statements.some(
        (row) => row.statementId === statement.statementId,
      );
      if (statementMissing && !statement.artifactDownloadMetadata) {
        const bytes = await renderBillingDocumentPdf(
          buildDriverStatementPdfRows(statement),
        );
        const offeredHash = createHash("sha256").update(bytes).digest("hex");
        const artifact = await this.documentArtifactStore.putIfAbsent({
          kind: "report",
          subjectId: statement.statementId,
          mimeType: "application/pdf",
          bytes,
        });
        if (artifact.record.sha256 !== offeredHash) {
          throw new ApiRequestError(
            HttpStatus.CONFLICT,
            "BILLING_STATEMENT_ARTIFACT_MISMATCH",
            "The reserved statement artifact differs from its immutable snapshot.",
            { statementId: statement.statementId },
          );
        }
        const metadata = createControlledDownloadMetadata({
          kind: "report",
          subjectId: statement.statementId,
          manifestHash: artifact.record.sha256,
          createdAt: statement.createdAt,
          host: this.downloadHost,
          keyId: this.downloadSigningKeyId,
          signingSecret: this.downloadSigningSecret,
          ttlMinutes: this.downloadExpiryMinutes,
          signatureVersion: this.downloadSignatureVersion,
        });
        statement.artifactUrl = metadata.downloadUrl;
        statement.artifactDownloadMetadata = metadata;
      }
      const changes: PersistBillingSettlementChanges = {
        ...(statementMissing
          ? { driverStatements: [this.cloneStatement(statement)] }
          : {}),
        ...(!existingBatch && reimbursement
          ? {
              reimbursementBatches: [
                this.cloneReimbursementBatch(reimbursement),
              ],
            }
          : {}),
      };
      // These writes may independently commit. Rejection is never a rollback
      // claim; the durable proposal and next authoritative read repair the gap.
      await target.persist(changes);
      const finalState = this.billingSettlementRepository?.isEnabled()
        ? await target.load()
        : {
            statements: [statement],
            reimbursements: [
              ...canonical.reimbursements,
              ...(!existingBatch && reimbursement ? [reimbursement] : []),
            ],
          };
      const committedStatement = finalState.statements.find(
        (row) => row.statementId === statement.statementId,
      );
      const committedBatch = reimbursement
        ? finalState.reimbursements.find(
            (batch) =>
              batch.batchId === reimbursement.batchId &&
              batch.statementId === statement.statementId,
          )
        : null;
      if (!committedStatement || (reimbursement && !committedBatch)) {
        throw new ApiRequestError(
          HttpStatus.SERVICE_UNAVAILABLE,
          "BILLING_TARGET_ACK_UNCONFIRMED",
          "Target financial records are not confirmed by canonical readback.",
          identity,
          true,
        );
      }
      syncCanonical(finalState);
      if (
        (!proposal.statementAlreadyExisted ||
          (reimbursement && !proposal.reimbursementAlreadyExisted)) &&
        (await target.claimSuccessEffects())
      ) {
        if (!proposal.statementAlreadyExisted) {
          this.auditNotificationService.recordNotification({
            tenantId: null,
            channel: "driver_task",
            title: "Driver statement generated",
            message: `Statement ${statement.receiptNo} is ready for driver ${identity.driverId}.`,
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
                driverId: identity.driverId,
                periodMonth: statement.periodMonth,
                feePlanVersion: statement.feePlanVersion,
              },
            },
            requestId,
          );
        }
        if (reimbursement && !proposal.reimbursementAlreadyExisted) {
          this.auditNotificationService.recordNotification({
            tenantId: null,
            channel: "ops_notice",
            title: "Driver reimbursement batch created",
            message: `Reimbursement batch ${reimbursement.batchId} was created for driver ${identity.driverId}.`,
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
              resourceId: reimbursement.batchId,
              newValuesSummary: {
                driverId: identity.driverId,
                statementId: statement.statementId,
                totalAmountMinor: reimbursement.totalAmount.amountMinor,
              },
            },
            requestId,
          );
        }
      }
      return {
        statement: this.cloneStatement(committedStatement),
        reimbursementBatchIds: committedBatch ? [committedBatch.batchId] : [],
      };
    } catch (error) {
      if (this.billingSettlementRepository?.isEnabled()) {
        try {
          syncCanonical(await target.load());
        } catch {
          /* No unacknowledged proposal was published to cache. */
        }
      }
      throw error;
    }
  }

  /**
   * Same rationale as `ensureTenantInvoiceArtifact`: `DOCUMENT_ARTIFACT_STORE`
   * is now durable and shared, so the only thing that can legitimately make
   * an already-issued statement's link stale is the signature/expiry
   * window, not the bytes behind it. Only the link is ever recomputed here,
   * over the unchanged `artifactDownloadMetadata.manifestHash`.
   */
  private ensureDriverStatementArtifact(
    statement: DriverStatementRecord,
  ): DriverStatementRecord {
    if (!statement.artifactDownloadMetadata) {
      return statement;
    }
    const expired = this.isInvoiceArtifactExpired(statement.artifactUrl ?? "");
    if (!expired) {
      return statement;
    }

    const now = new Date().toISOString();
    const artifactDownloadMetadata = createControlledDownloadMetadata({
      kind: "report",
      subjectId: statement.statementId,
      manifestHash: statement.artifactDownloadMetadata.manifestHash,
      createdAt: now,
      host: this.downloadHost,
      keyId: this.downloadSigningKeyId,
      signingSecret: this.downloadSigningSecret,
      ttlMinutes: this.downloadExpiryMinutes,
      signatureVersion: this.downloadSignatureVersion,
    });

    const refreshed: DriverStatementRecord = {
      ...statement,
      artifactUrl: artifactDownloadMetadata.downloadUrl,
      artifactDownloadMetadata,
    };

    this.driverStatements = this.driverStatements.map((candidate) =>
      candidate.statementId === refreshed.statementId ? refreshed : candidate,
    );
    this.persistChanges(
      { driverStatements: [this.cloneStatement(refreshed)] },
      "reissue_driver_statement_artifact",
    );

    return refreshed;
  }

  /**
   * Used ONLY by `rebuildDriverStatementArtifact`, the recovery fallback for
   * a verified link whose object is genuinely missing -- never by issuance.
   * `putIfAbsent`, not `put`: see `renderTenantInvoiceArtifact`'s comment for
   * why an unconditional write here could clobber a sibling's concurrent
   * recovery of a genuinely good object.
   */
  private async renderDriverStatementArtifact(
    statement: DriverStatementRecord,
  ): Promise<DocumentArtifactRecord> {
    const { record } = await this.documentArtifactStore.putIfAbsent({
      kind: "report",
      subjectId: statement.statementId,
      mimeType: "application/pdf",
      bytes: await renderBillingDocumentPdf(
        buildDriverStatementPdfRows(statement),
      ),
    });
    return record;
  }

  /**
   * Registered with `DocumentArtifactRebuildRegistry` for kind "report": lets
   * `ControlledDownloadController` recover a verified, unexpired link whose
   * bytes are genuinely missing from the durable store (not the common
   * case -- that is served directly from the shared store without ever
   * reaching this fallback) by re-deriving a file from this driver
   * statement's own durably persisted record. Returns null -- not a thrown
   * error -- when this instance's own statement list genuinely has no such
   * id, which the registry contract treats as "nothing to rebuild", not a
   * rebuild failure.
   */
  private async rebuildDriverStatementArtifact(
    statementId: string,
  ): Promise<DocumentArtifactRecord | null> {
    const statement = this.driverStatements.find(
      (candidate) => candidate.statementId === statementId,
    );
    if (!statement) {
      return null;
    }
    try {
      return await this.renderDriverStatementArtifact(statement);
    } catch {
      return null;
    }
  }

  listDriverStatements(periodMonth?: string, driverId?: string) {
    return this.driverStatements
      .filter(
        (statement) =>
          (!periodMonth ||
            statement.periodMonth.trim() === periodMonth.trim()) &&
          (!driverId || statement.driverId.trim() === driverId.trim()),
      )
      .map((statement) =>
        this.cloneStatement(this.ensureDriverStatementArtifact(statement)),
      );
  }

  getDriverStatement(statementId: string, requestingDriverId?: string) {
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
    if (
      requestingDriverId &&
      statement.driverId.trim() !== requestingDriverId.trim()
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "DRIVER_IDENTITY_MISMATCH",
        "Driver cannot access another driver's statement.",
        {
          statementId,
          requestedDriverId: statement.driverId,
          actorDriverId: requestingDriverId,
        },
      );
    }
    return this.cloneStatement(this.ensureDriverStatementArtifact(statement));
  }

  async listSettlementTripsForPeriodMonth(
    periodMonth: string,
    driverId?: string,
  ): Promise<BillingSettlementTripRecord[]> {
    const trips = await this.listDriverStatementTripsInPeriod(
      periodMonth,
      driverId,
    );
    return trips.map((trip) => this.cloneSettlementTrip(trip));
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

  listFulfillmentSegments(orderId?: string) {
    return this.fulfillmentSegments
      .filter((segment) => !orderId || segment.orderId === orderId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((segment) => this.cloneFulfillmentSegment(segment));
  }

  listSandboxBillingTreatments(orderId?: string) {
    return this.sandboxBillingTreatments
      .filter((treatment) => !orderId || treatment.orderId === orderId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((treatment) => this.cloneSandboxBillingTreatment(treatment));
  }

  listReconciliationIssues(filters: ReconciliationIssueFilters = {}) {
    this.syncDerivedForwarderIssues();
    return this.reconciliationIssues
      .filter((issue) => {
        if (filters.status && issue.status !== filters.status) {
          return false;
        }
        if (filters.issueType && issue.issueType !== filters.issueType) {
          return false;
        }
        if (filters.channelKey && issue.channelKey !== filters.channelKey) {
          return false;
        }
        return true;
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((issue) => this.cloneReconciliationIssue(issue));
  }

  async createReconciliationIssue(
    command: CreateReconciliationIssueCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.summary, "summary");
    this.assertNonBlank(command.openedBy, "openedBy");

    const now = new Date().toISOString();
    const ownerId = command.assigneeId?.trim() || null;
    const comment = command.comment?.trim();
    const issue: ReconciliationIssueRecord = {
      issueId: `recon-${command.issueType}-${randomUUID()}`,
      issueType: command.issueType,
      source: "finance_manual",
      status: ownerId ? "assigned" : "open",
      channelKey: this.normalizeIssueChannelKey(command),
      summary: command.summary.trim(),
      ownerId,
      openedBy: command.openedBy.trim(),
      orderId: command.orderId?.trim() || null,
      tenantId: command.tenantId?.trim() || null,
      partnerId: command.partnerId?.trim() || null,
      partnerProgramId: command.partnerProgramId?.trim() || null,
      sponsorReference: command.sponsorReference?.trim() || null,
      mirrorOrderId: command.mirrorOrderId?.trim() || null,
      externalOrderId: command.externalOrderId?.trim() || null,
      linkedReconciliationJobId:
        command.linkedReconciliationJobId?.trim() || null,
      linkedInvoiceId: null,
      linkedReimbursementBatchId: null,
      forwardedFinanceContext: null,
      resolutionCode: null,
      resolutionSummary: null,
      resolvedAt: null,
      reopenCount: 0,
      evidenceArtifactIds: this.normalizeArtifactIds(command.artifactIds),
      comments: comment
        ? [
            this.createIssueComment(
              command.openedBy.trim(),
              comment,
              command.artifactIds,
              now,
            ),
          ]
        : [],
      createdAt: now,
      updatedAt: now,
    };

    await this.persistChanges(
      {
        reconciliationIssues: [this.cloneReconciliationIssue(issue)],
      },
      "create_reconciliation_issue",
    );
    this.publishReconciliationIssue(issue);
    this.recordAudit(
      {
        actorId: command.openedBy.trim(),
        actorType: "platform_admin",
        tenantId: issue.tenantId,
        moduleName: "billing-settlement",
        actionName: "create_reconciliation_issue",
        resourceType: "reconciliation_issue",
        resourceId: issue.issueId,
        newValuesSummary: {
          issueType: issue.issueType,
          status: issue.status,
          source: issue.source,
          ownerId: issue.ownerId,
        },
      },
      requestId,
    );

    return this.cloneReconciliationIssue(issue);
  }

  async assignReconciliationIssue(
    issueId: string,
    command: AssignReconciliationIssueCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.assigneeId, "assigneeId");
    this.assertNonBlank(command.actorId, "actorId");

    return this.serializeReconciliationIssueUpdate(issueId, async () => {
      const issue = this.requireReconciliationIssue(issueId);
      if (issue.status === "resolved") {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "RECONCILIATION_ISSUE_RESOLVED",
          "Resolved reconciliation issues must be reopened before reassignment.",
          { issueId },
        );
      }

      const now = new Date().toISOString();
      const draft = this.cloneReconciliationIssue(issue);
      draft.ownerId = command.assigneeId.trim();
      draft.status = "assigned";
      draft.updatedAt = now;

      const note = command.note?.trim();
      if (note) {
        draft.comments.push(
          this.createIssueComment(command.actorId.trim(), note, [], now),
        );
      }

      await this.persistChanges(
        {
          reconciliationIssues: [this.cloneReconciliationIssue(draft)],
        },
        "assign_reconciliation_issue",
      );
      const published = this.publishReconciliationIssue(draft);
      this.recordAudit(
        {
          actorId: command.actorId.trim(),
          actorType: "platform_admin",
          tenantId: published.tenantId,
          moduleName: "billing-settlement",
          actionName: "assign_reconciliation_issue",
          resourceType: "reconciliation_issue",
          resourceId: published.issueId,
          newValuesSummary: {
            ownerId: published.ownerId,
            status: published.status,
          },
        },
        requestId,
      );

      return this.cloneReconciliationIssue(published);
    });
  }

  async addReconciliationIssueComment(
    issueId: string,
    command: AddReconciliationIssueCommentCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.actorId, "actorId");
    this.assertNonBlank(command.message, "message");

    return this.serializeReconciliationIssueUpdate(issueId, async () => {
      const issue = this.requireReconciliationIssue(issueId);
      const now = new Date().toISOString();
      const draft = this.cloneReconciliationIssue(issue);
      draft.comments.push(
        this.createIssueComment(
          command.actorId.trim(),
          command.message.trim(),
          command.artifactIds,
          now,
        ),
      );
      draft.evidenceArtifactIds = this.mergeArtifactIds(
        draft.evidenceArtifactIds,
        command.artifactIds,
      );
      draft.updatedAt = now;

      await this.persistChanges(
        {
          reconciliationIssues: [this.cloneReconciliationIssue(draft)],
        },
        "add_reconciliation_issue_comment",
      );
      const published = this.publishReconciliationIssue(draft);
      this.recordAudit(
        {
          actorId: command.actorId.trim(),
          actorType: "platform_admin",
          tenantId: published.tenantId,
          moduleName: "billing-settlement",
          actionName: "add_reconciliation_issue_comment",
          resourceType: "reconciliation_issue",
          resourceId: published.issueId,
          newValuesSummary: {
            commentCount: published.comments.length,
            evidenceArtifactIds: published.evidenceArtifactIds,
          },
        },
        requestId,
      );

      return this.cloneReconciliationIssue(published);
    });
  }

  async resolveReconciliationIssue(
    issueId: string,
    command: ResolveReconciliationIssueCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.actorId, "actorId");
    this.assertNonBlank(command.resolutionSummary, "resolutionSummary");

    return this.serializeReconciliationIssueUpdate(issueId, async () => {
      const issue = this.requireReconciliationIssue(issueId);
      const now = new Date().toISOString();
      const draft = this.cloneReconciliationIssue(issue);
      draft.status = "resolved";
      draft.resolutionCode = command.resolutionCode;
      draft.resolutionSummary = command.resolutionSummary.trim();
      draft.resolvedAt = now;
      draft.updatedAt = now;
      draft.comments.push(
        this.createIssueComment(
          command.actorId.trim(),
          command.resolutionSummary.trim(),
          command.artifactIds,
          now,
        ),
      );
      draft.evidenceArtifactIds = this.mergeArtifactIds(
        draft.evidenceArtifactIds,
        command.artifactIds,
      );

      await this.persistChanges(
        {
          reconciliationIssues: [this.cloneReconciliationIssue(draft)],
        },
        "resolve_reconciliation_issue",
      );
      const published = this.publishReconciliationIssue(draft);
      this.recordAudit(
        {
          actorId: command.actorId.trim(),
          actorType: "platform_admin",
          tenantId: published.tenantId,
          moduleName: "billing-settlement",
          actionName: "resolve_reconciliation_issue",
          resourceType: "reconciliation_issue",
          resourceId: published.issueId,
          newValuesSummary: {
            status: published.status,
            resolutionCode: published.resolutionCode,
            resolvedAt: published.resolvedAt,
          },
        },
        requestId,
      );

      return this.cloneReconciliationIssue(published);
    });
  }

  async reopenReconciliationIssue(
    issueId: string,
    command: ReopenReconciliationIssueCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.actorId, "actorId");
    this.assertNonBlank(command.reason, "reason");

    return this.serializeReconciliationIssueUpdate(issueId, async () => {
      const issue = this.requireReconciliationIssue(issueId);
      if (issue.status !== "resolved") {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "RECONCILIATION_ISSUE_NOT_RESOLVED",
          "Only resolved reconciliation issues can be reopened.",
          { issueId },
        );
      }

      const now = new Date().toISOString();
      const draft = this.cloneReconciliationIssue(issue);
      draft.status = "reopened";
      draft.resolutionCode = null;
      draft.resolutionSummary = null;
      draft.resolvedAt = null;
      draft.reopenCount += 1;
      draft.updatedAt = now;
      draft.comments.push(
        this.createIssueComment(
          command.actorId.trim(),
          command.reason.trim(),
          command.artifactIds,
          now,
        ),
      );
      draft.evidenceArtifactIds = this.mergeArtifactIds(
        draft.evidenceArtifactIds,
        command.artifactIds,
      );

      await this.persistChanges(
        {
          reconciliationIssues: [this.cloneReconciliationIssue(draft)],
        },
        "reopen_reconciliation_issue",
      );
      const published = this.publishReconciliationIssue(draft);
      this.recordAudit(
        {
          actorId: command.actorId.trim(),
          actorType: "platform_admin",
          tenantId: published.tenantId,
          moduleName: "billing-settlement",
          actionName: "reopen_reconciliation_issue",
          resourceType: "reconciliation_issue",
          resourceId: published.issueId,
          newValuesSummary: {
            status: published.status,
            reopenCount: published.reopenCount,
          },
        },
        requestId,
      );

      return this.cloneReconciliationIssue(published);
    });
  }

  async approveReimbursementBatch(
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
    batch.workflowState = advanceReimbursementWorkflowState(
      batch.workflowState,
      "approved",
    );
    await this.persistChanges(
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

  /** Compatibility response shape, NOT a separate payment-validation path. */
  async markReimbursementPaid(
    batchId: string,
    command: MarkReimbursementPaidCommand,
    requestId?: string,
    idempotencyKey?: string,
    identity: BootstrapRequestIdentity | null = null,
  ) {
    await this.markReimbursementPaidWithProof(
      batchId,
      {
        batchId,
        proofId: command.remittanceProofId ?? "",
        idempotencyKey: idempotencyKey ?? "",
        ...(command.paidAt ? { paidAt: command.paidAt } : {}),
      },
      identity,
      requestId,
    );
    return this.cloneReimbursementBatch(
      this.requireReimbursementBatch(batchId),
    );
  }

  getReimbursementBatch(batchId: string) {
    const batch = this.requireReimbursementBatch(batchId);
    return this.cloneReimbursementBatch(batch);
  }

  // ── Remittance Proof: both payment routes share the gate below. ──

  /** Test seam for scripted scan outcomes; HTTP callers cannot submit verdicts. */
  get remittanceProofServiceForTest(): RemittanceProofService {
    return this.remittanceProofService;
  }

  async stageRemittanceProofContent(bytes: Buffer, contentType: string) {
    return this.remittanceProofService.stageContent(bytes, contentType);
  }

  async uploadRemittanceProof(
    command: UploadRemittanceProofCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ): Promise<RemittanceProofRecord> {
    const batch = this.requireReimbursementBatch(command.batchId);
    const callerDriverId = identity?.actorId?.trim() || null;
    if (
      identity?.realm === "driver" &&
      callerDriverId &&
      callerDriverId !== batch.driverId
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "REMITTANCE_PROOF_BATCH_OWNERSHIP_VIOLATION",
        "A driver may only upload a remittance proof against their own reimbursement batch.",
        {
          batchId: batch.batchId,
          callerDriverId,
          batchDriverId: batch.driverId,
        },
      );
    }

    const proof = await this.remittanceProofService.uploadProof({
      batchId: batch.batchId,
      // Denormalised from the batch, never from the command -- see
      // `packages/contracts/src/remittance-proof.ts`.
      driverId: batch.driverId,
      originalFilename: command.originalFilename,
      stagedContentRef: command.stagedContentRef,
      uploadedByActorId: identity?.actorId ?? null,
    });

    this.recordAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType:
          identity?.actorType === "driver_user"
            ? "system"
            : (identity?.actorType ?? "system"),
        tenantId: identity?.tenantId ?? null,
        moduleName: "billing-settlement",
        actionName: "upload_remittance_proof",
        resourceType: "remittance_proof",
        resourceId: proof.proofId,
        newValuesSummary: {
          batchId: proof.batchId,
          driverId: proof.driverId,
          scanState: proof.scanState,
        },
      },
      requestId,
    );

    return proof;
  }

  async scanRemittanceProof(
    proofId: string,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
    bestEffort = false,
  ): Promise<RemittanceProofRecord> {
    let proof: RemittanceProofRecord;
    let scanUnavailable = false;
    try {
      proof = await this.remittanceProofService.attemptScan(proofId);
    } catch {
      scanUnavailable = true;
      proof = await this.remittanceProofService.getProof(proofId);
    }
    this.recordAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType:
          identity?.actorType === "driver_user"
            ? "system"
            : (identity?.actorType ?? "system"),
        tenantId: identity?.tenantId ?? null,
        moduleName: "billing-settlement",
        actionName: "scan_remittance_proof",
        resourceType: "remittance_proof",
        resourceId: proofId,
        newValuesSummary: {
          scanState: proof.scanState,
          scanCompletedAt: proof.scanCompletedAt,
          scanUnavailable,
        },
      },
      requestId,
    );
    if (!bestEffort && proof.scanState === "pending_scan") {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "REMITTANCE_PROOF_SCANNER_UNAVAILABLE",
        "No definitive scan verdict is available; retry scanning later.",
      );
    }
    return proof;
  }

  async getReimbursementProof(
    batchId: string,
  ): Promise<RemittanceProofRecord | null> {
    const batch = this.requireReimbursementBatch(batchId);
    // Before payment there is no payment foreign reference yet. Resolve the
    // uploaded proof by its authoritative batch binding, not a guessed ID.
    if (batch.status === "paid" && batch.remittanceProofId) {
      const proof = await this.remittanceProofService.getProof(
        batch.remittanceProofId,
      );
      if (proof.batchId !== batchId || proof.driverId !== batch.driverId) {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "REMITTANCE_PROOF_BATCH_MISMATCH",
          "Recorded payment proof does not belong to this batch.",
        );
      }
      return proof;
    }
    return this.remittanceProofService.getLatestForBatch(batchId);
  }

  async getRemittanceProof(proofId: string): Promise<RemittanceProofRecord> {
    return this.remittanceProofService.getProof(proofId);
  }

  async requestRemittanceProofReadback(
    command: RequestRemittanceProofReadbackCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ): Promise<RemittanceProofReadbackGrant> {
    const grant = await this.remittanceProofService.requestReadback(
      command.proofId,
    );
    this.recordAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType:
          identity?.actorType === "driver_user"
            ? "system"
            : (identity?.actorType ?? "system"),
        tenantId: identity?.tenantId ?? null,
        moduleName: "billing-settlement",
        actionName: "request_remittance_proof_readback",
        resourceType: "remittance_proof",
        resourceId: grant.proofId,
        newValuesSummary: { expiresAt: grant.expiresAt },
      },
      requestId,
    );
    return grant;
  }

  async markReimbursementPaidWithProof(
    batchId: string,
    command: MarkReimbursementPaidWithProofCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ): Promise<RemittanceProofPaymentReceipt> {
    const batch = this.requireReimbursementBatch(batchId);
    if (!batch.approvedAt) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "REMITTANCE_PROOF_BATCH_NOT_APPROVED",
        "Reimbursement batch must be approved before it can be marked as paid.",
        { batchId },
      );
    }

    const paidAt = command.paidAt?.trim() || new Date().toISOString();
    if (Number.isNaN(new Date(paidAt).getTime())) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "paidAt must be a valid ISO timestamp.",
        { batchId, paidAt },
      );
    }

    if (
      batch.status === "paid" &&
      batch.remittanceProofId !== command.proofId
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "REMITTANCE_PROOF_PAYMENT_CONFLICT",
        "An already-paid batch cannot be rebound to another proof.",
        { batchId },
      );
    }

    const receipt = await this.remittanceProofService.markPaidWithProof({
      batchId: batch.batchId,
      proofId: command.proofId,
      idempotencyKey: command.idempotencyKey,
      driverId: batch.driverId,
      amount: batch.totalAmount,
      paidAt,
    });

    if (batch.status !== "paid") {
      const updatedBatch = this.cloneReimbursementBatch(batch);
      updatedBatch.status = "paid";
      updatedBatch.paidAt = receipt.paidAt;
      updatedBatch.remittanceProofId = receipt.proofId;
      updatedBatch.workflowState = advanceReimbursementWorkflowState(
        updatedBatch.workflowState,
        "paid",
      );
      const relatedStatement = this.driverStatements.find(
        (statement) => statement.statementId === batch.statementId,
      );
      const updatedStatement = relatedStatement
        ? this.cloneStatement(relatedStatement)
        : null;
      if (updatedStatement) {
        updatedStatement.payoutStatus = "paid";
        updatedStatement.updatedAt = receipt.paidAt;
      }

      // Publish in-memory state only after persistence succeeds. A durable
      // receipt can then recover a failed batch write on an idempotent retry.
      await this.persistChanges(
        {
          reimbursementBatches: [updatedBatch],
          ...(updatedStatement ? { driverStatements: [updatedStatement] } : {}),
        },
        "mark_reimbursement_paid_with_proof",
      );
      if (this.requireReimbursementBatch(batchId).status === "paid")
        return receipt;
      Object.assign(batch, updatedBatch);
      if (relatedStatement && updatedStatement)
        Object.assign(relatedStatement, updatedStatement);
      this.auditNotificationService.recordNotification({
        tenantId: null,
        channel: "ops_notice",
        title: "Reimbursement batch paid",
        message: `Reimbursement batch ${batch.batchId} was marked paid with remittance proof ${receipt.proofId}.`,
        status: "unread",
      });
      this.recordAudit(
        {
          actorId: identity?.actorId ?? null,
          actorType:
            identity?.actorType === "driver_user"
              ? "system"
              : (identity?.actorType ?? "platform_admin"),
          tenantId: identity?.tenantId ?? null,
          moduleName: "billing-settlement",
          actionName: "mark_reimbursement_paid_with_proof",
          resourceType: "driver_reimbursement_batch",
          resourceId: batch.batchId,
          newValuesSummary: {
            driverId: batch.driverId,
            proofId: receipt.proofId,
            receiptId: receipt.receiptId,
            paidAt: receipt.paidAt,
          },
        },
        requestId,
      );
    }

    return receipt;
  }

  /**
   * C080 batch-owned signed export (not the driver's own remittance-proof
   * upload, and not a bank payment instruction). Requires the batch to be
   * approved. A repeat call never re-renders different bytes for an
   * already-exported batch -- it only reissues the signed link's
   * signature/expiry window over the same immutable manifest hash, exactly
   * like `ensureTenantInvoiceArtifact` / `ensureDriverStatementArtifact`.
   */
  async exportReimbursementBatch(
    batchId: string,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ): Promise<ReimbursementBatchExportReceipt> {
    const batch = this.requireReimbursementBatch(batchId);
    if (!batch.approvedAt) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "REIMBURSEMENT_BATCH_NOT_APPROVED_FOR_EXPORT",
        "Reimbursement batch must be approved before it can be exported.",
        { batchId },
      );
    }

    const actorId = identity?.actorId ?? null;

    if (batch.exportDownloadMetadata && batch.exportManifestHash) {
      const expired = this.isInvoiceArtifactExpired(
        batch.exportDownloadMetadata.downloadUrl,
      );
      let download = batch.exportDownloadMetadata;
      if (expired) {
        download = createControlledDownloadMetadata({
          kind: "report",
          subjectId: batch.batchId,
          manifestHash: batch.exportManifestHash,
          host: this.downloadHost,
          keyId: this.downloadSigningKeyId,
          signingSecret: this.downloadSigningSecret,
          ttlMinutes: this.downloadExpiryMinutes,
          signatureVersion: this.downloadSignatureVersion,
        });
        const refreshed = this.cloneReimbursementBatch(batch);
        refreshed.exportDownloadMetadata = download;
        await this.persistChanges(
          { reimbursementBatches: [refreshed] },
          "reissue_reimbursement_batch_export_artifact",
        );
        Object.assign(batch, refreshed);
      }

      return {
        receiptId: batch.exportReceiptId!,
        batchId: batch.batchId,
        exportedAt: batch.exportedAt!,
        exportedByActorId: batch.exportedByActorId ?? null,
        manifestHash: batch.exportManifestHash,
        download,
        createdAt: batch.exportedAt!,
      };
    }

    const now = new Date().toISOString();
    const relatedStatement = this.driverStatements.find(
      (statement) => statement.statementId === batch.statementId,
    );
    const artifactRecord = await this.documentArtifactStore.put({
      kind: "report",
      subjectId: batch.batchId,
      mimeType: "application/pdf",
      bytes: await renderBillingDocumentPdf(
        buildReimbursementBatchExportPdfRows(
          batch,
          relatedStatement?.feePlanVersion ?? null,
          now,
        ),
      ),
    });
    const download = createControlledDownloadMetadata({
      kind: "report",
      subjectId: batch.batchId,
      manifestHash: artifactRecord.sha256,
      createdAt: now,
      host: this.downloadHost,
      keyId: this.downloadSigningKeyId,
      signingSecret: this.downloadSigningSecret,
      ttlMinutes: this.downloadExpiryMinutes,
      signatureVersion: this.downloadSignatureVersion,
    });

    const receiptId = `reimbursement-export-${randomUUID()}`;
    const updatedBatch = this.cloneReimbursementBatch(batch);
    updatedBatch.exportedAt = now;
    updatedBatch.exportedByActorId = actorId;
    updatedBatch.exportReceiptId = receiptId;
    updatedBatch.exportManifestHash = artifactRecord.sha256;
    updatedBatch.exportDownloadMetadata = download;
    updatedBatch.workflowState = advanceReimbursementWorkflowState(
      updatedBatch.workflowState,
      "exported",
    );

    // Publish in-memory state only after persistence succeeds, matching
    // `markReimbursementPaidWithProof`'s rationale: a durable receipt lets a
    // failed batch write recover on retry rather than silently diverging.
    await this.persistChanges(
      { reimbursementBatches: [updatedBatch] },
      "export_reimbursement_batch",
    );
    Object.assign(batch, updatedBatch);

    this.recordAudit(
      {
        actorId,
        actorType:
          identity?.actorType === "driver_user"
            ? "system"
            : (identity?.actorType ?? "platform_admin"),
        tenantId: identity?.tenantId ?? null,
        moduleName: "billing-settlement",
        actionName: "export_reimbursement_batch",
        resourceType: "driver_reimbursement_batch",
        resourceId: batch.batchId,
        newValuesSummary: {
          driverId: batch.driverId,
          manifestHash: artifactRecord.sha256,
          exportedAt: now,
        },
      },
      requestId,
    );

    return {
      receiptId,
      batchId: batch.batchId,
      exportedAt: now,
      exportedByActorId: actorId,
      manifestHash: artifactRecord.sha256,
      download,
      createdAt: now,
    };
  }

  /**
   * C080 explicit manual paid -> reconciled transition (Q-ADM12). Requires
   * the batch to already be paid; never inferred from wall-clock age, a
   * proof's presence, or an unrelated reconciliation-issue resolution --
   * those stay distinct objects (see `./remittance-proof` and
   * `ReconciliationIssueRecord`). Idempotent by batch: a repeat call
   * (regardless of the reason text it carries) returns the original
   * receipt rather than overwriting the first actor/time/reason/evidence.
   */
  async markReimbursementBatchReconciled(
    batchId: string,
    command: MarkReimbursementBatchReconciledCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ): Promise<ReimbursementBatchReconciliationReceipt> {
    const batch = this.requireReimbursementBatch(batchId);

    if (batch.reconciledAt && batch.reconciliationReceiptId) {
      return {
        receiptId: batch.reconciliationReceiptId,
        batchId: batch.batchId,
        reconciledAt: batch.reconciledAt,
        reconciledByActorId: batch.reconciledByActorId ?? null,
        reason: batch.reconciliationReason ?? "",
        evidenceRef: batch.reconciliationEvidenceRef ?? null,
        createdAt: batch.reconciledAt,
      };
    }

    if (batch.status !== "paid") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "REIMBURSEMENT_BATCH_NOT_PAID_FOR_RECONCILIATION",
        "Reimbursement batch must be paid before it can be marked reconciled.",
        { batchId, status: batch.status },
      );
    }

    const reason = command.reason?.trim();
    if (!reason) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "REIMBURSEMENT_BATCH_RECONCILIATION_REASON_REQUIRED",
        "A reconciliation reason is required.",
        { batchId },
      );
    }

    const now = new Date().toISOString();
    const actorId = identity?.actorId ?? null;
    const receiptId = `reimbursement-reconciliation-${randomUUID()}`;
    const evidenceRef = command.evidenceRef?.trim() || null;

    const updatedBatch = this.cloneReimbursementBatch(batch);
    updatedBatch.reconciledAt = now;
    updatedBatch.reconciledByActorId = actorId;
    updatedBatch.reconciliationReason = reason;
    updatedBatch.reconciliationEvidenceRef = evidenceRef;
    updatedBatch.reconciliationReceiptId = receiptId;
    updatedBatch.workflowState = advanceReimbursementWorkflowState(
      updatedBatch.workflowState,
      "reconciled",
    );

    await this.persistChanges(
      { reimbursementBatches: [updatedBatch] },
      "mark_reimbursement_batch_reconciled",
    );

    // `batch` and the array element `requireReimbursementBatch` resolves to
    // are the same live object, so this reads whatever the LATEST write set
    // -- including a concurrent call's own `Object.assign` that may have
    // landed on it while the above `persistChanges` await was in flight,
    // exactly as `markReimbursementPaidWithProof` relies on below.
    if (this.requireReimbursementBatch(batchId).reconciledAt) {
      const concurrentWinner = this.requireReimbursementBatch(batchId);
      return {
        receiptId: concurrentWinner.reconciliationReceiptId!,
        batchId: concurrentWinner.batchId,
        reconciledAt: concurrentWinner.reconciledAt!,
        reconciledByActorId: concurrentWinner.reconciledByActorId ?? null,
        reason: concurrentWinner.reconciliationReason ?? reason,
        evidenceRef: concurrentWinner.reconciliationEvidenceRef ?? null,
        createdAt: concurrentWinner.reconciledAt!,
      };
    }
    Object.assign(batch, updatedBatch);

    this.auditNotificationService.recordNotification({
      tenantId: null,
      channel: "ops_notice",
      title: "Reimbursement batch reconciled",
      message: `Reimbursement batch ${batch.batchId} was marked reconciled.`,
      status: "unread",
    });
    this.recordAudit(
      {
        actorId,
        actorType:
          identity?.actorType === "driver_user"
            ? "system"
            : (identity?.actorType ?? "platform_admin"),
        tenantId: identity?.tenantId ?? null,
        moduleName: "billing-settlement",
        actionName: "mark_reimbursement_batch_reconciled",
        resourceType: "driver_reimbursement_batch",
        resourceId: batch.batchId,
        newValuesSummary: {
          driverId: batch.driverId,
          reason,
          reconciledAt: now,
        },
      },
      requestId,
    );

    return {
      receiptId,
      batchId: batch.batchId,
      reconciledAt: now,
      reconciledByActorId: actorId,
      reason,
      evidenceRef,
      createdAt: now,
    };
  }

  /**
   * Registered with `DocumentArtifactRebuildRegistry` for kind "report",
   * tried after `rebuildDriverStatementArtifact` returns null. Re-renders
   * the export PDF from this batch's own durably persisted record; returns
   * null (never throws) when this instance holds no such batch, which the
   * registry contract treats as "nothing to rebuild" rather than failure.
   */
  private async rebuildReimbursementBatchExportArtifact(
    batchId: string,
  ): Promise<DocumentArtifactRecord | null> {
    const batch = this.reimbursementBatches.find(
      (candidate) => candidate.batchId === batchId,
    );
    if (!batch || !batch.exportedAt) {
      return null;
    }
    const relatedStatement = this.driverStatements.find(
      (statement) => statement.statementId === batch.statementId,
    );
    try {
      const { record } = await this.documentArtifactStore.putIfAbsent({
        kind: "report",
        subjectId: batch.batchId,
        mimeType: "application/pdf",
        bytes: await renderBillingDocumentPdf(
          buildReimbursementBatchExportPdfRows(
            batch,
            relatedStatement?.feePlanVersion ?? null,
            batch.exportedAt,
          ),
        ),
      });
      return record;
    } catch {
      return null;
    }
  }

  /**
   * Card-benefit (CCAT) settlement statements for the issuer tenant, one
   * per period that has card-benefit airport-transfer trips. Each statement
   * itemises the per-trip subsidised-vs-paid reconciliation in the
   * `issuer_pays_drts` direction.
   */
  async listTenantSettlementStatements(
    tenantId: string,
  ): Promise<SettlementStatementRecord[]> {
    const periodMonths = await this.listTenantSettlementPeriodMonths(tenantId);
    const statements: SettlementStatementRecord[] = [];
    for (const periodMonth of periodMonths) {
      statements.push(
        await this.buildTenantSettlementStatement(tenantId, periodMonth),
      );
    }
    return statements;
  }

  /** Card-benefit settlement statement for a single `YYYY-MM` period. */
  async getTenantSettlementStatement(
    tenantId: string,
    periodMonth: string,
  ): Promise<SettlementStatementRecord> {
    const normalizedPeriod = periodMonth?.trim();
    if (!normalizedPeriod) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "period must be in YYYY-MM format.",
        { period: periodMonth },
      );
    }
    // Validates the YYYY-MM shape (throws VALIDATION_ERROR otherwise).
    this.getPeriodMonthRange(normalizedPeriod);
    return this.buildTenantSettlementStatement(tenantId, normalizedPeriod);
  }

  private async listTenantSettlementPeriodMonths(tenantId: string) {
    const months = new Set<string>();
    for (const trip of this.settlementTrips) {
      if (
        trip.tenantId === tenantId &&
        this.isCardBenefitSettlementTrip(trip)
      ) {
        months.add(this.toPeriodMonth(trip.completedAt));
      }
    }
    for (const trip of this.liveSettlementTrips.values()) {
      if (
        trip.tenantId === tenantId &&
        settlementChannelKeyForTrip(trip) ===
          SETTLEMENT_STATEMENT_CHANNEL_KEY &&
        Boolean(trip.benefitReference) &&
        Boolean(trip.issuerAuthorizationRef)
      ) {
        months.add(this.toPeriodMonth(trip.completedAt));
      }
    }
    // Live repository periods can exist without any matching seed trip; union
    // them in so GET /settlement-statements is not limited to seed memory.
    for (const periodMonth of await this.listLiveCardBenefitSettlementPeriods(
      tenantId,
    )) {
      months.add(periodMonth);
    }
    return [...months].sort((left, right) => right.localeCompare(left));
  }

  private async listLiveCardBenefitSettlementPeriods(
    tenantId: string,
  ): Promise<string[]> {
    if (!this.billingSettlementRepository?.isEnabled()) {
      return [];
    }

    try {
      return await this.billingSettlementRepository.listLiveCardBenefitSettlementPeriods(
        tenantId,
      );
    } catch (error) {
      this.billingSettlementRepository.reportPersistenceFailure(
        error,
        "list_live_card_benefit_settlement_periods",
      );
      return [];
    }
  }

  private isCardBenefitSettlementTrip(trip: BillingSettlementTripRecord) {
    return (
      this.getSettlementChannelKey(trip) === SETTLEMENT_STATEMENT_CHANNEL_KEY &&
      Boolean(trip.benefitReference) &&
      Boolean(trip.issuerAuthorizationRef)
    );
  }

  private async buildTenantSettlementStatement(
    tenantId: string,
    periodMonth: string,
  ): Promise<SettlementStatementRecord> {
    const { periodStart, periodEnd } = this.getPeriodMonthRange(periodMonth);
    const trips = (
      await this.listTenantInvoiceTripsInPeriod(
        tenantId,
        periodStart,
        periodEnd,
      )
    ).filter((trip) => this.isCardBenefitSettlementTrip(trip));

    const lines = trips.map((trip) => this.createSettlementStatementLine(trip));
    const fareTotal = this.sumMoney(lines.map((line) => line.fare));
    const subsidisedTotal = this.sumMoney(
      lines.map((line) => line.subsidisedAmount),
    );
    const paidTotal = this.sumMoney(lines.map((line) => line.paidAmount));
    const manifestHash = this.computeHash({
      tenantId,
      period: periodMonth,
      direction: SETTLEMENT_STATEMENT_DIRECTION,
      lines,
    });

    return {
      statementId: `settlement-statement-${tenantId}-${periodMonth}`,
      tenantId,
      period: periodMonth,
      periodStart,
      periodEnd,
      channelKey: SETTLEMENT_STATEMENT_CHANNEL_KEY,
      direction: SETTLEMENT_STATEMENT_DIRECTION,
      currency: DEFAULT_CURRENCY,
      status: this.resolveSettlementStatementStatus(tenantId, periodMonth),
      lines,
      totals: {
        tripCount: lines.length,
        fareTotal,
        subsidisedTotal,
        paidTotal,
        // issuer_pays_drts: the issuer reimburses the subsidised portion.
        issuerPayable: { ...subsidisedTotal },
      },
      artifactRef: {
        artifactId: `settlement-statement-${tenantId}-${periodMonth}`,
        kind: "settlement_statement",
        manifestHash,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private createSettlementStatementLine(
    trip: BillingSettlementTripRecord,
  ): SettlementStatementLine {
    const fare = { ...trip.grossEarning };
    const subsidisedMinor =
      trip.platformFundedDiscount.amountMinor + trip.subsidy.amountMinor;
    const paidMinor = Math.max(0, fare.amountMinor - subsidisedMinor);

    return {
      tripId: trip.orderId,
      settlementId: trip.settlementId,
      completedAt: trip.completedAt,
      driverId: trip.driverId,
      partnerEntrySlug: trip.partnerEntrySlug,
      fare,
      subsidisedAmount: this.money(subsidisedMinor),
      paidAmount: this.money(paidMinor),
      // Guaranteed present by isCardBenefitSettlementTrip filter.
      benefitReference: trip.benefitReference as string,
      issuerAuthorizationRef: trip.issuerAuthorizationRef as string,
      cardholderRefMasked: maskOpaqueToken(trip.riderId, 4, 2) ?? "***",
      eligibilityVerificationId: trip.eligibilityVerificationId,
    };
  }

  // ── Referral-channel settlement (drts_pays_partner) ──────────────────────
  // Mirror of the card-benefit statement: per completed ride attributed to a
  // referral channel (community / property-management app) via partnerEntrySlug,
  // DRTS owes the channel a revenue share (percent of fare, or flat per-trip).

  private referralRevenueShareRules: ReferralRevenueShareRule[] =
    createInitialReferralRevenueShareRules();

  private async loadReferralRateContext(partnerEntrySlug: string) {
    if (!this.billingSettlementRepository?.isEnabled()) {
      return {
        entry: null,
        rules: this.referralRevenueShareRules.filter(
          (rule) => rule.partnerEntrySlug === partnerEntrySlug,
        ),
      };
    }
    const entry =
      await this.billingSettlementRepository.loadReferralRateEntry(
        partnerEntrySlug,
      );
    if (
      !entry ||
      entry.entrySlug !== partnerEntrySlug ||
      entry.partnerType !== "referral_channel" ||
      !entry.activeFlag ||
      entry.status !== "active"
    ) {
      return { entry: null, rules: [] as ReferralRevenueShareRule[] };
    }
    return {
      entry,
      rules: (entry.referralRevenueShareRules ?? []).filter(
        (rule) =>
          rule.partnerEntrySlug === entry.entrySlug &&
          rule.partnerId === entry.partnerId,
      ),
    };
  }

  /** Active rule at completion time, selected from one committed history read. */
  async resolveReferralRevenueShareRule(
    partnerEntrySlug: string,
    atIso: string,
  ): Promise<ReferralRevenueShareRule | null> {
    const { rules } = await this.loadReferralRateContext(partnerEntrySlug);
    return this.selectReferralRevenueShareRule(rules, atIso);
  }

  private selectReferralRevenueShareRule(
    rules: readonly ReferralRevenueShareRule[],
    atIso: string,
  ): ReferralRevenueShareRule | null {
    const at = new Date(atIso).getTime();
    const candidates = rules
      .filter((rule) => {
        const from = new Date(rule.effectiveFrom).getTime();
        const until = rule.effectiveUntil
          ? new Date(rule.effectiveUntil).getTime()
          : Number.POSITIVE_INFINITY;
        return at >= from && at <= until;
      })
      .sort(
        (left, right) =>
          new Date(right.effectiveFrom).getTime() -
          new Date(left.effectiveFrom).getTime(),
      );
    return candidates[0] ? { ...candidates[0] } : null;
  }

  private async listReferralTrips(
    partnerEntrySlug: string,
    context: Awaited<
      ReturnType<BillingSettlementService["loadReferralRateContext"]>
    >,
    periodMonth?: string,
  ) {
    const trips = new Map<string, BillingSettlementTripRecord>();
    const matches = (trip: BillingSettlementTripRecord) =>
      trip.partnerEntrySlug === partnerEntrySlug &&
      (!context.entry ||
        (trip.tenantId === context.entry.tenantId &&
          trip.partnerId === context.entry.partnerId)) &&
      this.selectReferralRevenueShareRule(context.rules, trip.completedAt) !==
        null;
    if (!isStrictAuthEnvironment()) {
      for (const trip of this.settlementTrips)
        if (matches(trip)) trips.set(trip.orderId, trip);
    }
    for (const trip of this.liveSettlementTrips.values()) {
      const snapshot = this.mapLiveTripToSettlementSnapshot(trip);
      if (matches(snapshot)) trips.set(snapshot.orderId, snapshot);
    }
    if (
      context.entry &&
      periodMonth &&
      this.billingSettlementRepository?.isEnabled()
    ) {
      const { periodStart, periodEnd } = this.getPeriodMonthRange(periodMonth);
      for (const trip of await this.billingSettlementRepository.listLiveCompletedTenantTrips(
        context.entry.tenantId,
        periodStart,
        periodEnd,
      )) {
        const snapshot = this.mapLiveTripToSettlementSnapshot(trip);
        if (matches(snapshot)) trips.set(snapshot.orderId, snapshot);
      }
    }
    return [...trips.values()];
  }

  private computeReferralShareMinor(
    fareMinor: number,
    rule: ReferralRevenueShareRule,
  ): number {
    if (rule.rateType === "per_trip") {
      return Math.max(0, Math.round(rule.value));
    }
    // percent
    return Math.max(0, Math.round((fareMinor * rule.value) / 100));
  }

  /** Referral statements use one canonical history for every line in the read. */
  async listReferralStatements(
    partnerEntrySlug: string,
  ): Promise<ReferralStatementRecord[]> {
    this.assertNonBlank(partnerEntrySlug, "partnerEntrySlug");
    const context = await this.loadReferralRateContext(partnerEntrySlug);
    const months = new Set(
      (await this.listReferralTrips(partnerEntrySlug, context)).map((trip) =>
        this.toPeriodMonth(trip.completedAt),
      ),
    );
    if (context.entry && this.billingSettlementRepository?.isEnabled()) {
      for (const period of await this.billingSettlementRepository.listLiveReferralSettlementPeriods(
        context.entry.tenantId,
        partnerEntrySlug,
      ))
        months.add(period);
    }
    const statements: ReferralStatementRecord[] = [];
    for (const period of [...months].sort((left, right) =>
      right.localeCompare(left),
    )) {
      const trips = await this.listReferralTrips(
        partnerEntrySlug,
        context,
        period,
      );
      const statement = this.buildReferralStatement(
        partnerEntrySlug,
        period,
        context.rules,
        trips,
      );
      if (statement.lines.length) statements.push(statement);
    }
    return statements;
  }

  async getReferralStatement(
    partnerEntrySlug: string,
    periodMonth: string,
  ): Promise<ReferralStatementRecord> {
    this.assertNonBlank(partnerEntrySlug, "partnerEntrySlug");
    const normalizedPeriod = periodMonth?.trim();
    if (!normalizedPeriod)
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "period must be in YYYY-MM format.",
        { period: periodMonth },
      );
    this.getPeriodMonthRange(normalizedPeriod);
    const context = await this.loadReferralRateContext(partnerEntrySlug);
    const trips = await this.listReferralTrips(
      partnerEntrySlug,
      context,
      normalizedPeriod,
    );
    return this.buildReferralStatement(
      partnerEntrySlug,
      normalizedPeriod,
      context.rules,
      trips,
    );
  }

  private buildReferralStatement(
    partnerEntrySlug: string,
    periodMonth: string,
    rules: readonly ReferralRevenueShareRule[],
    attributedTrips: readonly BillingSettlementTripRecord[],
  ): ReferralStatementRecord {
    const { periodStart, periodEnd } = this.getPeriodMonthRange(periodMonth);
    const start = new Date(periodStart).getTime();
    const end = new Date(periodEnd).getTime();
    const trips = attributedTrips.filter((trip) => {
      const completedAt = new Date(trip.completedAt).getTime();
      return (
        trip.partnerEntrySlug === partnerEntrySlug &&
        this.selectReferralRevenueShareRule(rules, trip.completedAt) !== null &&
        completedAt >= start &&
        completedAt <= end
      );
    });

    const lines = trips.map((trip) =>
      this.createReferralStatementLine(trip, rules),
    );
    const gmv = this.sumMoney(lines.map((line) => line.fare));
    const shareTotal = this.sumMoney(lines.map((line) => line.shareAmount));
    const activeRiderCount = new Set(
      trips.map((trip) => trip.riderId).filter(Boolean),
    ).size;
    const manifestHash = this.computeHash({
      partnerEntrySlug,
      period: periodMonth,
      direction: REFERRAL_STATEMENT_DIRECTION,
      lines,
    });

    return {
      statementId: `referral-statement-${partnerEntrySlug}-${periodMonth}`,
      partnerEntrySlug,
      period: periodMonth,
      periodStart,
      periodEnd,
      channelKey: REFERRAL_STATEMENT_CHANNEL_KEY,
      direction: REFERRAL_STATEMENT_DIRECTION,
      currency: DEFAULT_CURRENCY,
      status: "due" as ReferralStatementStatus,
      lines,
      totals: {
        tripCount: lines.length,
        activeRiderCount,
        gmv,
        shareTotal,
      },
      artifactRef: {
        artifactId: `referral-statement-${partnerEntrySlug}-${periodMonth}`,
        kind: "referral_settlement_statement",
        manifestHash,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private createReferralStatementLine(
    trip: BillingSettlementTripRecord,
    rules: readonly ReferralRevenueShareRule[],
  ): ReferralStatementLine {
    const fare = { ...trip.grossEarning };
    // Guaranteed present by the completion-time filter above.
    const rule = this.selectReferralRevenueShareRule(
      rules,
      trip.completedAt,
    ) as ReferralRevenueShareRule;
    const shareMinor = this.computeReferralShareMinor(fare.amountMinor, rule);
    return {
      tripId: trip.orderId,
      completedAt: trip.completedAt,
      partnerEntrySlug: trip.partnerEntrySlug as string,
      fare,
      rateType: rule.rateType,
      rateValue: rule.value,
      shareAmount: this.money(shareMinor),
    };
  }

  private resolveSettlementStatementStatus(
    tenantId: string,
    periodMonth: string,
  ): SettlementStatementStatus {
    const invoiceStatus = this.resolveTenantInvoiceStatusForPeriod(
      tenantId,
      periodMonth,
    );
    if (invoiceStatus === "paid") {
      return "paid";
    }
    if (invoiceStatus === "issued") {
      return "published";
    }
    // draft / overdue → issuer reimbursement still due.
    return "due";
  }

  private createStatementLine(
    trip: BillingSettlementTripRecord,
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
      channelKey: this.getSettlementChannelKey(trip),
      orderSource: trip.orderSource,
    };
  }

  private createReimbursementItems(
    trips: BillingSettlementTripRecord[],
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
          channelKey: this.getSettlementChannelKey(trip),
        }),
      );
  }

  private async listTenantInvoiceTripsInPeriod(
    tenantId: string,
    periodStart: string,
    periodEnd: string,
    options?: { requireAuthoritativeRead?: boolean },
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
      options,
    );
    const tripMap = new Map<string, BillingSettlementTripRecord>();

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

  private async listDriverStatementTripsInPeriod(
    periodMonth: string,
    driverId?: string,
  ) {
    const { periodStart, periodEnd } = this.getPeriodMonthRange(periodMonth);
    const seededTrips = this.settlementTrips.filter(
      (trip) =>
        this.toPeriodMonth(trip.completedAt) === periodMonth &&
        (!driverId || trip.driverId === driverId),
    );
    const liveTrips = await this.listLiveDriverStatementTripsInPeriod(
      periodStart,
      periodEnd,
      driverId,
    );
    const tripMap = new Map<string, BillingSettlementTripRecord>();

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
    options?: { requireAuthoritativeRead?: boolean },
  ) {
    const liveTripMap = new Map<string, LiveSettlementTripRecord>();
    for (const trip of this.listInMemoryLiveSettlementTripsInPeriod(
      periodStart,
      periodEnd,
      { tenantId },
    )) {
      liveTripMap.set(trip.orderId, trip);
    }

    if (!this.billingSettlementRepository?.isEnabled()) {
      return [...liveTripMap.values()].map((trip) =>
        this.mapLiveTripToSettlementSnapshot(trip),
      );
    }

    try {
      const trips =
        await this.billingSettlementRepository.listLiveCompletedTenantTrips(
          tenantId,
          periodStart,
          periodEnd,
        );
      for (const trip of trips) {
        liveTripMap.set(trip.orderId, trip);
      }
      return [...liveTripMap.values()].map((trip) =>
        this.mapLiveTripToSettlementSnapshot(trip),
      );
    } catch (error) {
      this.billingSettlementRepository.reportPersistenceFailure(
        error,
        "list_live_completed_tenant_trips",
      );
      if (options?.requireAuthoritativeRead) {
        if (error instanceof ApiRequestError) {
          throw error;
        }
        const detail = error instanceof Error ? error.message : String(error);
        throw new ApiRequestError(
          HttpStatus.SERVICE_UNAVAILABLE,
          "TENANT_INVOICE_TRIP_READ_UNAVAILABLE",
          `Authoritative completed-trip query for tenant invoice failed: ${detail}`,
          {
            tenantId,
            periodStart,
            periodEnd,
          },
          true,
        );
      }
      return [...liveTripMap.values()].map((trip) =>
        this.mapLiveTripToSettlementSnapshot(trip),
      );
    }
  }

  private async listLiveDriverStatementTripsInPeriod(
    periodStart: string,
    periodEnd: string,
    driverId?: string,
  ) {
    const liveTripMap = new Map<string, LiveSettlementTripRecord>();
    for (const trip of this.listInMemoryLiveSettlementTripsInPeriod(
      periodStart,
      periodEnd,
      driverId ? { driverId } : {},
    )) {
      liveTripMap.set(trip.orderId, trip);
    }

    if (!this.billingSettlementRepository?.isEnabled()) {
      return [...liveTripMap.values()].map((trip) =>
        this.mapLiveTripToSettlementSnapshot(trip),
      );
    }

    try {
      const trips = driverId
        ? await this.billingSettlementRepository.listLiveDriverTripsInPeriodForDriver(
            driverId,
            periodStart,
            periodEnd,
          )
        : await this.billingSettlementRepository.listLiveDriverTripsInPeriod(
            periodStart,
            periodEnd,
          );
      for (const trip of trips) {
        liveTripMap.set(trip.orderId, trip);
      }
      return [...liveTripMap.values()].map((trip) =>
        this.mapLiveTripToSettlementSnapshot(trip),
      );
    } catch (error) {
      this.billingSettlementRepository.reportPersistenceFailure(
        error,
        driverId
          ? "list_live_driver_trips_in_period_for_driver"
          : "list_live_driver_trips_in_period",
      );
      return [...liveTripMap.values()].map((trip) =>
        this.mapLiveTripToSettlementSnapshot(trip),
      );
    }
  }

  private listInMemoryLiveSettlementTripsInPeriod(
    periodStart: string,
    periodEnd: string,
    filter: { tenantId?: string; driverId?: string } = {},
  ) {
    const start = new Date(periodStart).getTime();
    const end = new Date(periodEnd).getTime();

    return [...this.liveSettlementTrips.values()].filter((trip) => {
      const completedAt = new Date(trip.completedAt).getTime();
      return (
        !Number.isNaN(completedAt) &&
        completedAt >= start &&
        completedAt <= end &&
        (!filter.tenantId || trip.tenantId === filter.tenantId) &&
        (!filter.driverId || trip.driverId === filter.driverId)
      );
    });
  }

  private async resolveTenantSettlementPeriodMonth(
    tenantId: string,
    requestedPeriodMonth?: string,
  ) {
    if (requestedPeriodMonth?.trim()) {
      this.getPeriodMonthRange(requestedPeriodMonth.trim());
      return requestedPeriodMonth.trim();
    }

    const seededMonths = this.settlementTrips
      .filter((trip) => trip.tenantId === tenantId)
      .map((trip) => this.toPeriodMonth(trip.completedAt));
    const invoiceMonths = this.tenantInvoices
      .filter((invoice) => invoice.tenantId === tenantId)
      .map((invoice) => this.toPeriodMonth(invoice.periodStart));
    const liveMonths = [...this.liveSettlementTrips.values()]
      .filter((trip) => trip.tenantId === tenantId)
      .map((trip) => this.toPeriodMonth(trip.completedAt));

    const latestPeriodMonth = [...seededMonths, ...invoiceMonths, ...liveMonths]
      .sort()
      .at(-1);
    return latestPeriodMonth ?? this.toPeriodMonth(new Date().toISOString());
  }

  private buildInvoiceStatusByOrder(tenantId: string) {
    const statusByOrder = new Map<string, TenantPayableInvoiceStatus>();

    for (const invoice of this.listTenantInvoices(tenantId)) {
      const status = this.deriveTenantInvoiceStatus(invoice);
      for (const line of invoice.lines) {
        statusByOrder.set(line.orderId, status);
      }
    }

    return statusByOrder;
  }

  private resolveTenantInvoiceStatusForPeriod(
    tenantId: string,
    periodMonth: string,
  ): TenantPayableInvoiceStatus {
    const invoices = this.listTenantInvoices(tenantId).filter(
      (invoice) => this.toPeriodMonth(invoice.periodStart) === periodMonth,
    );
    if (invoices.length === 0) {
      return "draft";
    }

    if (
      invoices.some(
        (invoice) => this.deriveTenantInvoiceStatus(invoice) === "overdue",
      )
    ) {
      return "overdue";
    }
    if (invoices.every((invoice) => invoice.status === "paid")) {
      return "paid";
    }
    if (invoices.some((invoice) => invoice.status === "issued")) {
      return "issued";
    }
    return "draft";
  }

  private deriveTenantInvoiceStatus(
    invoice: TenantInvoiceRecord,
  ): TenantPayableInvoiceStatus {
    if (invoice.status === "paid") {
      return "paid";
    }
    if (
      invoice.status === "issued" &&
      Date.parse(invoice.periodEnd) + 30 * 24 * 60 * 60 * 1000 < Date.now()
    ) {
      return "overdue";
    }
    return invoice.status === "issued" ? "issued" : "draft";
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
  ): BillingSettlementTripRecord {
    // Card-benefit airport-transfer trips settle issuer_pays_drts: the driver/
    // fleet payout stays whole and the issuer (card-benefit sponsor) reimburses
    // the sponsored portion. Live orders do not persist a copay/cap breakdown,
    // so the full delivered fare is the platform-funded (sponsor-reimbursed)
    // portion. Without this, statements collapse subsidisedAmount to 0 and
    // understate issuerPayable. Non-card-benefit live trips carry no subsidy.
    const isCardBenefitTrip =
      settlementChannelKeyForTrip(trip) === SETTLEMENT_STATEMENT_CHANNEL_KEY &&
      Boolean(trip.benefitReference) &&
      Boolean(trip.issuerAuthorizationRef);
    const platformFundedDiscount = isCardBenefitTrip
      ? { ...trip.grossEarning }
      : this.money(0);
    const latestSandboxTreatment = this.findSandboxBillingTreatmentForOrder(
      trip.orderId,
    );
    const eligibleForDriverStatement =
      latestSandboxTreatment?.treatmentType === "normal_av" ? false : true;

    return {
      settlementId: `settlement-live-${trip.orderId}`,
      tenantId: trip.tenantId,
      driverId: trip.driverId,
      orderId: trip.orderId,
      completedAt: trip.completedAt,
      orderSource: trip.orderSource,
      grossEarning: { ...trip.grossEarning },
      subsidy: this.money(0),
      platformFundedDiscount,
      pricingVersionSnapshot: LIVE_SETTLEMENT_PRICING_VERSION,
      eligibleForTenantInvoice: true,
      eligibleForDriverStatement,
      serviceBucket: "business_dispatch",
      businessDispatchSubtype:
        trip.businessDispatchSubtype ?? "enterprise_dispatch",
      costCenterCode: trip.costCenterCode,
      riderId: trip.riderId,
      partnerId: trip.partnerId,
      partnerProgramId: trip.partnerProgramId,
      partnerEntrySlug: trip.partnerEntrySlug,
      eligibilityVerificationId: trip.eligibilityVerificationId,
      issuerAuthorizationRef: trip.issuerAuthorizationRef,
      benefitReference: trip.benefitReference,
      serviceProduct: trip.serviceProduct ?? null,
      tenantServiceProgramId: trip.tenantServiceProgramId ?? null,
      sourcePlatform: trip.sourcePlatform ?? null,
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

  // Serialize only edits of the same reconciliation issue, so a queued
  // partial edit starts from the last acknowledged state instead of a
  // stale pre-write snapshot. A failed edit releases the queue immediately.
  private async serializeReconciliationIssueUpdate<T>(
    issueId: string,
    update: () => Promise<T>,
  ): Promise<T> {
    const previous = this.reconciliationIssueUpdates.get(issueId);
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.reconciliationIssueUpdates.set(issueId, current);
    try {
      if (previous) await previous;
      return await update();
    } finally {
      if (this.reconciliationIssueUpdates.get(issueId) === current) {
        this.reconciliationIssueUpdates.delete(issueId);
      }
      release();
    }
  }

  private publishReconciliationIssue(issue: ReconciliationIssueRecord) {
    // A synchronous Forwarder refresh can replace the collection while SQL is
    // pending. Publish the acknowledged row by identity in the current collection,
    // rather than mutate a reference captured before that await.
    const published = this.cloneReconciliationIssue(issue);
    const index = this.reconciliationIssues.findIndex(
      (current) => current.issueId === published.issueId,
    );
    if (index >= 0) this.reconciliationIssues[index] = published;
    else this.reconciliationIssues.unshift(published);
    return published;
  }

  private requireReconciliationIssue(issueId: string) {
    this.syncDerivedForwarderIssues();
    const issue = this.reconciliationIssues.find(
      (candidate) => candidate.issueId === issueId,
    );
    if (!issue) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "Reconciliation issue not found.",
        { issueId },
      );
    }
    return issue;
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

  private getSettlementChannelKey(
    trip: Pick<
      BillingSettlementTripRecord,
      "businessDispatchSubtype" | "orderSource" | "partnerId"
    >,
  ) {
    return settlementChannelKeyForTrip(trip);
  }

  private sumMoney(amounts: MoneyAmount[]): MoneyAmount {
    return sharedSumMoney(amounts, DEFAULT_CURRENCY) as MoneyAmount;
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

  private cloneSettlementTrip(
    trip: BillingSettlementTripRecord,
  ): BillingSettlementTripRecord {
    return {
      ...trip,
      grossEarning: { ...trip.grossEarning },
      subsidy: { ...trip.subsidy },
      platformFundedDiscount: { ...trip.platformFundedDiscount },
    };
  }

  private cloneFulfillmentSegment(
    segment: FulfillmentSegmentRecord,
  ): FulfillmentSegmentRecord {
    return {
      ...segment,
      cost: segment.cost ? { ...segment.cost } : null,
    };
  }

  private cloneSandboxBillingTreatment(
    treatment: SandboxBillingTreatmentRecord,
  ): SandboxBillingTreatmentRecord {
    return {
      ...treatment,
      passengerExtraCharge: { ...treatment.passengerExtraCharge },
      internalAvCost: treatment.internalAvCost
        ? { ...treatment.internalAvCost }
        : null,
      internalHumanFallbackCost: treatment.internalHumanFallbackCost
        ? { ...treatment.internalHumanFallbackCost }
        : null,
      partnerCharge: treatment.partnerCharge
        ? { ...treatment.partnerCharge }
        : null,
      tenantCharge: treatment.tenantCharge
        ? { ...treatment.tenantCharge }
        : null,
      platformAbsorbed: treatment.platformAbsorbed
        ? { ...treatment.platformAbsorbed }
        : null,
      treatmentSnapshot: { ...treatment.treatmentSnapshot },
    };
  }

  private cloneStatement(statement: DriverStatementRecord) {
    return {
      ...statement,
      grossEarning: { ...statement.grossEarning },
      serviceFee: { ...statement.serviceFee },
      subsidy: { ...statement.subsidy },
      netAmount: { ...statement.netAmount },
      artifactDownloadMetadata: statement.artifactDownloadMetadata
        ? { ...statement.artifactDownloadMetadata }
        : null,
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
      exportDownloadMetadata: batch.exportDownloadMetadata
        ? { ...batch.exportDownloadMetadata }
        : null,
    };
  }

  private cloneReconciliationIssue(
    issue: ReconciliationIssueRecord,
  ): ReconciliationIssueRecord {
    return {
      ...issue,
      forwardedFinanceContext: issue.forwardedFinanceContext
        ? { ...issue.forwardedFinanceContext }
        : null,
      evidenceArtifactIds: [...issue.evidenceArtifactIds],
      comments: issue.comments.map((comment) => ({
        ...comment,
        artifactIds: [...comment.artifactIds],
      })),
    };
  }

  private mergeFulfillmentSegments(
    current: readonly FulfillmentSegmentRecord[],
    incoming: readonly FulfillmentSegmentRecord[],
  ) {
    const merged = new Map(
      current.map((segment) => [
        segment.fulfillmentSegmentId,
        this.cloneFulfillmentSegment(segment),
      ]),
    );
    for (const segment of incoming) {
      merged.set(
        segment.fulfillmentSegmentId,
        this.cloneFulfillmentSegment(segment),
      );
    }
    return [...merged.values()];
  }

  private mergeSandboxBillingTreatments(
    current: readonly SandboxBillingTreatmentRecord[],
    incoming: readonly SandboxBillingTreatmentRecord[],
  ) {
    const merged = new Map(
      current.map((treatment) => [
        treatment.sandboxBillingTreatmentId,
        this.cloneSandboxBillingTreatment(treatment),
      ]),
    );
    for (const treatment of incoming) {
      merged.set(
        treatment.sandboxBillingTreatmentId,
        this.cloneSandboxBillingTreatment(treatment),
      );
    }
    return [...merged.values()];
  }

  private findSandboxBillingTreatmentForOrder(orderId: string) {
    return this.sandboxBillingTreatments
      .filter((treatment) => treatment.orderId === orderId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  }

  private createIssueComment(
    actorId: string,
    message: string,
    artifactIds: readonly string[] | undefined,
    createdAt: string,
  ): ReconciliationIssueCommentRecord {
    return {
      commentId: `recon-comment-${randomUUID()}`,
      actorId,
      message,
      artifactIds: this.normalizeArtifactIds(artifactIds),
      createdAt,
    };
  }

  private normalizeArtifactIds(artifactIds?: readonly string[]) {
    return [
      ...new Set(
        (artifactIds ?? []).map((item) => item.trim()).filter(Boolean),
      ),
    ];
  }

  private mergeArtifactIds(
    existing: readonly string[],
    incoming?: readonly string[],
  ) {
    return [...new Set([...existing, ...this.normalizeArtifactIds(incoming)])];
  }

  private normalizeIssueChannelKey(command: CreateReconciliationIssueCommand) {
    const explicitChannelKey = command.channelKey?.trim();
    if (explicitChannelKey) {
      return explicitChannelKey;
    }

    return command.issueType === "forwarder_status_mismatch"
      ? "forwarded_shadow"
      : "partner_airport";
  }

  private syncDerivedForwarderIssues() {
    if (!this.forwarderService) {
      return;
    }

    const forwarderIssues = this.forwarderService.listReconciliationIssues();
    const nextIssues = [...this.reconciliationIssues];
    const changedIssues: ReconciliationIssueRecord[] = [];

    for (const forwarderIssue of forwarderIssues) {
      const existingIndex = nextIssues.findIndex(
        (issue) =>
          issue.source === "forwarder_auto" &&
          (issue.linkedReconciliationJobId ===
            forwarderIssue.reconciliationJob.reconciliationJobId ||
            issue.mirrorOrderId === forwarderIssue.mirrorOrderId),
      );
      const existingIssue =
        existingIndex >= 0 ? nextIssues[existingIndex] : undefined;
      if (existingIssue?.status === "resolved") {
        continue;
      }

      const summary =
        `Forwarder ${forwarderIssue.platformCode} mirror order ${forwarderIssue.mirrorOrderId} requires finance review after ${forwarderIssue.reconciliationJob.reason}.` +
        (forwarderIssue.lastSyncError
          ? ` Last sync error: ${forwarderIssue.lastSyncError.code}.`
          : "");
      const now = new Date().toISOString();
      const baseIssue: ReconciliationIssueRecord = {
        issueId:
          existingIssue?.issueId ??
          `recon-forwarder-${forwarderIssue.reconciliationJob.reconciliationJobId}`,
        issueType: "forwarder_status_mismatch",
        source: "forwarder_auto",
        status: existingIssue?.ownerId
          ? "assigned"
          : existingIssue?.status === "reopened"
            ? "reopened"
            : "open",
        channelKey: "forwarded_shadow",
        summary,
        ownerId: existingIssue?.ownerId ?? "fin-forwarder-ops",
        openedBy: existingIssue?.openedBy ?? "forwarder.reconciliation.bot",
        orderId: existingIssue?.orderId ?? null,
        tenantId: existingIssue?.tenantId ?? null,
        partnerId: existingIssue?.partnerId ?? null,
        partnerProgramId: existingIssue?.partnerProgramId ?? null,
        sponsorReference: existingIssue?.sponsorReference ?? null,
        mirrorOrderId: forwarderIssue.mirrorOrderId,
        externalOrderId: forwarderIssue.externalOrderId,
        linkedReconciliationJobId:
          forwarderIssue.reconciliationJob.reconciliationJobId,
        linkedInvoiceId: existingIssue?.linkedInvoiceId ?? null,
        linkedReimbursementBatchId:
          existingIssue?.linkedReimbursementBatchId ?? null,
        forwardedFinanceContext: {
          platformCode: forwarderIssue.platformCode,
          reconciliationReason: forwarderIssue.reconciliationJob.reason,
          fareAuthority: forwarderIssue.financeContext.fareAuthority,
          settlementAuthority:
            forwarderIssue.financeContext.settlementAuthority,
          driverPayoutAuthority:
            forwarderIssue.financeContext.driverPayoutAuthority ??
            "external_platform",
          localLedgerMode: forwarderIssue.financeContext.localLedgerMode,
          note:
            forwarderIssue.reconciliationJob.notes ??
            forwarderIssue.manualFallback.notes ??
            forwarderIssue.lastSyncError?.message ??
            null,
        },
        resolutionCode: null,
        resolutionSummary: null,
        resolvedAt: null,
        reopenCount: existingIssue?.reopenCount ?? 0,
        evidenceArtifactIds: this.mergeArtifactIds(
          existingIssue?.evidenceArtifactIds ?? [],
          [
            forwarderIssue.mirrorOrderId,
            forwarderIssue.reconciliationJob.reconciliationJobId,
          ],
        ),
        comments:
          existingIssue?.comments.map((comment) =>
            this.cloneIssueComment(comment),
          ) ?? [],
        createdAt: existingIssue?.createdAt ?? forwarderIssue.createdAt,
        updatedAt:
          existingIssue &&
          existingIssue.summary === summary &&
          existingIssue.externalOrderId === forwarderIssue.externalOrderId
            ? existingIssue.updatedAt
            : now,
      };

      if (existingIndex >= 0) {
        const current = nextIssues[existingIndex]!;
        if (JSON.stringify(current) !== JSON.stringify(baseIssue)) {
          nextIssues[existingIndex] = baseIssue;
          changedIssues.push(baseIssue);
        }
        continue;
      }

      nextIssues.unshift(baseIssue);
      changedIssues.push(baseIssue);
    }

    if (!changedIssues.length) {
      return;
    }

    this.reconciliationIssues = nextIssues.map((issue) =>
      this.cloneReconciliationIssue(issue),
    );
    for (const changedIssue of changedIssues) {
      // Never upsert unchanged manual rows from a pre-ACK snapshot. A derived
      // write shares the existing per-issue queue with commands, and reads the
      // current row when its turn begins so a delayed refresh cannot undo an ACK.
      void this.serializeReconciliationIssueUpdate(
        changedIssue.issueId,
        async () => {
          const current =
            this.reconciliationIssues.find(
              (issue) => issue.issueId === changedIssue.issueId,
            ) ?? changedIssue;
          await this.persistChanges(
            { reconciliationIssues: [this.cloneReconciliationIssue(current)] },
            "sync_forwarder_reconciliation_issues",
          );
        },
      );
    }
  }

  private cloneIssueComment(
    comment: ReconciliationIssueCommentRecord,
  ): ReconciliationIssueCommentRecord {
    return {
      ...comment,
      artifactIds: [...comment.artifactIds],
    };
  }

  private requirePaymentRecoveryAction(
    actionValue: string,
  ): PaymentRecoveryAction {
    const normalizedAction = actionValue
      .trim()
      .toLowerCase()
      .replace(/[-\s]+/g, "_");
    if (!PAYMENT_RECOVERY_ACTION_SET.has(normalizedAction)) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PAYMENT_RECOVERY_ACTION_NOT_SUPPORTED",
        "Payment recovery action is not supported.",
      );
    }
    return normalizedAction as PaymentRecoveryAction;
  }

  private parsePaymentRecoveryCommand(command: unknown): { reason?: string } {
    if (command === undefined || command === null) {
      return {};
    }
    if (
      typeof command !== "object" ||
      Array.isArray(command) ||
      Object.keys(command).some((key) => key !== "reason")
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PAYMENT_RECOVERY_PAYLOAD_NOT_ALLOWED",
        "Payment recovery accepts only an optional reason.",
      );
    }
    const reasonValue = (command as { reason?: unknown }).reason;
    if (reasonValue === undefined || reasonValue === null) {
      return {};
    }
    if (typeof reasonValue !== "string") {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PAYMENT_RECOVERY_REASON_INVALID",
        "Payment recovery reason must be text.",
      );
    }
    const reason = reasonValue.trim();
    if (!reason || reason.length > 500) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PAYMENT_RECOVERY_REASON_INVALID",
        "Payment recovery reason must contain 1 to 500 characters.",
      );
    }
    return { reason };
  }

  private paymentRecoveryReceiptMessage(
    action: PaymentRecoveryAction,
    status: "accepted" | "completed",
  ) {
    const label =
      action === "retry_capture"
        ? "Payment capture retry"
        : "Manual payment recovery";
    return `${label} ${status}.`;
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

  private buildMultiTaxiPaymentExceptionView(
    payment: MultiTaxiPaymentExceptionRecord,
    auditTrail: MultiTaxiPaymentAuditRecord[],
    identity: BootstrapRequestIdentity | null,
  ): MultiTaxiPaymentExceptionView {
    return {
      paymentId: payment.paymentId,
      orderId: payment.orderId,
      tripId: payment.tripId,
      status: payment.status,
      amount:
        payment.amountMinor === null
          ? null
          : {
              amountMinor: payment.amountMinor,
              currency: payment.currency,
            },
      safeProviderReference: maskOpaqueToken(payment.providerPaymentRef, 4, 4),
      attemptCount: payment.attemptCount,
      recoveryState: payment.recoveryState,
      lastRecoveryAction: payment.lastRecoveryAction,
      updatedAt: payment.updatedAt,
      availableActions: this.buildPaymentRecoveryDescriptors(payment, identity),
      auditTimeline: auditTrail.map((event) => ({ ...event })),
    };
  }

  private buildPaymentRecoveryDescriptors(
    payment: MultiTaxiPaymentExceptionRecord,
    identity: BootstrapRequestIdentity | null,
  ): ResourceActionDescriptor[] {
    const hasWriteAuthority =
      identity?.realm === "platform" &&
      identity.scopes.includes("billing:write");
    const recoveryPending =
      payment.recoveryState === "processing" ||
      payment.recoveryState === "accepted";

    return payment.availableActions.flatMap((descriptor) => {
      const normalizedAction = descriptor.action
        .trim()
        .toLowerCase()
        .replace(/[-\s]+/g, "_");
      if (!PAYMENT_RECOVERY_ACTION_SET.has(normalizedAction)) {
        return [];
      }
      const action = normalizedAction as PaymentRecoveryAction;
      const normalizedDescriptor = {
        ...descriptor,
        action,
      };

      if (!descriptor.enabled) {
        return [normalizedDescriptor];
      }
      if (payment.status !== "failed") {
        return [
          {
            ...normalizedDescriptor,
            enabled: false,
            disabledReasonCode: "payment_recovery_status_not_eligible",
          },
        ];
      }
      if (recoveryPending) {
        return [
          {
            ...normalizedDescriptor,
            enabled: false,
            disabledReasonCode: PAYMENT_RECOVERY_PENDING,
          },
        ];
      }
      if (!hasWriteAuthority) {
        return [
          {
            ...normalizedDescriptor,
            enabled: false,
            disabledReasonCode: PAYMENT_RECOVERY_WRITE_AUTHORITY_REQUIRED,
          },
        ];
      }
      if (!this.paymentRecoveryPort.isAvailable(action)) {
        return [
          {
            ...normalizedDescriptor,
            enabled: false,
            disabledReasonCode: PAYMENT_RECOVERY_PROVIDER_NOT_PROVISIONED,
          },
        ];
      }
      return [normalizedDescriptor];
    });
  }

  private async persistChanges(
    changes: PersistBillingSettlementChanges,
    context: string,
  ) {
    await this.persistChangesRequired(changes, context);
  }

  private async persistChangesRequired(
    changes: PersistBillingSettlementChanges,
    context: string,
  ) {
    if (!this.billingSettlementRepository) {
      return;
    }

    try {
      await this.billingSettlementRepository.persistChanges(changes);
    } catch (error) {
      if (
        typeof (this.billingSettlementRepository as any)
          .reportPersistenceFailure === "function"
      ) {
        (this.billingSettlementRepository as any).reportPersistenceFailure(
          error,
          context,
        );
      }
      throw error;
    }
  }
}
