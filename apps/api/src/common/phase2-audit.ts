import type {
  ActionReceipt,
  AuditLogRecord,
  Phase2AuditContext,
} from "@drts/contracts";

import {
  toActionReceipt,
  type AuditedActionResult,
} from "./action-receipt";

const PHASE2_AUDIT_AMENDMENT_SUFFIX = ".amended";

export const PHASE2_AUDIT_REDACTED_FIELD_NAMES = [
  "providerPayload",
  "rawProviderPayload",
  "sourcePayload",
  "signedUrl",
  "signedUrls",
  "providerSignedUrl",
  "signedDownloadUrl",
  "token",
  "accessToken",
  "refreshToken",
  "apiToken",
  "bearerToken",
  "authorization",
  "passenger",
  "passengerName",
  "passengerPhone",
  "passengerEmail",
  "passengerContact",
  "passengerAddress",
  "passengerGovernmentId",
  "passengerDocumentNumber",
] as const;

const PHASE2_AUDIT_REDACTED_KEY_SET = new Set(
  PHASE2_AUDIT_REDACTED_FIELD_NAMES.map(normalizeAuditKey),
);

type AuditLogWriteInput = Omit<
  AuditLogRecord,
  "auditId" | "createdAt" | "requestId"
> & {
  requestId?: string;
};

export interface Phase2AuditSink {
  recordAuditLog(input: AuditLogWriteInput): AuditLogRecord;
}

export interface EmitPhase2AuditedActionInput<T> {
  sink: Phase2AuditSink;
  audit: Phase2AuditContext;
  data: T;
  actionId?: string;
  resourceType?: string;
  resourceId?: string;
  status?: ActionReceipt["status"];
  message: string;
}

export interface Phase2AuditedActionResult<T> extends AuditedActionResult<T> {
  receipt: ActionReceipt;
}

function normalizeAuditKey(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isRedactedAuditField(key: string) {
  return PHASE2_AUDIT_REDACTED_KEY_SET.has(normalizeAuditKey(key));
}

function sanitizePhase2AuditValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePhase2AuditValue(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (isRedactedAuditField(key)) {
      continue;
    }
    sanitized[key] = sanitizePhase2AuditValue(nestedValue);
  }
  return sanitized;
}

export function sanitizePhase2AuditSummary(
  summary?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!summary) {
    return undefined;
  }

  return sanitizePhase2AuditValue(summary) as Record<string, unknown>;
}

function isAmendmentEventName(eventName: Phase2AuditContext["eventName"]) {
  return eventName.endsWith(PHASE2_AUDIT_AMENDMENT_SUFFIX);
}

function validatePhase2AuditContext(context: Phase2AuditContext) {
  const hasAmendmentLink =
    Boolean(context.supersedesAuditId) ||
    Boolean(context.amendsResourceVersion);

  if (hasAmendmentLink && !isAmendmentEventName(context.eventName)) {
    throw new Error(
      "Phase2 amendment metadata requires an '.amended' audit event name.",
    );
  }

  if (!hasAmendmentLink && isAmendmentEventName(context.eventName)) {
    throw new Error(
      "Phase2 amendment events require supersedesAuditId or amendsResourceVersion.",
    );
  }
}

function buildPhase2AuditNewValuesSummary(context: Phase2AuditContext) {
  return sanitizePhase2AuditSummary({
    ...context.summary,
    ...(context.resourceVersion
      ? { resourceVersion: context.resourceVersion }
      : {}),
    ...(context.sourceSystem ? { sourceSystem: context.sourceSystem } : {}),
    ...(context.sourceRef ? { sourceRef: context.sourceRef } : {}),
    ...(context.occurredAt ? { occurredAt: context.occurredAt } : {}),
    ...(context.supersedesAuditId
      ? { supersedesAuditId: context.supersedesAuditId }
      : {}),
    ...(context.amendsResourceVersion
      ? { amendsResourceVersion: context.amendsResourceVersion }
      : {}),
  });
}

export function emitPhase2AuditRecord(
  sink: Phase2AuditSink,
  context: Phase2AuditContext,
): AuditLogRecord {
  validatePhase2AuditContext(context);

  const oldValuesSummary = sanitizePhase2AuditSummary(context.previousSummary);
  const newValuesSummary = buildPhase2AuditNewValuesSummary(context);

  return sink.recordAuditLog({
    actorId: context.actorId,
    actorType: context.actorType,
    tenantId: context.tenantId,
    moduleName: context.moduleName,
    actionName: context.eventName,
    resourceType: context.resourceType,
    resourceId: context.resourceId,
    ...(oldValuesSummary ? { oldValuesSummary } : {}),
    ...(newValuesSummary ? { newValuesSummary } : {}),
    ...(context.requestId ? { requestId: context.requestId } : {}),
  });
}

export function emitPhase2AuditedAction<T>(
  input: EmitPhase2AuditedActionInput<T>,
): Phase2AuditedActionResult<T> {
  const auditLog = emitPhase2AuditRecord(input.sink, input.audit);
  const receipt = toActionReceipt({
    auditLog,
    actionId: input.actionId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    status: input.status,
    message: input.message,
  });

  return {
    data: input.data,
    auditLog,
    receipt,
  };
}
