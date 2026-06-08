/**
 * Platform Admin LLM assistant interaction audit.
 *
 * Authority: docs/05-ui/platform-admin-llm-assistant-design-development-plan-20260602.md
 *   - §9.3 Audit (assistant planned/blocked/confirmed/executed event shape)
 *   - §9.5 Data Retention (retention windows, never retain plaintext secrets)
 *   - §8.3 Configuration Locations (ASSISTANT_TRANSCRIPT_RETENTION_DAYS)
 *
 * Two audit layers exist (§9.3):
 *   1. Domain action audit  -> existing module audit via `ActionReceipt.auditId`.
 *   2. Assistant interaction audit (this module) -> planned/executed/blocked
 *      events keyed by `assistantAuditId` and linked to the domain audit id.
 *
 * Every event is run through {@link redactValue} before it is persisted so no
 * provider key, plaintext credential, API key, webhook secret, or secret-like
 * token can reach the assistant audit store.
 */

import { randomUUID } from "node:crypto";

import { Injectable, Optional } from "@nestjs/common";

import { redactValue } from "./platform-admin-assistant.redaction";

export type PlatformAssistantAuditEventType =
  | "assistant_message"
  | "assistant_plan_created"
  | "assistant_action_blocked"
  | "assistant_action_confirmed"
  | "assistant_action_executed";

/** Persisted assistant interaction audit event (§9.3). */
export interface PlatformAssistantAuditEvent {
  assistantAuditId: string;
  actorId: string;
  sessionId: string;
  route: string;
  event: PlatformAssistantAuditEventType;
  resourceType?: string;
  resourceId?: string;
  actionId?: string;
  domainAuditId?: string | null;
  redactionApplied: boolean;
  createdAt: string;
  /**
   * Optional redacted forensic context. Additive to the §9.3 shape; always
   * passed through redaction before persistence so it can never carry secrets.
   */
  metadata?: Record<string, unknown>;
}

/** Caller-supplied fields for recording an event (generated fields excluded). */
export interface RecordAssistantAuditInput {
  actorId: string;
  sessionId: string;
  route: string;
  event: PlatformAssistantAuditEventType;
  resourceType?: string;
  resourceId?: string;
  actionId?: string;
  domainAuditId?: string | null;
  /** Whether the caller already applied redaction upstream (OR-ed with local detection). */
  redactionApplied?: boolean;
  metadata?: Record<string, unknown>;
}

/** Convenience input for the common action-centric events. */
export type RecordAssistantActionInput = Omit<
  RecordAssistantAuditInput,
  "event"
>;

/** Sink that durably stores assistant audit events (DB repository in production). */
export interface PlatformAssistantAuditSink {
  persist(event: PlatformAssistantAuditEvent): void | Promise<void>;
}

/** Retention windows for assistant sessions/transcripts and audit events (§9.5). */
export interface AssistantRetentionConfig {
  /** Days assistant sessions/transcripts are kept. */
  transcriptRetentionDays: number;
  /** Days assistant audit events are kept (audit retention policy). */
  auditRetentionDays: number;
}

const DEFAULT_NON_PROD_TRANSCRIPT_DAYS = 30;
const DEFAULT_PROD_TRANSCRIPT_DAYS = 7;
const DEFAULT_AUDIT_RETENTION_DAYS = 365;

const TRANSCRIPT_RETENTION_ENV = "ASSISTANT_TRANSCRIPT_RETENTION_DAYS";
const AUDIT_RETENTION_ENV = "ASSISTANT_AUDIT_RETENTION_DAYS";

function isProductionEnv(env: NodeJS.ProcessEnv): boolean {
  const value = (env.APP_ENV ?? env.NODE_ENV ?? "").trim().toLowerCase();
  return value === "production" || value === "prod";
}

function parsePositiveDays(
  value: string | undefined,
  fallback: number,
): number {
  const normalized = value?.trim();
  if (!normalized) {
    return fallback;
  }
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

/**
 * Resolve retention configuration from backend env only (§8.3). Honors
 * `ASSISTANT_TRANSCRIPT_RETENTION_DAYS`; otherwise applies the §9.5 defaults of
 * 7 days in production and 30 days elsewhere.
 */
export function resolveAssistantRetentionConfig(
  env: NodeJS.ProcessEnv = process.env,
): AssistantRetentionConfig {
  const transcriptFallback = isProductionEnv(env)
    ? DEFAULT_PROD_TRANSCRIPT_DAYS
    : DEFAULT_NON_PROD_TRANSCRIPT_DAYS;

  return {
    transcriptRetentionDays: parsePositiveDays(
      env[TRANSCRIPT_RETENTION_ENV],
      transcriptFallback,
    ),
    auditRetentionDays: parsePositiveDays(
      env[AUDIT_RETENTION_ENV],
      DEFAULT_AUDIT_RETENTION_DAYS,
    ),
  };
}

export interface PlatformAssistantAuditRecorderOptions {
  sink?: PlatformAssistantAuditSink;
  retention?: AssistantRetentionConfig;
  /** Clock injection point for deterministic tests. */
  now?: () => Date;
  /** Id generator injection point for deterministic tests. */
  generateId?: () => string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Records assistant interaction audit events. Keeps a bounded in-memory buffer
 * (pruned per the audit retention window) and forwards every event to an
 * optional durable sink. Constructable with no arguments so a Nest module can
 * register it directly, and fully injectable for unit tests.
 */
@Injectable()
export class PlatformAdminAssistantAuditRecorder {
  private readonly sink: PlatformAssistantAuditSink | undefined;
  private readonly retention: AssistantRetentionConfig;
  private readonly now: () => Date;
  private readonly generateId: () => string;
  private readonly events: PlatformAssistantAuditEvent[] = [];

  constructor(@Optional() options: PlatformAssistantAuditRecorderOptions = {}) {
    this.sink = options.sink;
    this.retention = options.retention ?? resolveAssistantRetentionConfig();
    this.now = options.now ?? (() => new Date());
    this.generateId = options.generateId ?? (() => randomUUID());
  }

  getRetentionConfig(): AssistantRetentionConfig {
    return { ...this.retention };
  }

  /**
   * Record an assistant interaction audit event. Redacts every string field and
   * the optional metadata before persistence and computes `redactionApplied`.
   */
  record(input: RecordAssistantAuditInput): PlatformAssistantAuditEvent {
    const createdAt = this.now().toISOString();

    const redactedRoute = redactValue(input.route);
    const redactedResourceType = redactValue(input.resourceType);
    const redactedResourceId = redactValue(input.resourceId);
    const redactedActionId = redactValue(input.actionId);
    const redactedMetadata =
      input.metadata === undefined ? undefined : redactValue(input.metadata);

    const redactionApplied =
      Boolean(input.redactionApplied) ||
      redactedRoute.redacted ||
      redactedResourceType.redacted ||
      redactedResourceId.redacted ||
      redactedActionId.redacted ||
      Boolean(redactedMetadata?.redacted);

    const event: PlatformAssistantAuditEvent = {
      assistantAuditId: this.generateId(),
      actorId: input.actorId,
      sessionId: input.sessionId,
      route: redactedRoute.value,
      event: input.event,
      redactionApplied,
      createdAt,
    };

    if (redactedResourceType.value !== undefined) {
      event.resourceType = redactedResourceType.value;
    }
    if (redactedResourceId.value !== undefined) {
      event.resourceId = redactedResourceId.value;
    }
    if (redactedActionId.value !== undefined) {
      event.actionId = redactedActionId.value;
    }
    if (input.domainAuditId !== undefined) {
      event.domainAuditId = input.domainAuditId;
    }
    if (redactedMetadata !== undefined) {
      event.metadata = redactedMetadata.value;
    }

    this.events.push(event);
    this.pruneExpired(this.now());

    const persisted = this.sink?.persist(event);
    if (persisted && typeof (persisted as Promise<void>).catch === "function") {
      void (persisted as Promise<void>).catch(() => {
        /* durable sink failures must not break the assistant request path */
      });
    }

    return event;
  }

  recordMessage(
    input: RecordAssistantActionInput,
  ): PlatformAssistantAuditEvent {
    return this.record({ ...input, event: "assistant_message" });
  }

  recordPlanCreated(
    input: RecordAssistantActionInput,
  ): PlatformAssistantAuditEvent {
    return this.record({ ...input, event: "assistant_plan_created" });
  }

  recordActionBlocked(
    input: RecordAssistantActionInput,
  ): PlatformAssistantAuditEvent {
    return this.record({ ...input, event: "assistant_action_blocked" });
  }

  recordActionConfirmed(
    input: RecordAssistantActionInput,
  ): PlatformAssistantAuditEvent {
    return this.record({ ...input, event: "assistant_action_confirmed" });
  }

  recordActionExecuted(
    input: RecordAssistantActionInput,
  ): PlatformAssistantAuditEvent {
    return this.record({ ...input, event: "assistant_action_executed" });
  }

  /** Return all retained (non-expired) events, newest pruning applied first. */
  list(): PlatformAssistantAuditEvent[] {
    this.pruneExpired(this.now());
    return [...this.events];
  }

  /**
   * Export retained audit events for investigation (§9.5). Authorization is the
   * caller's responsibility; this returns only events still inside the retention
   * window, optionally filtered to a single actor or session.
   */
  export(filter?: {
    actorId?: string;
    sessionId?: string;
  }): PlatformAssistantAuditEvent[] {
    return this.list().filter((event) => {
      if (filter?.actorId && event.actorId !== filter.actorId) {
        return false;
      }
      if (filter?.sessionId && event.sessionId !== filter.sessionId) {
        return false;
      }
      return true;
    });
  }

  /** Drop in-memory events older than the audit retention window. */
  private pruneExpired(reference: Date): void {
    const cutoff =
      reference.getTime() - this.retention.auditRetentionDays * DAY_MS;
    for (let index = this.events.length - 1; index >= 0; index -= 1) {
      const candidate = this.events[index];
      if (!candidate) {
        continue;
      }
      const createdAtMs = Date.parse(candidate.createdAt);
      if (Number.isFinite(createdAtMs) && createdAtMs < cutoff) {
        this.events.splice(index, 1);
      }
    }
  }
}
