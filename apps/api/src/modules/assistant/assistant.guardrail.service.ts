import { Injectable } from "@nestjs/common";

import type { ActionIntent } from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import {
  maskAddress,
  maskEmail,
  maskName,
  maskOpaqueToken,
  maskPhone,
} from "../../common/sensitive-data-policy";

type AssistantRateLimitOperation =
  | "conversation_create"
  | "message_stream"
  | "tool_invoke";

type AssistantRateLimitWindow = {
  limit: number;
  windowMs: number;
};

type AssistantRateLimitProfile = Record<
  AssistantRateLimitOperation,
  AssistantRateLimitWindow
>;

type AssistantRateLimitProfiles = Record<
  BootstrapRequestIdentity["realm"],
  AssistantRateLimitProfile
>;

type InjectionFinding = {
  path: string;
  pattern: string;
};

export interface AssistantToolGuardrailResult {
  blocked: boolean;
  findings: InjectionFinding[];
  output: unknown;
}

export interface AssistantTextGuardrailResult {
  blocked: boolean;
  findings: InjectionFinding[];
  content: string;
}

const REDACTED_TEXT = "[redacted]";
const BLOCKED_TEXT =
  "Assistant response withheld by guardrail due to unsafe prompt-injection content.";

const PROMPT_INJECTION_PATTERNS: ReadonlyArray<{
  label: string;
  expression: RegExp;
}> = [
  {
    label: "ignore_previous_instructions",
    expression:
      /\b(ignore|disregard|forget)\b[\s\S]{0,40}\b(previous|prior|above|all)\b[\s\S]{0,40}\b(instruction|prompt|message)s?\b/i,
  },
  {
    label: "system_prompt_exfiltration",
    expression:
      /\b(system prompt|developer message|hidden instruction|chain of thought)\b/i,
  },
  {
    label: "tool_override",
    expression:
      /\b(tool output|retrieved data|note|record)\b[\s\S]{0,40}\b(is the new instruction|overrides instructions?)\b/i,
  },
  {
    label: "secret_exfiltration",
    expression:
      /\b(reveal|print|show|return)\b[\s\S]{0,30}\b(secret|token|credential|api key|password)\b/i,
  },
  {
    label: "role_spoofing",
    expression: /<(system|developer|assistant)>|you are now (the )?system/i,
  },
];

const DEFAULT_RATE_LIMITS: AssistantRateLimitProfiles = {
  system: {
    conversation_create: { limit: 20, windowMs: 60_000 },
    message_stream: { limit: 90, windowMs: 60_000 },
    tool_invoke: { limit: 120, windowMs: 60_000 },
  },
  platform: {
    conversation_create: { limit: 12, windowMs: 60_000 },
    message_stream: { limit: 45, windowMs: 60_000 },
    tool_invoke: { limit: 60, windowMs: 60_000 },
  },
  tenant: {
    conversation_create: { limit: 8, windowMs: 60_000 },
    message_stream: { limit: 24, windowMs: 60_000 },
    tool_invoke: { limit: 30, windowMs: 60_000 },
  },
  ops: {
    conversation_create: { limit: 12, windowMs: 60_000 },
    message_stream: { limit: 60, windowMs: 60_000 },
    tool_invoke: { limit: 90, windowMs: 60_000 },
  },
  driver: {
    conversation_create: { limit: 0, windowMs: 60_000 },
    message_stream: { limit: 0, windowMs: 60_000 },
    tool_invoke: { limit: 0, windowMs: 60_000 },
  },
  partner: {
    conversation_create: { limit: 0, windowMs: 60_000 },
    message_stream: { limit: 0, windowMs: 60_000 },
    tool_invoke: { limit: 0, windowMs: 60_000 },
  },
};

@Injectable()
export class AssistantGuardrailService {
  private profiles: AssistantRateLimitProfiles = DEFAULT_RATE_LIMITS;

  private now: () => number = () => Date.now();

  private readonly rateLimitHits = new Map<string, number[]>();

  enforceRateLimit(
    identity: BootstrapRequestIdentity,
    operation: AssistantRateLimitOperation,
  ) {
    const profile = this.profiles[identity.realm][operation];
    const key = this.buildRateLimitKey(identity, operation);
    const currentTime = this.now();
    const windowFloor = currentTime - profile.windowMs;
    const priorHits = (this.rateLimitHits.get(key) ?? []).filter(
      (hit) => hit > windowFloor,
    );

    if (profile.limit <= 0 || priorHits.length >= profile.limit) {
      const retryAfterMs =
        priorHits.length === 0
          ? profile.windowMs
          : Math.max(1, profile.windowMs - (currentTime - priorHits[0]!));
      throw new ApiRequestError(
        429,
        "ASSISTANT_RATE_LIMITED",
        `Assistant ${operation} rate limit exceeded for realm '${identity.realm}'.`,
        {
          realm: identity.realm,
          operation,
          limit: profile.limit,
          windowMs: profile.windowMs,
          retryAfterMs,
        },
      );
    }

    priorHits.push(currentTime);
    this.rateLimitHits.set(key, priorHits);
  }

  screenToolOutput(
    toolName: string,
    payload: unknown,
  ): AssistantToolGuardrailResult {
    const findings = this.scanForPromptInjection(payload);
    if (findings.length > 0) {
      return {
        blocked: true,
        findings,
        output: {
          status: "blocked",
          reason: "prompt_injection_detected",
          toolName,
        },
      };
    }

    return {
      blocked: false,
      findings,
      output: this.remaskValue(payload),
    };
  }

  screenAssistantText(content: string): AssistantTextGuardrailResult {
    const findings = this.scanForPromptInjection(content);
    if (findings.length > 0) {
      return {
        blocked: true,
        findings,
        content: BLOCKED_TEXT,
      };
    }

    return {
      blocked: false,
      findings,
      content: this.remaskStringContent(content),
    };
  }

  sanitizeActionIntent(intent: ActionIntent): ActionIntent {
    return {
      ...intent,
      args: this.remaskValue(intent.args) as Record<string, unknown>,
    };
  }

  sanitizeMetadata(metadata: Record<string, unknown> | null) {
    return metadata
      ? (this.remaskValue(metadata) as Record<string, unknown>)
      : null;
  }

  private buildRateLimitKey(
    identity: BootstrapRequestIdentity,
    operation: AssistantRateLimitOperation,
  ) {
    return [
      operation,
      identity.realm,
      identity.tenantId ?? "-",
      identity.actorId ?? identity.requestId ?? "anonymous",
    ].join(":");
  }

  private scanForPromptInjection(
    value: unknown,
    path = "$",
    findings: InjectionFinding[] = [],
  ) {
    if (typeof value === "string") {
      for (const pattern of PROMPT_INJECTION_PATTERNS) {
        if (pattern.expression.test(value)) {
          findings.push({
            path,
            pattern: pattern.label,
          });
        }
      }
      return findings;
    }

    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        this.scanForPromptInjection(entry, `${path}[${index}]`, findings);
      });
      return findings;
    }

    if (!value || typeof value !== "object") {
      return findings;
    }

    for (const [entryKey, entryValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      this.scanForPromptInjection(entryValue, `${path}.${entryKey}`, findings);
    }

    return findings;
  }

  private remaskValue(value: unknown, key?: string): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === "string") {
      return this.remaskStringByKey(key, value);
    }

    if (Array.isArray(value)) {
      return value.map((entry) => this.remaskValue(entry));
    }

    if (typeof value !== "object") {
      return value;
    }

    const masked: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      masked[entryKey] = this.remaskValue(entryValue, entryKey);
    }
    return masked;
  }

  private remaskStringByKey(key: string | undefined, value: string) {
    switch (key) {
      case "name":
      case "fullName":
      case "displayName":
      case "accountName":
        return maskName(value) ?? null;
      case "phone":
      case "mobile":
        return maskPhone(value) ?? null;
      case "email":
        return maskEmail(value) ?? null;
      case "address":
      case "addressText":
      case "normalizedAddress":
      case "maskedAddress":
      case "maskedAddressText":
        return maskAddress(value) ?? null;
      case "callId":
      case "relatedCallId":
      case "recordingId":
      case "providerRecordingRef":
      case "issuerAuthorizationRef":
      case "benefitReference":
        return maskOpaqueToken(value, 8, 4) ?? null;
      case "description":
      case "note":
      case "notes":
      case "closingNote":
        return REDACTED_TEXT;
      default:
        return this.remaskStringContent(value);
    }
  }

  private remaskStringContent(value: string) {
    let masked = value;
    masked = masked.replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      (match) => maskEmail(match) ?? REDACTED_TEXT,
    );
    masked = masked.replace(
      /(?:\+?\d[\d\s().-]{6,}\d)/g,
      (match) => maskPhone(match) ?? REDACTED_TEXT,
    );
    return masked;
  }
}
