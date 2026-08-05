import type { KeyEvaluationResult } from "./internal-key-exception-registry";

export interface InternalKeyAuditEvent {
  eventType: "internal_key.used" | "internal_key_drift.detected";
  eventFamily: "credential";
  outcome: "success" | "denied" | "failure" | "expired" | "revoked";
  actorId: string;
  actorType: "system";
  realm: "system";
  targetType: "internal_key_exception";
  targetId: string;
  reasonCode: string;
  timestamp: string;
  context: {
    exceptionId?: string | undefined;
    keyState?: string | undefined;
    route?: string | undefined;
    header?: string | undefined;
    code?: string | undefined;
    reason?: string | undefined;
    owner?: string | undefined;
  };
}

export class InternalKeyAuditRecorder {
  private static instance: InternalKeyAuditRecorder;
  private readonly events: InternalKeyAuditEvent[] = [];

  public static getInstance(): InternalKeyAuditRecorder {
    if (!InternalKeyAuditRecorder.instance) {
      InternalKeyAuditRecorder.instance = new InternalKeyAuditRecorder();
    }
    return InternalKeyAuditRecorder.instance;
  }

  public recordUsage(
    evalResult: KeyEvaluationResult,
    options: { header: string; route: string },
  ): InternalKeyAuditEvent {
    const event: InternalKeyAuditEvent = {
      eventType: "internal_key.used",
      eventFamily: "credential",
      outcome: "success",
      actorId: evalResult.exception?.owner ?? "internal-caller",
      actorType: "system",
      realm: "system",
      targetType: "internal_key_exception",
      targetId: evalResult.exception?.exceptionId ?? "unknown",
      reasonCode:
        evalResult.keyState === "rotated_previous"
          ? "rotation_previous_key_used"
          : "active_key_used",
      timestamp: new Date().toISOString(),
      context: {
        exceptionId: evalResult.exception?.exceptionId,
        keyState: evalResult.keyState,
        route: options.route,
        header: options.header,
        owner: evalResult.exception?.owner,
      },
    };
    this.events.push(event);
    return event;
  }

  public recordDrift(
    evalResult: KeyEvaluationResult,
    options: { header: string; route: string },
  ): InternalKeyAuditEvent {
    const outcomeMap: Record<string, InternalKeyAuditEvent["outcome"]> = {
      expired: "expired",
      revoked: "revoked",
      undocumented: "denied",
      invalid: "failure",
    };

    const event: InternalKeyAuditEvent = {
      eventType: "internal_key_drift.detected",
      eventFamily: "credential",
      outcome: outcomeMap[evalResult.keyState ?? "invalid"] ?? "denied",
      actorId: "unauthorized_internal_caller",
      actorType: "system",
      realm: "system",
      targetType: "internal_key_exception",
      targetId: evalResult.exception?.exceptionId ?? "undocumented",
      reasonCode: evalResult.code ?? "INTERNAL_KEY_INVALID",
      timestamp: new Date().toISOString(),
      context: {
        exceptionId: evalResult.exception?.exceptionId,
        code: evalResult.code,
        reason: evalResult.reason,
        keyState: evalResult.keyState,
        route: options.route,
        header: options.header,
      },
    };
    this.events.push(event);
    return event;
  }

  public getEvents(): readonly InternalKeyAuditEvent[] {
    return this.events;
  }

  public reset(): void {
    this.events.length = 0;
  }
}

export const internalKeyAuditRecorder = InternalKeyAuditRecorder.getInstance();
