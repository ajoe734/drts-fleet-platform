import { createHash, randomUUID } from "node:crypto";

import type { SecurityEventRecord } from "@drts/contracts";

import {
  maskEmail,
  maskOpaqueToken,
  maskPhone,
} from "../sensitive-data-policy";

const REDACTED_VALUE = "[REDACTED]";

const SENSITIVE_VALUE_KEYS = [
  "authorization",
  "cookie",
  "set-cookie",
  "password",
  "otp",
  "refresh_token",
  "refreshtoken",
  "access_token",
  "accesstoken",
  "api_key",
  "apikey",
  "private_key",
  "privatekey",
  "secret",
  "token",
  "authorization_code",
  "code_verifier",
  "x-drts-internal-key",
];

function normalizeText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function hashValue(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }
  return `sha256:${createHash("sha256").update(normalized).digest("hex")}`;
}

function maskIpPrefix(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  const first = normalized.split(",")[0]?.trim() ?? normalized;
  if (first.includes(".")) {
    const segments = first.split(".");
    if (segments.length === 4) {
      return `${segments[0]}.${segments[1]}.${segments[2]}.0/24`;
    }
  }
  if (first.includes(":")) {
    const segments = first.split(":").filter(Boolean).slice(0, 4);
    return segments.length > 0 ? `${segments.join(":")}::/64` : "::/64";
  }

  return hashValue(first);
}

function isSensitiveKey(key: string) {
  const normalized = key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return SENSITIVE_VALUE_KEYS.some(
    (candidate) =>
      normalized === candidate ||
      normalized.endsWith(`_${candidate}`) ||
      normalized.includes(candidate),
  );
}

function sanitizePrimitive(key: string, value: string) {
  if (isSensitiveKey(key)) {
    return REDACTED_VALUE;
  }

  const normalizedKey = key.trim().toLowerCase();
  if (normalizedKey.includes("email")) {
    return maskEmail(value) ?? REDACTED_VALUE;
  }
  if (normalizedKey.includes("plaintext") && normalizedKey.includes("key")) {
    return REDACTED_VALUE;
  }
  if (normalizedKey.includes("phone")) {
    return maskPhone(value) ?? REDACTED_VALUE;
  }
  if (normalizedKey.includes("ip")) {
    return maskIpPrefix(value) ?? REDACTED_VALUE;
  }
  if (
    normalizedKey.includes("device") ||
    normalizedKey.includes("useragent") ||
    normalizedKey.includes("user_agent")
  ) {
    return hashValue(value) ?? REDACTED_VALUE;
  }
  if (
    normalizedKey.includes("header") &&
    (normalizedKey.includes("auth") || normalizedKey.includes("cookie"))
  ) {
    return REDACTED_VALUE;
  }
  if (
    normalizedKey.includes("code") &&
    normalizedKey.includes("registration")
  ) {
    return maskOpaqueToken(value, 2, 2) ?? REDACTED_VALUE;
  }
  return value;
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return sanitizePrimitive(key, value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(key, item));
  }
  if (typeof value === "object") {
    return sanitizeRecord(value as Record<string, unknown>);
  }
  return String(value);
}

export function sanitizeRecord(
  record: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!record) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, sanitizeValue(key, value)]),
  );
}

export interface CreateSecurityEventInput
  extends Omit<
    SecurityEventRecord,
    | "eventId"
    | "occurredAt"
    | "policyVersion"
    | "subjectIdHash"
    | "tokenIdHash"
    | "sourceIpPrefix"
    | "userAgentHash"
    | "beforeSummary"
    | "afterSummary"
    | "maskedContext"
  > {
  eventId?: string;
  occurredAt?: string;
  policyVersion?: string | null;
  subjectId?: string | null;
  tokenId?: string | null;
  sourceIp?: string | null;
  userAgent?: string | null;
  beforeSummary?: Record<string, unknown> | null;
  afterSummary?: Record<string, unknown> | null;
  maskedContext?: Record<string, unknown> | null;
}

export function buildSecurityEventRecord(
  input: CreateSecurityEventInput,
): SecurityEventRecord {
  return {
    eventId: input.eventId ?? randomUUID(),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    eventType: input.eventType,
    eventFamily: input.eventFamily,
    outcome: input.outcome,
    severity: input.severity,
    actorId: normalizeText(input.actorId),
    actorType: input.actorType,
    subjectIdHash: hashValue(input.subjectId),
    realm: input.realm,
    tenantId: normalizeText(input.tenantId),
    partnerId: normalizeText(input.partnerId),
    targetType: normalizeText(input.targetType),
    targetId: normalizeText(input.targetId),
    sessionId: normalizeText(input.sessionId),
    tokenIdHash: hashValue(input.tokenId),
    authMethods: [...new Set(input.authMethods.filter(Boolean))],
    sourceIpPrefix: maskIpPrefix(input.sourceIp),
    userAgentHash: hashValue(input.userAgent),
    requestId: normalizeText(input.requestId),
    traceId: normalizeText(input.traceId),
    reasonCode: normalizeText(input.reasonCode),
    approvalId: normalizeText(input.approvalId),
    policyVersion: normalizeText(input.policyVersion),
    beforeSummary:
      input.beforeSummary && Object.keys(input.beforeSummary).length > 0
        ? sanitizeRecord(input.beforeSummary)
        : null,
    afterSummary:
      input.afterSummary && Object.keys(input.afterSummary).length > 0
        ? sanitizeRecord(input.afterSummary)
        : null,
    maskedContext: sanitizeRecord(input.maskedContext),
  };
}
