import type {
  AuditLogRecord,
  Phase2AuditContext,
  Phase2AuditEventName,
  Phase2AuditSummary,
} from "@drts/contracts";

export interface Phase2AuditSink {
  recordAuditLog(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId"> & {
      requestId?: string;
    },
  ): AuditLogRecord;
}

export interface EmitPhase2AuditEventInput {
  eventName: Phase2AuditEventName;
  resourceType: string;
  resourceId: string;
  context: Phase2AuditContext;
  summary?: Phase2AuditSummary;
}

const SENSITIVE_FIELD_PATTERNS = [
  /payload/i,
  /token/i,
  /signed[_-]?url/i,
  /passenger(name|phone|email|address|notes|profile|government|national)/i,
] as const;

function shouldDropSensitiveField(key: string) {
  return SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(key));
}

function sanitizeAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeAuditValue(entry))
      .filter((entry) => entry !== undefined);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (shouldDropSensitiveField(key)) {
      continue;
    }
    const nextValue = sanitizeAuditValue(nestedValue);
    if (nextValue !== undefined) {
      sanitized[key] = nextValue;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function sanitizeAuditSummary(
  summary?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const sanitized = sanitizeAuditValue(summary);
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) {
    return undefined;
  }
  return sanitized;
}

function isAmendmentEvent(eventName: Phase2AuditEventName) {
  return eventName.endsWith(".amended");
}

function buildAuditSummary(
  eventName: Phase2AuditEventName,
  summary?: Phase2AuditSummary,
) {
  const oldValuesSummary = sanitizeAuditSummary(summary?.oldValuesSummary);
  const newValuesSummary = sanitizeAuditSummary(summary?.newValuesSummary);

  if (!isAmendmentEvent(eventName)) {
    return {
      oldValuesSummary,
      newValuesSummary,
    };
  }

  const supersedesAuditId = summary?.supersedesAuditId?.trim();
  const amendsResourceVersion = summary?.amendsResourceVersion?.trim();
  if (!supersedesAuditId || !amendsResourceVersion) {
    throw new Error(
      `${eventName} requires supersedesAuditId and amendsResourceVersion.`,
    );
  }

  return {
    oldValuesSummary,
    newValuesSummary: {
      ...(newValuesSummary ?? {}),
      supersedesAuditId,
      amendsResourceVersion,
    },
  };
}

export function emitPhase2AuditEvent(
  sink: Phase2AuditSink,
  input: EmitPhase2AuditEventInput,
) {
  const summaries = buildAuditSummary(input.eventName, input.summary);

  return sink.recordAuditLog({
    actorId: input.context.actorId,
    actorType: input.context.actorType,
    tenantId: input.context.tenantId,
    moduleName: input.context.moduleName,
    actionName: input.eventName,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    requestId: input.context.requestId,
    ...summaries,
  });
}
