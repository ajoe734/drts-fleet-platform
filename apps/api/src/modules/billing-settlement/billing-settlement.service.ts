import { createHash, randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";
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
  MarkReimbursementPaidCommand,
  MoneyAmount,
  PassengerPaymentStatus,
  PublishDriverFeePlanCommand,
  ReconciliationIssueCommentRecord,
  ReconciliationIssueRecord,
  ReimbursementBatchRecord,
  ReimbursementItemRecord,
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
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { toActionReceipt } from "../../common/action-receipt";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import {
  BillingSettlementRepository,
  type LiveSettlementTripRecord,
  type MultiTaxiPaymentAuditRecord,
  type MultiTaxiPaymentExceptionRecord,
  type PaymentRecoveryState,
  type PersistBillingSettlementChanges,
} from "./billing-settlement.repository";
import {
  InjectPaymentRecoveryPort,
  PAYMENT_RECOVERY_ACTIONS,
  type PaymentRecoveryAction,
  type PaymentRecoveryPort,
  UnavailablePaymentRecoveryPort,
} from "./payment-recovery.port";
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
const DEFAULT_CURRENCY = "NTD";
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
      value: 10,
      currency: "TWD",
      effectiveFrom: "2026-07-01T00:00:00.000Z",
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

@Injectable()
export class BillingSettlementService implements OnModuleInit {
  private tenantBillingProfiles = new Map<string, TenantBillingProfile>([
    [DEMO_TENANT_ID, this.createDefaultBillingProfile(DEMO_TENANT_ID)],
  ]);

  private tenantInvoices: StoredTenantInvoice[] = [];

  private driverFeePlans: DriverFeePlanRecord[] = [];

  private driverStatements: DriverStatementRecord[] = [];

  private reimbursementBatches: ReimbursementBatchRecord[] = [];

  private reconciliationIssues = PARTNER_SPONSOR_MISMATCH_SEED.map((issue) =>
    this.cloneReconciliationIssue(issue),
  );

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
  ) {}

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

    return [
      {
        action: "download_artifact",
        enabled: Boolean(invoice.artifactUrl) && !artifactExpired,
        riskLevel: "low",
        ...(!invoice.artifactUrl
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
      const parsed = new URL(artifactUrl);
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

  listTenantInvoices(tenantId: string) {
    return this.tenantInvoices
      .filter((invoice) => invoice.tenantId === tenantId)
      .map((invoice) => this.cloneInvoice(invoice));
  }

  listTenantInvoicesRuntime(tenantId: string): TenantInvoiceListData {
    const items = this.tenantInvoices
      .filter((invoice) => invoice.tenantId === tenantId)
      .map((invoice) => this.toTenantInvoiceRuntimeRecord(invoice));

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
  ) {
    const driverId = command.driverId?.trim() || undefined;
    if (command.driverId !== undefined && !driverId) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "driverId must not be blank.",
        {
          periodMonth: command.periodMonth,
        },
      );
    }

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
        statement.feePlanVersion === activeFeePlan.version &&
        (!driverId || statement.driverId === driverId),
    );
    if (existingStatements.length > 0) {
      const reimbursementBatchIds = this.reimbursementBatches
        .filter(
          (batch) =>
            batch.periodMonth === command.periodMonth &&
            (!driverId || batch.driverId === driverId),
        )
        .map((batch) => batch.batchId);
      return {
        items: existingStatements.map((statement) =>
          this.cloneStatement(statement),
        ),
        reimbursementBatchIds,
      };
    }

    const eligibleTrips = (
      await this.listDriverStatementTripsInPeriod(command.periodMonth, driverId)
    ).filter((trip) => trip.eligibleForDriverStatement);
    if (eligibleTrips.length === 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "No eligible trips found for the requested statement period.",
        {
          periodMonth: command.periodMonth,
          ...(driverId ? { driverId } : {}),
        },
      );
    }

    const statementsByDriver = new Map<string, BillingSettlementTripRecord[]>();
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
    await this.persistChanges(
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

    this.reconciliationIssues = [
      this.cloneReconciliationIssue(issue),
      ...this.reconciliationIssues,
    ];
    await this.persistChanges(
      {
        reconciliationIssues: [this.cloneReconciliationIssue(issue)],
      },
      "create_reconciliation_issue",
    );
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
    issue.ownerId = command.assigneeId.trim();
    issue.status = "assigned";
    issue.updatedAt = now;

    const note = command.note?.trim();
    if (note) {
      issue.comments.push(
        this.createIssueComment(command.actorId.trim(), note, [], now),
      );
    }

    await this.persistChanges(
      {
        reconciliationIssues: [this.cloneReconciliationIssue(issue)],
      },
      "assign_reconciliation_issue",
    );
    this.recordAudit(
      {
        actorId: command.actorId.trim(),
        actorType: "platform_admin",
        tenantId: issue.tenantId,
        moduleName: "billing-settlement",
        actionName: "assign_reconciliation_issue",
        resourceType: "reconciliation_issue",
        resourceId: issue.issueId,
        newValuesSummary: {
          ownerId: issue.ownerId,
          status: issue.status,
        },
      },
      requestId,
    );

    return this.cloneReconciliationIssue(issue);
  }

  async addReconciliationIssueComment(
    issueId: string,
    command: AddReconciliationIssueCommentCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.actorId, "actorId");
    this.assertNonBlank(command.message, "message");

    const issue = this.requireReconciliationIssue(issueId);
    const now = new Date().toISOString();
    issue.comments.push(
      this.createIssueComment(
        command.actorId.trim(),
        command.message.trim(),
        command.artifactIds,
        now,
      ),
    );
    issue.evidenceArtifactIds = this.mergeArtifactIds(
      issue.evidenceArtifactIds,
      command.artifactIds,
    );
    issue.updatedAt = now;

    await this.persistChanges(
      {
        reconciliationIssues: [this.cloneReconciliationIssue(issue)],
      },
      "add_reconciliation_issue_comment",
    );
    this.recordAudit(
      {
        actorId: command.actorId.trim(),
        actorType: "platform_admin",
        tenantId: issue.tenantId,
        moduleName: "billing-settlement",
        actionName: "add_reconciliation_issue_comment",
        resourceType: "reconciliation_issue",
        resourceId: issue.issueId,
        newValuesSummary: {
          commentCount: issue.comments.length,
          evidenceArtifactIds: issue.evidenceArtifactIds,
        },
      },
      requestId,
    );

    return this.cloneReconciliationIssue(issue);
  }

  async resolveReconciliationIssue(
    issueId: string,
    command: ResolveReconciliationIssueCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.actorId, "actorId");
    this.assertNonBlank(command.resolutionSummary, "resolutionSummary");

    const issue = this.requireReconciliationIssue(issueId);
    const now = new Date().toISOString();
    issue.status = "resolved";
    issue.resolutionCode = command.resolutionCode;
    issue.resolutionSummary = command.resolutionSummary.trim();
    issue.resolvedAt = now;
    issue.updatedAt = now;
    issue.comments.push(
      this.createIssueComment(
        command.actorId.trim(),
        command.resolutionSummary.trim(),
        command.artifactIds,
        now,
      ),
    );
    issue.evidenceArtifactIds = this.mergeArtifactIds(
      issue.evidenceArtifactIds,
      command.artifactIds,
    );

    await this.persistChanges(
      {
        reconciliationIssues: [this.cloneReconciliationIssue(issue)],
      },
      "resolve_reconciliation_issue",
    );
    this.recordAudit(
      {
        actorId: command.actorId.trim(),
        actorType: "platform_admin",
        tenantId: issue.tenantId,
        moduleName: "billing-settlement",
        actionName: "resolve_reconciliation_issue",
        resourceType: "reconciliation_issue",
        resourceId: issue.issueId,
        newValuesSummary: {
          status: issue.status,
          resolutionCode: issue.resolutionCode,
          resolvedAt: issue.resolvedAt,
        },
      },
      requestId,
    );

    return this.cloneReconciliationIssue(issue);
  }

  async reopenReconciliationIssue(
    issueId: string,
    command: ReopenReconciliationIssueCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.actorId, "actorId");
    this.assertNonBlank(command.reason, "reason");

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
    issue.status = "reopened";
    issue.resolutionCode = null;
    issue.resolutionSummary = null;
    issue.resolvedAt = null;
    issue.reopenCount += 1;
    issue.updatedAt = now;
    issue.comments.push(
      this.createIssueComment(
        command.actorId.trim(),
        command.reason.trim(),
        command.artifactIds,
        now,
      ),
    );
    issue.evidenceArtifactIds = this.mergeArtifactIds(
      issue.evidenceArtifactIds,
      command.artifactIds,
    );

    await this.persistChanges(
      {
        reconciliationIssues: [this.cloneReconciliationIssue(issue)],
      },
      "reopen_reconciliation_issue",
    );
    this.recordAudit(
      {
        actorId: command.actorId.trim(),
        actorType: "platform_admin",
        tenantId: issue.tenantId,
        moduleName: "billing-settlement",
        actionName: "reopen_reconciliation_issue",
        resourceType: "reconciliation_issue",
        resourceId: issue.issueId,
        newValuesSummary: {
          status: issue.status,
          reopenCount: issue.reopenCount,
        },
      },
      requestId,
    );

    return this.cloneReconciliationIssue(issue);
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

  /** Active referral revenue-share rule for an entry at a given completion time. */
  resolveReferralRevenueShareRule(
    partnerEntrySlug: string,
    atIso: string,
  ): ReferralRevenueShareRule | null {
    const at = new Date(atIso).getTime();
    const candidates = this.referralRevenueShareRules
      .filter((rule) => rule.partnerEntrySlug === partnerEntrySlug)
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
    return candidates[0] ?? null;
  }

  private isReferralSettlementTrip(trip: BillingSettlementTripRecord): boolean {
    return (
      Boolean(trip.partnerEntrySlug) &&
      this.resolveReferralRevenueShareRule(
        trip.partnerEntrySlug as string,
        trip.completedAt,
      ) !== null
    );
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

  /** Referral statements for a channel across all periods with attributed rides. */
  async listReferralStatements(
    partnerEntrySlug: string,
  ): Promise<ReferralStatementRecord[]> {
    this.assertNonBlank(partnerEntrySlug, "partnerEntrySlug");
    const months = new Set<string>();
    for (const trip of this.settlementTrips) {
      if (
        trip.partnerEntrySlug === partnerEntrySlug &&
        this.isReferralSettlementTrip(trip)
      ) {
        months.add(this.toPeriodMonth(trip.completedAt));
      }
    }
    const periods = [...months].sort((left, right) =>
      right.localeCompare(left),
    );
    return periods.map((period) =>
      this.buildReferralStatement(partnerEntrySlug, period),
    );
  }

  /** Referral statement for a single channel + `YYYY-MM` period. */
  getReferralStatement(
    partnerEntrySlug: string,
    periodMonth: string,
  ): ReferralStatementRecord {
    this.assertNonBlank(partnerEntrySlug, "partnerEntrySlug");
    const normalizedPeriod = periodMonth?.trim();
    if (!normalizedPeriod) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "period must be in YYYY-MM format.",
        { period: periodMonth },
      );
    }
    this.getPeriodMonthRange(normalizedPeriod);
    return this.buildReferralStatement(partnerEntrySlug, normalizedPeriod);
  }

  private buildReferralStatement(
    partnerEntrySlug: string,
    periodMonth: string,
  ): ReferralStatementRecord {
    const { periodStart, periodEnd } = this.getPeriodMonthRange(periodMonth);
    const start = new Date(periodStart).getTime();
    const end = new Date(periodEnd).getTime();
    const trips = this.settlementTrips.filter((trip) => {
      const completedAt = new Date(trip.completedAt).getTime();
      return (
        trip.partnerEntrySlug === partnerEntrySlug &&
        this.isReferralSettlementTrip(trip) &&
        completedAt >= start &&
        completedAt <= end
      );
    });

    const lines = trips.map((trip) => this.createReferralStatementLine(trip));
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
  ): ReferralStatementLine {
    const fare = { ...trip.grossEarning };
    // Guaranteed present by isReferralSettlementTrip filter.
    const rule = this.resolveReferralRevenueShareRule(
      trip.partnerEntrySlug as string,
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
    let changed = false;

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
          changed = true;
        }
        continue;
      }

      nextIssues.unshift(baseIssue);
      changed = true;
    }

    if (!changed) {
      return;
    }

    this.reconciliationIssues = nextIssues.map((issue) =>
      this.cloneReconciliationIssue(issue),
    );
    this.persistChanges(
      {
        reconciliationIssues: nextIssues.map((issue) =>
          this.cloneReconciliationIssue(issue),
        ),
      },
      "sync_forwarder_reconciliation_issues",
    );
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
