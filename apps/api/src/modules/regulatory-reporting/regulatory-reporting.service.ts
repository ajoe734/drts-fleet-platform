import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, Logger } from "@nestjs/common";

import type {
  ApproveRegulatoryNotificationCommand,
  AcknowledgeRegulatoryNotificationCommand,
  CreateRegulatoryNotificationCommand,
  RegulatoryNotificationPolicy,
  RegulatoryNotificationRecord,
  RegulatoryNotificationReminder,
  RegulatoryNotificationSeverity,
  SubmitRegulatoryNotificationCommand,
  SubmitRegulatoryNotificationReviewCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";

type NotificationClock = () => Date;
type RegulatoryActionActor = BootstrapRequestIdentity & {
  actorId: string;
  actorType:
    | "system"
    | "platform_admin"
    | "tenant_admin"
    | "ops_user"
    | "partner_api_key"
    | "referral_passenger";
};

const DEFAULT_REGULATORY_NOTIFICATION_POLICIES: Record<
  RegulatoryNotificationSeverity,
  RegulatoryNotificationPolicy
> = {
  informational: {
    severity: "informational",
    recipients: [
      {
        recipientId: "reg-compliance-inbox",
        roleCode: "compliance_officer",
        channel: "email",
        label: "Regulatory compliance inbox",
      },
    ],
    approverRoleCodes: ["compliance_manager", "platform_admin"],
    deadlineMinutes: 7 * 24 * 60,
    reminderOffsetsMinutes: [24 * 60, 60],
  },
  incident: {
    severity: "incident",
    recipients: [
      {
        recipientId: "reg-compliance-inbox",
        roleCode: "compliance_officer",
        channel: "email",
        label: "Regulatory compliance inbox",
      },
      {
        recipientId: "safety-ops-escalation",
        roleCode: "safety_manager",
        channel: "slack",
        label: "Safety operations escalation",
      },
    ],
    approverRoleCodes: ["compliance_manager", "safety_manager", "platform_admin"],
    deadlineMinutes: 24 * 60,
    reminderOffsetsMinutes: [12 * 60, 60],
  },
  injury_or_fatality: {
    severity: "injury_or_fatality",
    recipients: [
      {
        recipientId: "reg-compliance-inbox",
        roleCode: "compliance_officer",
        channel: "email",
        label: "Regulatory compliance inbox",
      },
      {
        recipientId: "safety-ops-hotline",
        roleCode: "safety_manager",
        channel: "pagerduty",
        label: "Safety hotline",
      },
      {
        recipientId: "legal-duty",
        roleCode: "legal_reviewer",
        channel: "email",
        label: "Legal on-duty reviewer",
      },
    ],
    approverRoleCodes: ["compliance_manager", "legal_reviewer", "platform_admin"],
    deadlineMinutes: 120,
    reminderOffsetsMinutes: [60, 15],
  },
  cybersecurity: {
    severity: "cybersecurity",
    recipients: [
      {
        recipientId: "security-incident-bridge",
        roleCode: "security_responder",
        channel: "pagerduty",
        label: "Security incident bridge",
      },
      {
        recipientId: "reg-compliance-inbox",
        roleCode: "compliance_officer",
        channel: "email",
        label: "Regulatory compliance inbox",
      },
    ],
    approverRoleCodes: ["security_manager", "compliance_manager", "platform_admin"],
    deadlineMinutes: 8 * 60,
    reminderOffsetsMinutes: [4 * 60, 60],
  },
};

function cloneReminder(
  reminder: RegulatoryNotificationReminder,
): RegulatoryNotificationReminder {
  return { ...reminder };
}

function clonePolicy(policy: RegulatoryNotificationPolicy): RegulatoryNotificationPolicy {
  return {
    ...policy,
    recipients: policy.recipients.map((recipient) => ({ ...recipient })),
    approverRoleCodes: [...policy.approverRoleCodes],
    reminderOffsetsMinutes: [...policy.reminderOffsetsMinutes],
  };
}

function cloneRecord(
  record: RegulatoryNotificationRecord,
): RegulatoryNotificationRecord {
  return {
    ...record,
    recipients: record.recipients.map((recipient) => ({ ...recipient })),
    approverRoleCodes: [...record.approverRoleCodes],
    policy: clonePolicy(record.policy),
    reminders: record.reminders.map(cloneReminder),
  };
}

@Injectable()
export class RegulatoryReportingService {
  private readonly logger = new Logger(RegulatoryReportingService.name);

  private readonly policyMatrix = new Map<
    RegulatoryNotificationSeverity,
    RegulatoryNotificationPolicy
  >(
    Object.entries(DEFAULT_REGULATORY_NOTIFICATION_POLICIES).map(
      ([severity, policy]) => [severity as RegulatoryNotificationSeverity, clonePolicy(policy)],
    ),
  );

  private notifications: RegulatoryNotificationRecord[] = [];

  private clock: NotificationClock = () => new Date();

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
  ) {}

  setClockForTests(clock: NotificationClock) {
    this.clock = clock;
  }

  listNotifications() {
    this.refreshDerivedState();
    return this.notifications.map(cloneRecord);
  }

  getNotification(notificationId: string) {
    this.refreshDerivedState();
    return cloneRecord(this.requireNotification(notificationId));
  }

  createNotification(
    command: CreateRegulatoryNotificationCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
    this.refreshDerivedState();
    const actor = this.requireActor(identity);
    const policy = this.getPolicy(command.severity);
    const now = this.nowIso();
    const eventOccurredAt = this.requireIsoDate(
      command.eventOccurredAt,
      "eventOccurredAt",
    );
    const deadlineAt = new Date(
      new Date(eventOccurredAt).getTime() + policy.deadlineMinutes * 60_000,
    ).toISOString();

    const notification: RegulatoryNotificationRecord = {
      notificationId: `regnotif-${randomUUID()}`,
      eventId: this.requireNonBlank(command.eventId, "eventId"),
      eventType: this.requireNonBlank(command.eventType, "eventType"),
      severity: command.severity,
      reportVersionKind: command.reportVersionKind,
      lifecycleStatus: "draft",
      jurisdiction: this.requireNonBlank(command.jurisdiction, "jurisdiction"),
      vehicleId: this.requireNonBlank(command.vehicleId, "vehicleId"),
      incidentId: this.normalizeNullableText(command.incidentId),
      reportId: this.normalizeNullableText(command.reportId),
      summary: this.requireNonBlank(command.summary, "summary"),
      details: this.normalizeNullableText(command.details),
      recipients: policy.recipients.map((recipient) => ({ ...recipient })),
      approverRoleCodes: [...policy.approverRoleCodes],
      policy,
      eventOccurredAt,
      reviewSubmittedAt: null,
      reviewSubmittedBy: null,
      reviewApprovedAt: null,
      reviewApprovedBy: null,
      submittedAt: null,
      submittedBy: null,
      submissionReference: null,
      acknowledgedAt: null,
      acknowledgedBy: null,
      acknowledgementReference: null,
      deadlineAt,
      overdue: false,
      overdueRaisedAt: null,
      reminders: this.buildReminders(deadlineAt, policy.reminderOffsetsMinutes),
      createdAt: now,
      updatedAt: now,
    };

    this.notifications = [notification, ...this.notifications];
    this.recordAudit(
      {
        actorId: actor.actorId,
        actorType: actor.actorType,
        moduleName: "regulatory-reporting",
        actionName: "create_regulatory_notification_draft",
        resourceId: notification.notificationId,
        newValuesSummary: {
          eventId: notification.eventId,
          severity: notification.severity,
          reportVersionKind: notification.reportVersionKind,
          deadlineAt: notification.deadlineAt,
          recipients: notification.recipients.map((recipient) => recipient.recipientId),
        },
      },
      requestId,
    );

    return cloneRecord(notification);
  }

  submitReview(
    notificationId: string,
    command: SubmitRegulatoryNotificationReviewCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
    this.refreshDerivedState();
    const actor = this.requireActor(identity);
    const notification = this.requireNotification(notificationId);
    if (notification.lifecycleStatus !== "draft") {
      throw this.conflict(
        "REGULATORY_NOTIFICATION_REVIEW_INVALID",
        "Only draft notifications can be submitted for review.",
      );
    }

    const now = this.nowIso();
    notification.lifecycleStatus = "review_pending";
    notification.reviewSubmittedAt = now;
    notification.reviewSubmittedBy = actor.actorId;
    notification.updatedAt = now;

    this.recordAudit(
      {
        actorId: actor.actorId,
        actorType: actor.actorType,
        moduleName: "regulatory-reporting",
        actionName: "submit_regulatory_notification_review",
        resourceId: notification.notificationId,
        newValuesSummary: {
          note: this.normalizeNullableText(command.note),
          severity: notification.severity,
          deadlineAt: notification.deadlineAt,
        },
      },
      requestId,
    );

    return cloneRecord(notification);
  }

  approveReview(
    notificationId: string,
    command: ApproveRegulatoryNotificationCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
    this.refreshDerivedState();
    const actor = this.requireActor(identity);
    const notification = this.requireNotification(notificationId);
    if (notification.lifecycleStatus !== "review_pending") {
      throw this.conflict(
        "REGULATORY_NOTIFICATION_APPROVAL_INVALID",
        "Only review-pending notifications can be approved.",
      );
    }
    if (notification.reviewSubmittedBy === actor.actorId) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "REGULATORY_NOTIFICATION_SELF_APPROVAL_FORBIDDEN",
        "The submitting actor cannot approve the same regulatory notification.",
        {
          notificationId,
          actorId: actor.actorId,
        },
      );
    }

    const actorRoles = new Set(actor.roles);
    const canApprove =
      actor.roleFamilies.includes("platform") ||
      notification.approverRoleCodes.some((roleCode) => actorRoles.has(roleCode));
    if (!canApprove) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "REGULATORY_NOTIFICATION_APPROVAL_FORBIDDEN",
        "The actor does not hold an approval role for this notification severity.",
        {
          notificationId,
          requiredRoleCodes: notification.approverRoleCodes,
        },
      );
    }

    const now = this.nowIso();
    notification.lifecycleStatus = "review_approved";
    notification.reviewApprovedAt = now;
    notification.reviewApprovedBy = actor.actorId;
    notification.updatedAt = now;

    this.recordAudit(
      {
        actorId: actor.actorId,
        actorType: actor.actorType,
        moduleName: "regulatory-reporting",
        actionName: "approve_regulatory_notification_review",
        resourceId: notification.notificationId,
        newValuesSummary: {
          note: this.normalizeNullableText(command.note),
          approverRoleCodes: notification.approverRoleCodes,
        },
      },
      requestId,
    );

    return cloneRecord(notification);
  }

  submitNotification(
    notificationId: string,
    command: SubmitRegulatoryNotificationCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
    this.refreshDerivedState();
    const actor = this.requireActor(identity);
    const notification = this.requireNotification(notificationId);
    if (notification.lifecycleStatus !== "review_approved") {
      throw this.conflict(
        "REGULATORY_NOTIFICATION_SUBMIT_INVALID",
        "Only review-approved notifications can be submitted.",
      );
    }

    const submittedAt = command.submittedAt
      ? this.requireIsoDate(command.submittedAt, "submittedAt")
      : this.nowIso();
    notification.lifecycleStatus = "submitted";
    notification.submittedAt = submittedAt;
    notification.submittedBy = actor.actorId;
    notification.submissionReference = this.requireNonBlank(
      command.submissionReference,
      "submissionReference",
    );
    notification.overdue = submittedAt > notification.deadlineAt;
    notification.updatedAt = this.nowIso();

    this.recordAudit(
      {
        actorId: actor.actorId,
        actorType: actor.actorType,
        moduleName: "regulatory-reporting",
        actionName: "submit_regulatory_notification",
        resourceId: notification.notificationId,
        newValuesSummary: {
          submissionReference: notification.submissionReference,
          submittedAt,
          overdue: notification.overdue,
          note: this.normalizeNullableText(command.note),
        },
      },
      requestId,
    );

    return cloneRecord(notification);
  }

  acknowledgeNotification(
    notificationId: string,
    command: AcknowledgeRegulatoryNotificationCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
    this.refreshDerivedState();
    const actor = this.requireActor(identity);
    const notification = this.requireNotification(notificationId);
    if (
      notification.lifecycleStatus !== "submitted" &&
      notification.lifecycleStatus !== "acknowledged"
    ) {
      throw this.conflict(
        "REGULATORY_NOTIFICATION_ACKNOWLEDGE_INVALID",
        "Only submitted notifications can be acknowledged.",
      );
    }

    const acknowledgedAt = command.acknowledgedAt
      ? this.requireIsoDate(command.acknowledgedAt, "acknowledgedAt")
      : this.nowIso();
    notification.lifecycleStatus = "acknowledged";
    notification.acknowledgedAt = acknowledgedAt;
    notification.acknowledgedBy = actor.actorId;
    notification.acknowledgementReference = this.requireNonBlank(
      command.acknowledgementReference,
      "acknowledgementReference",
    );
    notification.updatedAt = this.nowIso();

    this.recordAudit(
      {
        actorId: actor.actorId,
        actorType: actor.actorType,
        moduleName: "regulatory-reporting",
        actionName: "acknowledge_regulatory_notification",
        resourceId: notification.notificationId,
        newValuesSummary: {
          acknowledgementReference: notification.acknowledgementReference,
          acknowledgedAt,
          note: this.normalizeNullableText(command.note),
        },
      },
      requestId,
    );

    return cloneRecord(notification);
  }

  private refreshDerivedState() {
    const now = this.nowIso();
    for (const notification of this.notifications) {
      for (const reminder of notification.reminders) {
        if (reminder.sentAt || reminder.dueAt > now) {
          continue;
        }
        reminder.sentAt = now;
        this.auditNotificationService.recordNotification({
          tenantId: null,
          recipientUserId: null,
          channel: "ops_notice",
          title: "Regulatory notification reminder",
          message: `${notification.notificationId} is due by ${notification.deadlineAt}.`,
          status: "unread",
        });
        this.recordAudit({
          actorId: null,
          actorType: "system",
          moduleName: "regulatory-reporting",
          actionName: "regulatory_notification_reminder_sent",
          resourceId: notification.notificationId,
          newValuesSummary: {
            dueAt: reminder.dueAt,
            minutesBeforeDeadline: reminder.minutesBeforeDeadline,
          },
        });
      }

      const shouldBeOverdue =
        notification.submittedAt === null && now > notification.deadlineAt;
      notification.overdue = shouldBeOverdue;
      if (shouldBeOverdue && notification.overdueRaisedAt === null) {
        notification.overdueRaisedAt = now;
        this.auditNotificationService.recordNotification({
          tenantId: null,
          recipientUserId: null,
          channel: "ops_notice",
          title: "REGULATORY_NOTIFICATION_OVERDUE",
          message: `${notification.notificationId} missed its policy deadline at ${notification.deadlineAt}.`,
          status: "unread",
        });
        this.recordAudit({
          actorId: null,
          actorType: "system",
          moduleName: "regulatory-reporting",
          actionName: "REGULATORY_NOTIFICATION_OVERDUE",
          resourceId: notification.notificationId,
          newValuesSummary: {
            deadlineAt: notification.deadlineAt,
            severity: notification.severity,
          },
        });
      }
    }
  }

  private buildReminders(
    deadlineAt: string,
    reminderOffsetsMinutes: readonly number[],
  ) {
    const deadlineMillis = new Date(deadlineAt).getTime();
    return [...new Set(reminderOffsetsMinutes)]
      .sort((left, right) => right - left)
      .map<RegulatoryNotificationReminder>((minutesBeforeDeadline) => ({
        minutesBeforeDeadline,
        dueAt: new Date(deadlineMillis - minutesBeforeDeadline * 60_000).toISOString(),
        sentAt: null,
      }));
  }

  private getPolicy(severity: RegulatoryNotificationSeverity) {
    const policy = this.policyMatrix.get(severity);
    if (!policy) {
      throw new Error(`Missing policy matrix entry for ${severity}`);
    }
    return clonePolicy(policy);
  }

  private requireNotification(notificationId: string) {
    const notification = this.notifications.find(
      (candidate) => candidate.notificationId === notificationId,
    );
    if (!notification) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "REGULATORY_NOTIFICATION_NOT_FOUND",
        "Regulatory notification was not found.",
        { notificationId },
      );
    }
    return notification;
  }

  private requireActor(identity: BootstrapRequestIdentity | null): RegulatoryActionActor {
    if (!identity?.actorId) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "AUTH_ACTOR_REQUIRED",
        "An authenticated actor is required for regulatory notification actions.",
      );
    }
    if (identity.actorType === "driver_user") {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "REGULATORY_NOTIFICATION_ACTOR_FORBIDDEN",
        "Driver actors cannot manage regulatory notifications.",
      );
    }
    return {
      ...identity,
      actorId: identity.actorId,
      actorType: identity.actorType as RegulatoryActionActor["actorType"],
    };
  }

  private recordAudit(
    input: {
      actorId: string | null;
      actorType:
        | "system"
        | "platform_admin"
        | "tenant_admin"
        | "ops_user"
        | "partner_api_key"
        | "referral_passenger";
      moduleName: string;
      actionName: string;
      resourceId: string | null;
      newValuesSummary: Record<string, unknown>;
    },
    requestId?: string,
  ) {
    this.auditNotificationService.recordAuditLog({
      actorId: input.actorId,
      actorType: input.actorType,
      tenantId: null,
      moduleName: input.moduleName,
      actionName: input.actionName,
      resourceType: "regulatory_notification",
      resourceId: input.resourceId,
      newValuesSummary: input.newValuesSummary,
      ...(requestId ? { requestId } : {}),
    });
  }

  private nowIso() {
    return this.clock().toISOString();
  }

  private requireNonBlank(value: string, field: string) {
    const normalized = value.trim();
    if (!normalized) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${field} is required.`,
        { field },
      );
    }
    return normalized;
  }

  private requireIsoDate(value: string, field: string) {
    const normalized = this.requireNonBlank(value, field);
    if (Number.isNaN(Date.parse(normalized))) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${field} must be a valid ISO-8601 timestamp.`,
        { field },
      );
    }
    return new Date(normalized).toISOString();
  }

  private normalizeNullableText(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private conflict(code: string, message: string) {
    return new ApiRequestError(HttpStatus.CONFLICT, code, message);
  }
}
