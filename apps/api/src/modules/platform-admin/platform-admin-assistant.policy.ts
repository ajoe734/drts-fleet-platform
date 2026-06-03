import type { BootstrapRequestIdentity } from "../../common/auth";
import {
  maskAddress,
  maskEmail,
  maskName,
  maskOpaqueToken,
  maskPhone,
} from "../../common/sensitive-data-policy";

export const PLATFORM_ADMIN_ASSISTANT_ALLOWED_TOOL_FAMILIES = [
  "route",
  "data",
  "docs",
  "action",
  "audit",
] as const;

export type PlatformAdminAssistantToolFamily =
  (typeof PLATFORM_ADMIN_ASSISTANT_ALLOWED_TOOL_FAMILIES)[number];

export const PLATFORM_ADMIN_ASSISTANT_BLOCKED_CAPABILITIES = [
  "arbitrary_http",
  "arbitrary_sql",
  "arbitrary_dom",
  "secret_reveal",
] as const;

export type PlatformAdminAssistantBlockedCapability =
  (typeof PLATFORM_ADMIN_ASSISTANT_BLOCKED_CAPABILITIES)[number];

export interface PlatformAdminAssistantExecutionScope {
  actorId: string | null;
  actorType: BootstrapRequestIdentity["actorType"];
  realm: BootstrapRequestIdentity["realm"];
  tenantId: string | null;
  partnerId: string | null;
  partnerProgramId: string | null;
  partnerEntrySlug: string | null;
  scopes: string[];
}

export interface PlatformAdminAssistantTranscriptPayload<T = unknown> {
  outputType: string;
  content: T;
  redacted: true;
}

export interface PlatformAdminAssistantToolExecutionRequest {
  toolId: string;
  family: string;
  capability?: string | null;
  requiredScopes?: string[] | null;
  requestedScope?: Partial<PlatformAdminAssistantExecutionScope> | null;
}

export type PlatformAdminAssistantToolPolicyDecision =
  | {
      allowed: true;
      reason: "allowed";
      effectiveScope: PlatformAdminAssistantExecutionScope;
    }
  | {
      allowed: false;
      reason:
        | "tool_family_not_allowed"
        | "tool_capability_blocked"
        | "scope_escalation_forbidden";
      policyMessage: string;
    };

export function buildAssistantExecutionScope(
  identity: BootstrapRequestIdentity | null,
): PlatformAdminAssistantExecutionScope {
  return {
    actorId: identity?.actorId ?? null,
    actorType: identity?.actorType ?? "system",
    realm: identity?.realm ?? "system",
    tenantId: identity?.tenantId ?? null,
    partnerId: identity?.partnerId ?? null,
    partnerProgramId: identity?.partnerProgramId ?? null,
    partnerEntrySlug: identity?.partnerEntrySlug ?? null,
    scopes: [...(identity?.scopes ?? [])],
  };
}

export function evaluatePlatformAdminAssistantToolRequest(
  identity: BootstrapRequestIdentity | null,
  request: PlatformAdminAssistantToolExecutionRequest,
): PlatformAdminAssistantToolPolicyDecision {
  const callerScope = buildAssistantExecutionScope(identity);

  if (!isAllowedToolFamily(request.family)) {
    return {
      allowed: false,
      reason: "tool_family_not_allowed",
      policyMessage:
        "Assistant policy allows only route, data, docs, action, and audit tools.",
    };
  }

  if (request.capability && isBlockedCapability(request.capability)) {
    return {
      allowed: false,
      reason: "tool_capability_blocked",
      policyMessage:
        "Assistant policy forbids arbitrary HTTP, arbitrary SQL, arbitrary DOM, and secret reveal capabilities.",
    };
  }

  if (wouldWidenPermissions(callerScope, request.requestedScope ?? null)) {
    return {
      allowed: false,
      reason: "scope_escalation_forbidden",
      policyMessage:
        "Assistant tools must execute under the current actor identity and cannot widen permissions.",
    };
  }

  if (
    request.requiredScopes &&
    request.requiredScopes.some((scope) => !callerScope.scopes.includes(scope))
  ) {
    return {
      allowed: false,
      reason: "scope_escalation_forbidden",
      policyMessage:
        "Assistant tools cannot request scopes the current actor does not already hold.",
    };
  }

  return {
    allowed: true,
    reason: "allowed",
    effectiveScope: callerScope,
  };
}

export function redactAssistantToolOutput<T>(
  outputType: string,
  content: T,
): PlatformAdminAssistantTranscriptPayload<unknown> {
  return {
    outputType,
    content: redactUnknownValue(content),
    redacted: true,
  };
}

function isAllowedToolFamily(
  family: string,
): family is PlatformAdminAssistantToolFamily {
  return (
    PLATFORM_ADMIN_ASSISTANT_ALLOWED_TOOL_FAMILIES as readonly string[]
  ).includes(family);
}

function isBlockedCapability(capability: string): boolean {
  return (
    PLATFORM_ADMIN_ASSISTANT_BLOCKED_CAPABILITIES as readonly string[]
  ).includes(capability);
}

function wouldWidenPermissions(
  callerScope: PlatformAdminAssistantExecutionScope,
  requestedScope: Partial<PlatformAdminAssistantExecutionScope> | null,
) {
  if (!requestedScope) {
    return false;
  }

  if (
    requestedScope.actorId !== undefined &&
    requestedScope.actorId !== callerScope.actorId
  ) {
    return true;
  }
  if (
    requestedScope.actorType !== undefined &&
    requestedScope.actorType !== callerScope.actorType
  ) {
    return true;
  }
  if (
    requestedScope.realm !== undefined &&
    requestedScope.realm !== callerScope.realm
  ) {
    return true;
  }
  if (
    requestedScope.tenantId !== undefined &&
    requestedScope.tenantId !== callerScope.tenantId
  ) {
    return true;
  }
  if (
    requestedScope.partnerId !== undefined &&
    requestedScope.partnerId !== callerScope.partnerId
  ) {
    return true;
  }
  if (
    requestedScope.partnerProgramId !== undefined &&
    requestedScope.partnerProgramId !== callerScope.partnerProgramId
  ) {
    return true;
  }
  if (
    requestedScope.partnerEntrySlug !== undefined &&
    requestedScope.partnerEntrySlug !== callerScope.partnerEntrySlug
  ) {
    return true;
  }
  if (
    requestedScope.scopes &&
    requestedScope.scopes.some((scope) => !callerScope.scopes.includes(scope))
  ) {
    return true;
  }

  return false;
}

function redactUnknownValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactUnknownValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        redactObjectField(key, entry),
      ]),
    );
  }

  return value;
}

function redactObjectField(key: string, value: unknown): unknown {
  if (value == null) {
    return value;
  }

  if (typeof value === "string") {
    const normalizedKey = key.toLowerCase();

    if (normalizedKey.includes("email")) {
      return maskEmail(value);
    }
    if (normalizedKey.includes("phone")) {
      return maskPhone(value);
    }
    if (normalizedKey.includes("name")) {
      return maskName(value);
    }
    if (normalizedKey.includes("address")) {
      return maskAddress(value);
    }
    if (
      normalizedKey.includes("secret") ||
      normalizedKey.includes("token") ||
      normalizedKey.includes("key") ||
      normalizedKey.includes("password") ||
      normalizedKey.includes("signature") ||
      normalizedKey.includes("authorization")
    ) {
      return maskOpaqueToken(value, 4, 2);
    }
  }

  return redactUnknownValue(value);
}
