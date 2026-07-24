import type { CanvasTone } from "@drts/ui-web";

export const PAYMENT_STATUSES = [
  "not_selected",
  "authorized",
  "captured",
  "failed",
  "refunded",
  "manual_recovery",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type PaymentActionDescriptor = {
  action: string;
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
      normalizedAction === "mark_paid" ||
      typeof candidate.enabled !== "boolean" ||
      typeof candidate.riskLevel !== "string" ||
      !riskLevelSet.has(candidate.riskLevel)
    ) {
      return [];
    }

    return [
      {
        action: candidate.action,
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
    updatedAt: value.updatedAt,
    availableActions: parseAvailableActions(value.availableActions),
    auditTimeline: parseAuditTimeline(value.auditTimeline),
  };
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
