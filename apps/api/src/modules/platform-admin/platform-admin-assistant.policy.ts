import type { BootstrapRequestIdentity } from "../../common/auth";
import {
  maskEmail,
  maskOpaqueToken,
  maskPhone,
} from "../../common/sensitive-data-policy";
import {
  getPlatformAdminAssistantTool,
  listPlatformAdminAssistantTools,
  PLATFORM_ADMIN_ASSISTANT_TOOL_FAMILIES,
  type PlatformAdminAssistantToolDescriptor,
  type PlatformAdminAssistantToolFamily,
} from "./platform-admin-assistant.tools";

export const PLATFORM_ADMIN_ASSISTANT_DISALLOWED_TARGETS = [
  "arbitrary_http",
  "arbitrary_sql",
  "arbitrary_dom",
  "secret_reveal",
] as const;

export type PlatformAdminAssistantDisallowedTarget =
  (typeof PLATFORM_ADMIN_ASSISTANT_DISALLOWED_TARGETS)[number];

export type PlatformAdminAssistantExecutionTarget =
  | "registry"
  | PlatformAdminAssistantDisallowedTarget;

export interface PlatformAdminAssistantToolCallRequest {
  toolName: string;
  executionTarget?: PlatformAdminAssistantExecutionTarget;
  requestedActorId?: string | null;
  requestedTenantId?: string | null;
  requestedPartnerId?: string | null;
  rawSql?: string | null;
  rawHttpUrl?: string | null;
  domSelector?: string | null;
  revealSecrets?: boolean;
}

export interface PlatformAdminAssistantExecutionIdentity {
  authMode: BootstrapRequestIdentity["authMode"];
  actorType: BootstrapRequestIdentity["actorType"];
  actorId: string;
  realm: BootstrapRequestIdentity["realm"];
  tenantId: string | null;
  partnerId: string | null;
  partnerProgramId: string | null;
  partnerEntrySlug: string | null;
  roleFamilies: string[];
  roles: string[];
  scopes: string[];
  requestId: string | null;
}

export interface PlatformAdminAssistantAllowedDecision {
  allowed: true;
  tool: PlatformAdminAssistantToolDescriptor;
  executionIdentity: PlatformAdminAssistantExecutionIdentity;
}

export interface PlatformAdminAssistantRejectedDecision {
  allowed: false;
  tool: PlatformAdminAssistantToolDescriptor | null;
  reasonCode:
    | "unknown_tool"
    | "disallowed_execution_target"
    | "permission_escalation"
    | "missing_identity";
  reason: string;
}

export type PlatformAdminAssistantToolAuthorizationDecision =
  | PlatformAdminAssistantAllowedDecision
  | PlatformAdminAssistantRejectedDecision;

export interface PlatformAdminAssistantRouteRecord {
  route: string;
  label: string;
  allowed: boolean;
  reasonCode?: string;
}

export interface PlatformAdminAssistantDataRecord {
  recordId: string;
  title: string;
  summary: string;
  fields: Record<string, unknown>;
}

export interface PlatformAdminAssistantDocumentExcerpt {
  sourcePath: string;
  title: string;
  excerpt: string;
}

export interface PlatformAdminAssistantActionReceipt {
  actionId: string;
  status: "accepted" | "completed" | "failed";
  resourceType: string;
  resourceId: string;
  message: string;
}

export interface PlatformAdminAssistantAuditEntry {
  auditId: string;
  action: string;
  actorId: string | null;
  occurredAt: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

interface PlatformAdminAssistantToolResultBase {
  toolName: string;
  family: PlatformAdminAssistantToolFamily;
}

export interface PlatformAdminAssistantRouteToolResult extends PlatformAdminAssistantToolResultBase {
  family: "route";
  outputType: "route_snapshot";
  items: PlatformAdminAssistantRouteRecord[];
}

export interface PlatformAdminAssistantDataToolResult extends PlatformAdminAssistantToolResultBase {
  family: "data";
  outputType: "record_set";
  items: PlatformAdminAssistantDataRecord[];
}

export interface PlatformAdminAssistantDocsToolResult extends PlatformAdminAssistantToolResultBase {
  family: "docs";
  outputType: "document_excerpt";
  items: PlatformAdminAssistantDocumentExcerpt[];
}

export interface PlatformAdminAssistantActionToolResult extends PlatformAdminAssistantToolResultBase {
  family: "action";
  outputType: "action_receipt";
  receipt: PlatformAdminAssistantActionReceipt;
}

export interface PlatformAdminAssistantAuditToolResult extends PlatformAdminAssistantToolResultBase {
  family: "audit";
  outputType: "audit_entry_set";
  items: PlatformAdminAssistantAuditEntry[];
}

export type PlatformAdminAssistantToolResult =
  | PlatformAdminAssistantRouteToolResult
  | PlatformAdminAssistantDataToolResult
  | PlatformAdminAssistantDocsToolResult
  | PlatformAdminAssistantActionToolResult
  | PlatformAdminAssistantAuditToolResult;

export interface PlatformAdminAssistantPersistedToolResult {
  toolName: string;
  family: PlatformAdminAssistantToolFamily;
  outputType: PlatformAdminAssistantToolResult["outputType"];
  actorId: string;
  persistedAt: string;
  redactions: string[];
  result: PlatformAdminAssistantToolResult;
}

const REDACTED_VALUE = "[REDACTED]";
const TOOL_FAMILY_SET = new Set<string>(PLATFORM_ADMIN_ASSISTANT_TOOL_FAMILIES);
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_DIGIT_PATTERN = /\d/g;
const BEARER_TOKEN_PATTERN = /bearer\s+[a-z0-9._=-]+/i;
const OPAQUE_TOKEN_PATTERN = /\b(?:sk|pk|tok|pat|key|secret)_[a-z0-9_-]{8,}\b/i;
const SENSITIVE_KEY_PATTERN =
  /(secret|token|password|authorization|cookie|credential|api[-_]?key|session|sql|query|dom|html)/i;

export function authorizePlatformAdminAssistantToolCall(
  request: PlatformAdminAssistantToolCallRequest,
  identity: BootstrapRequestIdentity | null,
): PlatformAdminAssistantToolAuthorizationDecision {
  const tool = getPlatformAdminAssistantTool(request.toolName);
  if (!tool) {
    return {
      allowed: false,
      tool: null,
      reasonCode: "unknown_tool",
      reason: `Tool "${request.toolName}" is not registered. Allowed families: ${PLATFORM_ADMIN_ASSISTANT_TOOL_FAMILIES.join(", ")}.`,
    };
  }

  if (!TOOL_FAMILY_SET.has(tool.family)) {
    return {
      allowed: false,
      tool,
      reasonCode: "unknown_tool",
      reason: `Tool family "${tool.family}" is not allowed by platform admin assistant policy.`,
    };
  }

  if (!identity?.actorId) {
    return {
      allowed: false,
      tool,
      reasonCode: "missing_identity",
      reason:
        "Platform Admin assistant tools require a current caller identity and cannot execute anonymously.",
    };
  }

  const rejectionReason = describeDisallowedExecutionTarget(request);
  if (rejectionReason) {
    return {
      allowed: false,
      tool,
      reasonCode: "disallowed_execution_target",
      reason: rejectionReason,
    };
  }

  if (
    normalizeText(request.requestedActorId) &&
    request.requestedActorId !== identity.actorId
  ) {
    return {
      allowed: false,
      tool,
      reasonCode: "permission_escalation",
      reason:
        "Assistant tools must execute as the current actor and cannot switch actor identity.",
    };
  }

  if (
    normalizeText(request.requestedTenantId) &&
    request.requestedTenantId !== identity.tenantId
  ) {
    return {
      allowed: false,
      tool,
      reasonCode: "permission_escalation",
      reason:
        "Assistant tools cannot widen tenant scope beyond the current caller identity.",
    };
  }

  if (
    normalizeText(request.requestedPartnerId) &&
    request.requestedPartnerId !== (identity.partnerId ?? null)
  ) {
    return {
      allowed: false,
      tool,
      reasonCode: "permission_escalation",
      reason:
        "Assistant tools cannot widen partner scope beyond the current caller identity.",
    };
  }

  return {
    allowed: true,
    tool,
    executionIdentity: {
      authMode: identity.authMode,
      actorType: identity.actorType,
      actorId: identity.actorId,
      realm: identity.realm,
      tenantId: identity.tenantId,
      partnerId: identity.partnerId ?? null,
      partnerProgramId: identity.partnerProgramId ?? null,
      partnerEntrySlug: identity.partnerEntrySlug ?? null,
      roleFamilies: [...identity.roleFamilies],
      roles: [...identity.roles],
      scopes: [...identity.scopes],
      requestId: identity.requestId,
    },
  };
}

export function listAllowedPlatformAdminAssistantToolFamilies(): PlatformAdminAssistantToolFamily[] {
  return [...PLATFORM_ADMIN_ASSISTANT_TOOL_FAMILIES];
}

export function listRegisteredPlatformAdminAssistantToolsByFamily(): Record<
  PlatformAdminAssistantToolFamily,
  PlatformAdminAssistantToolDescriptor[]
> {
  return listPlatformAdminAssistantTools().reduce<
    Record<
      PlatformAdminAssistantToolFamily,
      PlatformAdminAssistantToolDescriptor[]
    >
  >(
    (accumulator, tool) => {
      accumulator[tool.family].push(tool);
      return accumulator;
    },
    {
      route: [],
      data: [],
      docs: [],
      action: [],
      audit: [],
    },
  );
}

export function preparePlatformAdminAssistantToolResultForPersistence(
  result: PlatformAdminAssistantToolResult,
  actorId: string,
  persistedAt = new Date().toISOString(),
): PlatformAdminAssistantPersistedToolResult {
  const tool = getPlatformAdminAssistantTool(result.toolName);
  if (!tool) {
    throw new Error(
      `Cannot persist Platform Admin assistant result for unregistered tool "${result.toolName}".`,
    );
  }
  if (tool.family !== result.family) {
    throw new Error(
      `Tool "${result.toolName}" is registered as family "${tool.family}" but attempted to persist "${result.family}".`,
    );
  }
  if (tool.outputKind !== result.outputType) {
    throw new Error(
      `Tool "${result.toolName}" must persist output type "${tool.outputKind}", received "${result.outputType}".`,
    );
  }

  const redactions: string[] = [];

  return {
    toolName: result.toolName,
    family: result.family,
    outputType: result.outputType,
    actorId,
    persistedAt,
    redactions,
    result: sanitizeToolResult(result, redactions),
  };
}

function describeDisallowedExecutionTarget(
  request: PlatformAdminAssistantToolCallRequest,
): string | null {
  if (
    request.executionTarget === "arbitrary_http" ||
    normalizeText(request.rawHttpUrl)
  ) {
    return "Arbitrary HTTP access is not allowed. Use a registered route/data/docs/action/audit tool instead.";
  }
  if (
    request.executionTarget === "arbitrary_sql" ||
    normalizeText(request.rawSql)
  ) {
    return "Arbitrary SQL execution is not allowed. Assistant reads must go through typed repository-backed tools.";
  }
  if (
    request.executionTarget === "arbitrary_dom" ||
    normalizeText(request.domSelector)
  ) {
    return "DOM inspection/manipulation is not allowed. Platform Admin assistant tools cannot execute arbitrary DOM access.";
  }
  if (request.executionTarget === "secret_reveal" || request.revealSecrets) {
    return "Secret reveal is not allowed. Sensitive credentials must stay redacted.";
  }
  return null;
}

function sanitizeToolResult(
  result: PlatformAdminAssistantToolResult,
  redactions: string[],
): PlatformAdminAssistantToolResult {
  switch (result.family) {
    case "route":
      return {
        ...result,
        items: result.items.map((item, index) => {
          const sanitizedReasonCode =
            item.reasonCode === undefined
              ? undefined
              : redactText(
                  item.reasonCode,
                  redactions,
                  `${result.toolName}.items[${index}].reasonCode`,
                );

          return {
            ...item,
            label: redactText(
              item.label,
              redactions,
              `${result.toolName}.items[${index}].label`,
            ),
            ...(sanitizedReasonCode === undefined
              ? {}
              : { reasonCode: sanitizedReasonCode }),
          };
        }),
      };
    case "data":
      return {
        ...result,
        items: result.items.map((item, index) => ({
          ...item,
          title: redactText(
            item.title,
            redactions,
            `${result.toolName}.items[${index}].title`,
          ),
          summary: redactText(
            item.summary,
            redactions,
            `${result.toolName}.items[${index}].summary`,
          ),
          fields: redactUnknownObject(
            item.fields,
            redactions,
            `${result.toolName}.items[${index}].fields`,
          ),
        })),
      };
    case "docs":
      return {
        ...result,
        items: result.items.map((item, index) => ({
          ...item,
          title: redactText(
            item.title,
            redactions,
            `${result.toolName}.items[${index}].title`,
          ),
          excerpt: redactText(
            item.excerpt,
            redactions,
            `${result.toolName}.items[${index}].excerpt`,
          ),
        })),
      };
    case "action":
      return {
        ...result,
        receipt: {
          ...result.receipt,
          message: redactText(
            result.receipt.message,
            redactions,
            `${result.toolName}.receipt.message`,
          ),
        },
      };
    case "audit":
      return {
        ...result,
        items: result.items.map((item, index) => {
          const sanitizedMetadata =
            item.metadata === undefined
              ? undefined
              : redactUnknownObject(
                  item.metadata,
                  redactions,
                  `${result.toolName}.items[${index}].metadata`,
                );

          return {
            ...item,
            actorId:
              item.actorId === null
                ? null
                : redactText(
                    item.actorId,
                    redactions,
                    `${result.toolName}.items[${index}].actorId`,
                  ),
            summary: redactText(
              item.summary,
              redactions,
              `${result.toolName}.items[${index}].summary`,
            ),
            ...(sanitizedMetadata === undefined
              ? {}
              : { metadata: sanitizedMetadata }),
          };
        }),
      };
  }
}

function redactUnknownObject(
  value: Record<string, unknown>,
  redactions: string[],
  path: string,
): Record<string, unknown> {
  const sanitizedEntries = Object.entries(value).map(([key, entryValue]) => [
    key,
    redactUnknownValue(entryValue, redactions, `${path}.${key}`, key),
  ]);

  return Object.fromEntries(sanitizedEntries);
}

function redactUnknownValue(
  value: unknown,
  redactions: string[],
  path: string,
  keyHint?: string,
): unknown {
  if (typeof value === "string") {
    if (keyHint && SENSITIVE_KEY_PATTERN.test(keyHint)) {
      redactions.push(path);
      return REDACTED_VALUE;
    }
    return redactText(value, redactions, path);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      redactUnknownValue(entry, redactions, `${path}[${index}]`, keyHint),
    );
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redactUnknownValue(
          childValue,
          redactions,
          `${path}.${childKey}`,
          childKey,
        ),
      ]),
    );
  }

  return REDACTED_VALUE;
}

function redactText(value: string, redactions: string[], path: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  if (EMAIL_PATTERN.test(trimmed)) {
    redactions.push(path);
    return trimmed.replace(
      EMAIL_PATTERN,
      (match) => maskEmail(match) ?? REDACTED_VALUE,
    );
  }

  const digitCount = [...trimmed.matchAll(PHONE_DIGIT_PATTERN)].length;
  if (digitCount >= 7) {
    redactions.push(path);
    return maskPhone(trimmed) ?? REDACTED_VALUE;
  }

  if (BEARER_TOKEN_PATTERN.test(trimmed)) {
    redactions.push(path);
    const token = trimmed.replace(/^bearer\s+/i, "");
    const maskedToken = maskOpaqueToken(token, 4, 4) ?? REDACTED_VALUE;
    return `Bearer ${maskedToken}`;
  }

  if (OPAQUE_TOKEN_PATTERN.test(trimmed)) {
    redactions.push(path);
    return maskOpaqueToken(trimmed, 4, 4) ?? REDACTED_VALUE;
  }

  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
