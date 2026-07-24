import type { CanvasTone } from "@drts/ui-web";
import type { ActionReceipt } from "@drts/contracts";

export const PAYMENT_STATUSES = [
  "not_selected",
  "authorized",
  "captured",
  "failed",
  "refunded",
  "manual_recovery",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_RECOVERY_ACTIONS = [
  "retry_capture",
  "begin_manual_recovery",
] as const;

export type PaymentRecoveryAction = (typeof PAYMENT_RECOVERY_ACTIONS)[number];
export type PaymentRecoveryState =
  | "processing"
  | "accepted"
  | "completed"
  | "failed";

export type PaymentActionDescriptor = {
  action: PaymentRecoveryAction;
  enabled: boolean;
  disabledReasonCode?: string;
  requiresReason?: boolean;
  riskLevel: "low" | "medium" | "high";
};

export type PaymentAuditEvent = {
  auditId: string;
  actorId: string | null;
  actorType: string;
  actionName: string;
  requestId: string | null;
  createdAt: string;
};

export type PaymentExceptionView = {
  paymentId: string;
  orderId: string;
  tripId: string | null;
  status: PaymentStatus;
  amount: {
    amountMinor: number;
    currency: string;
  } | null;
  safeProviderReference: string | null;
  attemptCount: number;
  recoveryState: PaymentRecoveryState | null;
  lastRecoveryAction: PaymentRecoveryAction | null;
  updatedAt: string;
  availableActions: PaymentActionDescriptor[];
  auditTimeline: PaymentAuditEvent[];
};

export type PaymentExceptionErrorKind =
  | "forbidden"
  | "not_found"
  | "unavailable"
  | "unknown";

const statusSet = new Set<string>(PAYMENT_STATUSES);
const riskLevelSet = new Set(["low", "medium", "high"]);
const recoveryActionSet = new Set<string>(PAYMENT_RECOVERY_ACTIONS);
const recoveryStateSet = new Set([
  "processing",
  "accepted",
  "completed",
  "failed",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseAvailableActions(value: unknown): PaymentActionDescriptor[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((candidate) => {
    const normalizedAction =
      isRecord(candidate) && typeof candidate.action === "string"
        ? candidate.action.toLowerCase().replace(/[-\s]+/g, "_")
        : "";
    if (
      !isRecord(candidate) ||
      typeof candidate.action !== "string" ||
      !recoveryActionSet.has(normalizedAction) ||
      typeof candidate.enabled !== "boolean" ||
      typeof candidate.riskLevel !== "string" ||
      !riskLevelSet.has(candidate.riskLevel)
    ) {
      return [];
    }

    return [
      {
        action: normalizedAction as PaymentRecoveryAction,
        enabled: candidate.enabled,
        riskLevel: candidate.riskLevel as PaymentActionDescriptor["riskLevel"],
        ...(typeof candidate.disabledReasonCode === "string"
          ? { disabledReasonCode: candidate.disabledReasonCode }
          : {}),
        ...(typeof candidate.requiresReason === "boolean"
          ? { requiresReason: candidate.requiresReason }
          : {}),
      },
    ];
  });
}

function parseAuditTimeline(value: unknown): PaymentAuditEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((candidate) => {
    if (
      !isRecord(candidate) ||
      typeof candidate.auditId !== "string" ||
      typeof candidate.actorType !== "string" ||
      typeof candidate.actionName !== "string" ||
      typeof candidate.createdAt !== "string"
    ) {
      return [];
    }

    return [
      {
        auditId: candidate.auditId,
        actorId: readNullableText(candidate.actorId),
        actorType: candidate.actorType,
        actionName: candidate.actionName,
        requestId: readNullableText(candidate.requestId),
        createdAt: candidate.createdAt,
      },
    ];
  });
}

export function parsePaymentExceptionView(
  value: unknown,
): PaymentExceptionView | null {
  if (
    !isRecord(value) ||
    typeof value.paymentId !== "string" ||
    typeof value.orderId !== "string" ||
    typeof value.status !== "string" ||
    !statusSet.has(value.status) ||
    typeof value.attemptCount !== "number" ||
    !Number.isInteger(value.attemptCount) ||
    value.attemptCount < 0 ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }

  const amount =
    isRecord(value.amount) &&
    typeof value.amount.amountMinor === "number" &&
    Number.isFinite(value.amount.amountMinor) &&
    typeof value.amount.currency === "string"
      ? {
          amountMinor: value.amount.amountMinor,
          currency: value.amount.currency,
        }
      : null;
  const providerReference = readNullableText(value.safeProviderReference);
  const recoveryState =
    typeof value.recoveryState === "string" &&
    recoveryStateSet.has(value.recoveryState)
      ? (value.recoveryState as PaymentRecoveryState)
      : null;
  const lastRecoveryAction =
    typeof value.lastRecoveryAction === "string" &&
    recoveryActionSet.has(value.lastRecoveryAction)
      ? (value.lastRecoveryAction as PaymentRecoveryAction)
      : null;

  return {
    paymentId: value.paymentId,
    orderId: value.orderId,
    tripId: readNullableText(value.tripId),
    status: value.status as PaymentStatus,
    amount,
    safeProviderReference:
      providerReference &&
      (providerReference.includes("...") || providerReference.includes("***"))
        ? providerReference
        : null,
    attemptCount: value.attemptCount,
    recoveryState,
    lastRecoveryAction,
    updatedAt: value.updatedAt,
    availableActions: parseAvailableActions(value.availableActions),
    auditTimeline: parseAuditTimeline(value.auditTimeline),
  };
}

export function paymentRecoveryCommandPath(
  orderId: string,
  action: string,
): string | null {
  const normalizedAction = action
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
  if (!recoveryActionSet.has(normalizedAction)) {
    return null;
  }
  return `/api/payment-exceptions/${encodeURIComponent(orderId)}/actions/${normalizedAction.replaceAll("_", "-")}`;
}

export function parsePaymentRecoveryReceipt(
  value: unknown,
): ActionReceipt | null {
  if (
    !isRecord(value) ||
    typeof value.actionId !== "string" ||
    typeof value.auditId !== "string" ||
    value.resourceType !== "multi_taxi_payment_exception" ||
    typeof value.resourceId !== "string" ||
    !["accepted", "completed"].includes(String(value.status)) ||
    typeof value.message !== "string"
  ) {
    return null;
  }
  return value as unknown as ActionReceipt;
}

export function paymentStatusTone(status: PaymentStatus): CanvasTone {
  switch (status) {
    case "captured":
      return "success";
    case "failed":
      return "danger";
    case "manual_recovery":
      return "warn";
    case "authorized":
      return "info";
    default:
      return "neutral";
  }
}

export function isPaidPaymentStatus(status: PaymentStatus) {
  return status === "captured";
}

export function classifyPaymentExceptionError(
  value: unknown,
): PaymentExceptionErrorKind {
  if (!isRecord(value)) {
    return "unknown";
  }
  if (value.statusCode === 403) {
    return "forbidden";
  }
  if (value.statusCode === 404) {
    return "not_found";
  }
  if (value.statusCode === 503) {
    return "unavailable";
  }
  return "unknown";
}
