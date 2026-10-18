import { randomUUID } from "node:crypto";
import type {
  CreatePlatformNoticeCommand,
  PlatformNoticeRecord,
  NotificationRecord,
} from "@drts/contracts";
import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import type { AuditNotificationService } from "../audit-notification/audit-notification.service";

export type NoticeSeverity = PlatformNoticeRecord["severity"] | "maintenance";
export type NoticeCommand = Omit<CreatePlatformNoticeCommand, "severity"> & {
  severity: NoticeSeverity;
  expiresAt?: string | null;
  reason?: string;
  confirmed?: boolean;
};
export type NoticeAudience = "ops" | "tenants" | "drivers";
export type NoticeOutcomeState =
  | "scheduled"
  | "pending"
  | "routed"
  | "available"
  | "read"
  | "failed"
  | "unknown";
export interface NoticeOutcome {
  outcomeId: string;
  audience: NoticeAudience;
  state: NoticeOutcomeState;
  notificationId: string | null;
  recipientId: string | null;
  tenantId: string | null;
  availableAt: string | null;
  readAt: string | null;
  error: string | null;
}
export type CanonicalNotice = Omit<PlatformNoticeRecord, "severity"> & {
  severity: NoticeSeverity;
  expiresAt: string | null;
  reason: string | null;
  storageMode: "process_memory";
  downlistedReason: "expired" | "manual" | null;
  outcomes: NoticeOutcome[];
};
export type RecipientNotice = Omit<CanonicalNotice, "outcomes"> & {
  outcome: NoticeOutcome;
};

/** Explicit optional times: absence means open ended; blank/invalid is never absence. */
export function noticeTime(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== "string" ||
    !value.trim() ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new ApiRequestError(
      400,
      "NOTICE_INVALID_TIME",
      `${field} must be an explicit ISO timestamp or null.`,
    );
  }
  const normalized = new Date(value).toISOString();
  // Date.parse normalizes impossible days such as February 30; reject them too.
  const day = value.slice(0, 10);
  if (new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) {
    throw new ApiRequestError(
      400,
      "NOTICE_INVALID_TIME",
      `${field} contains an invalid calendar date.`,
    );
  }
  return normalized;
}

export function noticePrincipal(
  identity: BootstrapRequestIdentity | null | undefined,
  audience: NoticeAudience,
) {
  const realm = { ops: "ops", tenants: "tenant", drivers: "driver" }[audience];
  const scope = {
    tenants: "tenant:read",
    drivers: "driver:read",
    ops: "notifications:read",
  }[audience];
  if (
    !identity?.actorId ||
    identity.realm !== realm ||
    (audience === "tenants" && !identity.tenantId) ||
    !identity.scopes.some((s) => s === scope || s === "*")
  ) {
    throw new ApiRequestError(
      403,
      "NOTICE_PRINCIPAL_MISMATCH",
      "A verified principal bound to this notice audience is required.",
    );
  }
  return {
    recipientId: identity.principalId || identity.actorId,
    tenantId: identity.tenantId,
    audience,
  };
}

/** Same lifetime as PlatformAdminService; no timer, provider or durable outbox claim. */
export class PlatformNoticeLifecycle {
  private readonly notices: CanonicalNotice[];
  constructor(
    private readonly notifications: AuditNotificationService,
    seeds: PlatformNoticeRecord[] = [],
  ) {
    this.notices = seeds.map((n) => ({
      ...n,
      expiresAt: null,
      reason: null,
      storageMode: "process_memory",
      downlistedReason: null,
      outcomes: [],
    }));
  }

  private snapshot(notice: CanonicalNotice): CanonicalNotice {
    return { ...notice, outcomes: notice.outcomes.map((o) => ({ ...o })) };
  }
  private routingOutcome(
    audience: NoticeAudience,
    state: NoticeOutcomeState,
  ): NoticeOutcome {
    return {
      outcomeId: `notice-outcome-${randomUUID()}`,
      audience,
      state,
      notificationId: null,
      recipientId: null,
      tenantId: null,
      availableAt: null,
      readAt: null,
      error: null,
    };
  }
  private reconcile(n: CanonicalNotice, now: number) {
    if (n.status === "resolved") return;
    if (n.expiresAt && now >= Date.parse(n.expiresAt)) {
      n.status = "resolved";
      n.downlistedReason = "expired";
      n.resolvedAt = n.expiresAt;
      n.updatedAt = n.expiresAt;
      return;
    }
    const active = !n.scheduledAt || now >= Date.parse(n.scheduledAt);
    if (active && n.status === "scheduled") {
      n.status = "active";
      n.updatedAt = n.scheduledAt ?? n.createdAt;
    }
    // Existing seeds acquire honest route records, never synthetic delivery counts.
    if (!n.outcomes.length) {
      const audiences: NoticeAudience[] =
        n.targetAudience === "all"
          ? ["ops", "tenants", "drivers"]
          : [n.targetAudience];
      n.outcomes = audiences.map((a) =>
        this.routingOutcome(a, active ? "routed" : "scheduled"),
      );
    }
    for (const outcome of n.outcomes) {
      if (active && outcome.state === "scheduled") outcome.state = "routed";
    }
  }
  private reconcileReceipt(
    outcome: NoticeOutcome,
    actual: NotificationRecord | undefined,
  ) {
    if (!outcome.notificationId) return;
    if (!actual) {
      // Keep the historical read timestamp, but do not present it as current
      // authority or use it to acknowledge another command.
      outcome.state = "unknown";
      outcome.error = "notification_record_missing";
      return;
    }
    outcome.readAt = actual.readAt;
    outcome.state = actual.readAt ? "read" : "available";
    outcome.error = null;
  }
  list(): CanonicalNotice[] {
    const now = Date.now();
    const notifications = new Map(
      this.notifications.listNotifications().map((n) => [n.notificationId, n]),
    );
    for (const n of this.notices) {
      this.reconcile(n, now);
      for (const outcome of n.outcomes) {
        this.reconcileReceipt(
          outcome,
          notifications.get(outcome.notificationId ?? ""),
        );
      }
    }
    return this.notices.map((n) => this.snapshot(n));
  }
  create(command: NoticeCommand): CanonicalNotice {
    if (
      !["info", "warning", "critical", "maintenance"].includes(
        command.severity,
      ) ||
      !["all", "ops", "tenants", "drivers"].includes(command.targetAudience)
    ) {
      throw new ApiRequestError(
        400,
        "NOTICE_INVALID_ENUM",
        "Invalid notice severity or audience.",
      );
    }
    if (
      (command.severity === "critical" || command.severity === "maintenance") &&
      (!command.reason?.trim() || command.confirmed !== true)
    ) {
      throw new ApiRequestError(
        400,
        "NOTICE_CONFIRMATION_REQUIRED",
        "Critical and maintenance notices require confirmation and a reason.",
      );
    }
    const scheduledAt = noticeTime(command.scheduledAt, "scheduledAt");
    const expiresAt = noticeTime(command.expiresAt, "expiresAt");
    if (
      scheduledAt &&
      expiresAt &&
      Date.parse(expiresAt) <= Date.parse(scheduledAt)
    ) {
      throw new ApiRequestError(
        400,
        "NOTICE_INVALID_WINDOW",
        "Expiry must be after the scheduled start.",
      );
    }
    const now = new Date().toISOString();
    const notice: CanonicalNotice = {
      noticeId: `notice_${randomUUID()}`,
      title: command.title.trim(),
      body: command.body.trim(),
      severity: command.severity,
      targetAudience: command.targetAudience,
      status: "scheduled",
      scheduledAt,
      expiresAt,
      reason: command.reason?.trim() || null,
      resolvedAt: null,
      createdBy: null,
      createdAt: now,
      updatedAt: now,
      storageMode: "process_memory",
      downlistedReason: null,
      outcomes: [],
    };
    this.reconcile(notice, Date.now());
    this.notices.unshift(notice);
    return this.snapshot(notice);
  }
  resolve(id: string): CanonicalNotice {
    const notice = this.notices.find((n) => n.noticeId === id);
    if (!notice)
      throw new ApiRequestError(
        404,
        "NOTICE_NOT_FOUND",
        "Platform notice not found.",
        { noticeId: id },
      );
    notice.status = "resolved";
    notice.resolvedAt = new Date().toISOString();
    notice.updatedAt = notice.resolvedAt;
    notice.downlistedReason = "manual";
    return this.snapshot(notice);
  }
  forPrincipal(
    identity: BootstrapRequestIdentity | null,
    audience: NoticeAudience,
  ): RecipientNotice[] {
    const principal = noticePrincipal(identity, audience);
    this.list();
    const result: RecipientNotice[] = [];
    for (const notice of this.notices) {
      if (
        notice.status !== "active" ||
        (notice.targetAudience !== "all" && notice.targetAudience !== audience)
      )
        continue;
      let outcome = notice.outcomes.find(
        (o) =>
          o.audience === audience &&
          o.recipientId === principal.recipientId &&
          o.tenantId === principal.tenantId,
      );
      if (!outcome) {
        outcome = { ...this.routingOutcome(audience, "pending"), ...principal };
        notice.outcomes.push(outcome);
      }
      if (!outcome.notificationId) {
        try {
          // Only a legally bound recipient materializes a notification. The route
          // record above is a producer queue, not a claim of device delivery.
          const notification = this.notifications.recordNotification({
            tenantId: principal.tenantId,
            recipientUserId: identity!.actorId,
            channel: "ops_notice",
            title: notice.title,
            message: notice.body,
            status: "unread",
          });
          if (!notification?.notificationId)
            throw new Error("Notification insertion was not acknowledged");
          outcome.notificationId = notification.notificationId;
          outcome.availableAt = new Date().toISOString();
          outcome.state = "available";
          outcome.error = null;
        } catch {
          outcome.state = "failed";
          outcome.error = "notification_record_failed";
          throw new ApiRequestError(
            503,
            "NOTICE_ROUTING_FAILED",
            "Notice notification could not be made available.",
          );
        }
      }
      const actual = this.notifications
        .listNotifications()
        .find((n) => n.notificationId === outcome!.notificationId);
      this.reconcileReceipt(outcome, actual);
      const { outcomes: _outcomes, ...record } = this.snapshot(notice);
      void _outcomes; // Recipient projection deliberately omits every other receipt.
      result.push({ ...record, outcome: { ...outcome } });
    }
    return result;
  }
  read(
    id: string,
    outcomeId: string,
    identity: BootstrapRequestIdentity | null,
    audience: NoticeAudience,
  ) {
    const principal = noticePrincipal(identity, audience);
    this.list();
    const notice = this.notices.find((n) => n.noticeId === id);
    const outcome = notice?.outcomes.find(
      (o) =>
        o.outcomeId === outcomeId &&
        o.audience === audience &&
        o.recipientId === principal.recipientId &&
        o.tenantId === principal.tenantId,
    );
    if (!outcome?.notificationId)
      throw new ApiRequestError(
        404,
        "NOTICE_RECEIPT_NOT_FOUND",
        "Own notice receipt not found.",
      );
    if (!outcome.readAt) {
      this.notifications.markNotificationsRead({
        notificationIds: [outcome.notificationId],
      });
    }
    // Idempotent retries must still read the actual correlated notification.
    // A timestamp cached before a missing-record read is not a fresh ACK.
    const actual = this.notifications
      .listNotifications()
      .find((n) => n.notificationId === outcome.notificationId);
    this.reconcileReceipt(outcome, actual);
    if (!actual?.readAt)
      throw new ApiRequestError(
        503,
        "NOTICE_READ_NOT_ACKNOWLEDGED",
        "Notification read was not acknowledged.",
      );
    return { ...outcome };
  }
  notificationFeed(
    identity: BootstrapRequestIdentity | null,
    audience: NoticeAudience,
  ): NotificationRecord[] {
    const records = this.forPrincipal(identity, audience);
    const ids = new Set(records.map((r) => r.outcome.notificationId));
    return this.notifications
      .listNotifications()
      .filter((n) => ids.has(n.notificationId));
  }
}
