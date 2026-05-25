import { randomUUID } from "node:crypto";

import { Injectable, Logger, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  CreateEvidenceDeletionExceptionCommand,
  CreateEvidenceLegalHoldCommand,
  EvidenceDeletionExceptionRecord,
  EvidenceDeletionExceptionStatus,
  EvidenceLegalHoldRecord,
  EvidenceRetentionFamily,
  EvidenceSubjectGovernanceRecord,
  IdentityContext,
  MarkNotificationsReadCommand,
  NotificationRecord,
  ReleaseEvidenceLegalHoldCommand,
  ResolveEvidenceDeletionExceptionCommand,
} from "@drts/contracts";
import {
  EVIDENCE_DELETION_EXCEPTION_REASON_CODES,
  EVIDENCE_LEGAL_HOLD_REASON_CODES,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import {
  assertEvidenceAccess,
  buildEvidenceAccessAuditSummary,
  type EvidenceAccessIdentity,
  getEvidenceGovernanceCatalog,
  getEvidenceRetentionPolicy,
} from "../../common/evidence-governance";
import { maskEmail } from "../../common/sensitive-data-policy";
import {
  BOOTSTRAP_AUDIT_LOG,
  cloneAuditLog,
  createAuditLogRecord,
} from "./audit-log.persistence";
import {
  AuditNotificationEmailAdapter,
  type AuditNotificationEmailDeliveryRecord,
} from "./audit-notification.email-adapter";
import { AuditLogRepository } from "./audit-log.repository";
import {
  renderApprovalNotificationTemplate,
  type ApprovalNotificationTemplateKey,
} from "./templates/approval-notification.templates";
import { NotificationService } from "../notification/notification.service";

const MAX_IN_MEMORY_AUDIT_LOGS = 1000;

type OperationalIdentity = Pick<
  IdentityContext,
  "actorId" | "actorType" | "realm" | "scopes" | "tenantId"
>;

export type ApprovalNotificationRecipient = {
  userId: string;
  email: string;
  displayName: string | null;
  approvalNotificationOptOut: boolean;
};

function trimAuditLogs(auditLogs: AuditLogRecord[]) {
  return auditLogs.length <= MAX_IN_MEMORY_AUDIT_LOGS
    ? auditLogs
    : auditLogs.slice(0, MAX_IN_MEMORY_AUDIT_LOGS);
}

function cloneEvidenceLegalHold(
  hold: EvidenceLegalHoldRecord,
): EvidenceLegalHoldRecord {
  return { ...hold };
}

function cloneEvidenceDeletionException(
  exception: EvidenceDeletionExceptionRecord,
): EvidenceDeletionExceptionRecord {
  return { ...exception };
}

@Injectable()
export class AuditNotificationService implements OnModuleInit {
  private readonly logger = new Logger(AuditNotificationService.name);

  private notifications: NotificationRecord[] = [
    {
      notificationId: "notif-tenant-sla-001",
      tenantId: "tenant-demo-001",
      recipientUserId: null,
      channel: "tenant_sla",
      title: "Reservation window approaching",
      message: "Enterprise dispatch booking needs pre-assignment review.",
      status: "unread",
      createdAt: "2026-04-10T00:00:00.000Z",
      readAt: null,
    },
    {
      notificationId: "notif-ops-notice-001",
      tenantId: null,
      recipientUserId: null,
      channel: "ops_notice",
      title: "Foundation bootstrap running",
      message:
        "Wave 1 foundation modules are scaffolded for Phase 1 execution.",
      status: "unread",
      createdAt: "2026-04-10T00:05:00.000Z",
      readAt: null,
    },
  ];

  private auditLogs: AuditLogRecord[] = trimAuditLogs([
    cloneAuditLog(BOOTSTRAP_AUDIT_LOG),
  ]);

  private evidenceLegalHolds = new Map<string, EvidenceLegalHoldRecord>();

  private evidenceDeletionExceptions = new Map<
    string,
    EvidenceDeletionExceptionRecord
  >();

  constructor(
    @Optional() private readonly auditLogRepository?: AuditLogRepository,
    @Optional()
    private readonly auditNotificationEmailAdapter: AuditNotificationEmailAdapter = new AuditNotificationEmailAdapter(),
    @Optional()
    private readonly notificationService: NotificationService = new NotificationService(),
  ) {
    this.rebuildEvidenceGovernanceState(this.auditLogs);
  }

  async onModuleInit() {
    if (!this.auditLogRepository) {
      return;
    }

    try {
      const [recentAuditLogs, governanceTrail] = await Promise.all([
        this.auditLogRepository.loadRecent(MAX_IN_MEMORY_AUDIT_LOGS),
        this.auditLogRepository.loadEvidenceGovernanceTrail(),
      ]);
      this.auditLogs = trimAuditLogs(recentAuditLogs);
      this.rebuildEvidenceGovernanceState(governanceTrail);
    } catch (error) {
      this.auditLogRepository.reportPersistenceFailure(error, "module init");
      this.auditLogs = trimAuditLogs([cloneAuditLog(BOOTSTRAP_AUDIT_LOG)]);
      this.rebuildEvidenceGovernanceState(this.auditLogs);
    }
  }

  listNotifications() {
    return this.notifications.map((notification) => ({ ...notification }));
  }

  listUserNotifications(identity?: IdentityContext | null) {
    return this.notificationService.listNotifications(identity);
  }

  listEmailDeliveries() {
    return this.auditNotificationEmailAdapter.listDeliveries();
  }

  hasApprovalNotificationDispatch(
    approvalRequestId: string,
    templateKey: ApprovalNotificationTemplateKey,
  ) {
    return this.auditLogs.some(
      (auditLog) =>
        auditLog.moduleName === "audit-notification" &&
        auditLog.actionName === `approval_notification.${templateKey}` &&
        auditLog.resourceType === "tenant_approval_request" &&
        auditLog.resourceId === approvalRequestId,
    );
  }

  async dispatchApprovalNotification(input: {
    templateKey: ApprovalNotificationTemplateKey;
    tenantId: string;
    approvalRequestId: string;
    bookingId: string;
    orderId: string;
    timeoutAt: string;
    recipients: readonly ApprovalNotificationRecipient[];
    requestId?: string;
    escalatedAt?: string | null;
    decidedAt?: string | null;
    actorUserId?: string | null;
    reasonCode?: string | null;
    reasonNote?: string | null;
  }) {
    if (
      this.hasApprovalNotificationDispatch(
        input.approvalRequestId,
        input.templateKey,
      )
    ) {
      return {
        deduplicated: true,
        deliveredToUserIds: [] as string[],
        skippedUserIds: [] as string[],
      };
    }

    const recipients = new Map<string, ApprovalNotificationRecipient>();
    for (const recipient of input.recipients) {
      const userId = recipient.userId.trim();
      if (!userId || recipients.has(userId)) {
        continue;
      }
      recipients.set(userId, {
        ...recipient,
        userId,
        email: recipient.email.trim().toLowerCase(),
      });
    }

    const deliveredToUserIds: string[] = [];
    const skippedUserIds: string[] = [];
    const skippedEmails: string[] = [];
    const emailDeliveries: AuditNotificationEmailDeliveryRecord[] = [];

    for (const recipient of recipients.values()) {
      if (recipient.approvalNotificationOptOut || !recipient.email) {
        skippedUserIds.push(recipient.userId);
        if (recipient.email) {
          const maskedEmail = maskEmail(recipient.email);
          if (maskedEmail) {
            skippedEmails.push(maskedEmail);
          }
        }
        continue;
      }

      const context = {
        recipientDisplayName: recipient.displayName,
        bookingId: input.bookingId,
        orderId: input.orderId,
        approvalRequestId: input.approvalRequestId,
        timeoutAt: input.timeoutAt,
        escalatedAt: input.escalatedAt ?? null,
        decidedAt: input.decidedAt ?? null,
        actorUserId: input.actorUserId ?? null,
        reasonCode: input.reasonCode ?? null,
        reasonNote: input.reasonNote ?? null,
      };
      const zh = renderApprovalNotificationTemplate(
        input.templateKey,
        "zh",
        context,
      );
      const en = renderApprovalNotificationTemplate(
        input.templateKey,
        "en",
        context,
      );

      const emailDelivery = await this.auditNotificationEmailAdapter.send({
        tenantId: input.tenantId,
        recipientUserId: recipient.userId,
        recipientEmail: recipient.email,
        templateKey: input.templateKey,
        subject: `${zh.subject} / ${en.subject}`,
        body: [zh.body, "", "---", "", en.body].join("\n"),
        ...(input.requestId ? { requestId: input.requestId } : {}),
      });
      emailDeliveries.push(emailDelivery);
      deliveredToUserIds.push(recipient.userId);

      this.recordNotification({
        tenantId: input.tenantId,
        recipientUserId: recipient.userId,
        channel: "tenant_approval",
        title: zh.title,
        message: `${zh.message}\n${en.message}`,
        status: "unread",
      });
      this.notificationService.emit({
        recipientActorId: recipient.userId,
        recipientRealm: "tenant",
        tenantId: input.tenantId,
        severity:
          input.templateKey === "approaching_timeout" ||
          input.templateKey === "escalated"
            ? "warning"
            : "info",
        eventType: this.toApprovalUserNotificationEventType(input.templateKey),
        title: zh.title,
        message: `${zh.message}\n${en.message}`,
      });
    }

    this.recordAuditLog({
      actorId: input.actorUserId ?? null,
      actorType: input.actorUserId ? "tenant_admin" : "system",
      tenantId: input.tenantId,
      moduleName: "audit-notification",
      actionName: `approval_notification.${input.templateKey}`,
      resourceType: "tenant_approval_request",
      resourceId: input.approvalRequestId,
      newValuesSummary: {
        bookingId: input.bookingId,
        orderId: input.orderId,
        timeoutAt: input.timeoutAt,
        templateKey: input.templateKey,
        deliveredToUserIds,
        skippedUserIds,
        skippedEmails,
        channelCounts: {
          email: emailDeliveries.length,
          inApp: deliveredToUserIds.length,
        },
      },
      ...(input.requestId ? { requestId: input.requestId } : {}),
    });

    return {
      deduplicated: false,
      deliveredToUserIds,
      skippedUserIds,
    };
  }

  listAuditLogs(identity?: EvidenceAccessIdentity | null, requestId?: string) {
    const policy = assertEvidenceAccess({
      family: "audit_log",
      identity,
      tenantId: identity?.realm === "tenant" ? identity.tenantId : null,
    });
    const items =
      identity?.realm === "tenant" && identity.tenantId
        ? this.auditLogs.filter(
            (auditLog) => auditLog.tenantId === identity.tenantId,
          )
        : this.auditLogs;

    const accessAudit: Omit<
      AuditLogRecord,
      "auditId" | "createdAt" | "requestId"
    > & {
      requestId?: string;
    } = {
      actorId: identity?.actorId ?? null,
      actorType:
        (identity?.actorType as AuditLogRecord["actorType"] | undefined) ??
        "system",
      tenantId: identity?.tenantId ?? null,
      moduleName: "audit-notification",
      actionName: policy.auditAction,
      resourceType: "audit_log",
      resourceId: null,
      newValuesSummary: buildEvidenceAccessAuditSummary(policy, "list", {
        itemCount: items.length,
        tenantScoped: identity?.realm === "tenant",
      }),
    };
    if (requestId) {
      accessAudit.requestId = requestId;
    }
    this.recordAuditLog(accessAudit);

    return items.map((auditLog) => cloneAuditLog(auditLog));
  }

  getAuditLogsSnapshot() {
    return this.auditLogs.map((auditLog) => cloneAuditLog(auditLog));
  }

  getEvidenceGovernanceCatalog() {
    return getEvidenceGovernanceCatalog();
  }

  getEvidenceRetentionPolicy(family: EvidenceRetentionFamily) {
    return getEvidenceRetentionPolicy(family);
  }

  listEvidenceLegalHolds() {
    return [...this.evidenceLegalHolds.values()]
      .map((hold) => cloneEvidenceLegalHold(hold))
      .sort((left, right) => right.placedAt.localeCompare(left.placedAt));
  }

  placeEvidenceLegalHold(
    command: CreateEvidenceLegalHoldCommand,
    identity: OperationalIdentity | null,
    requestId?: string,
  ) {
    const actor = this.requireOperationalIdentity(identity);
    const policy = getEvidenceRetentionPolicy(command.family);
    this.assertLegalHoldPlacementAllowed(policy.family, actor);

    const subjectId = this.requireNonBlank(command.subjectId, "subjectId");
    const caseNumber = this.requireNonBlank(command.caseNumber, "caseNumber");
    const reasonCode = this.requireReasonCode(
      command.reasonCode,
      EVIDENCE_LEGAL_HOLD_REASON_CODES,
      "reasonCode",
    );
    const manifestHash = this.normalizeOptional(command.manifestHash);
    const tenantId = this.normalizeOptional(command.tenantId);
    const reasonNote = this.normalizeOptional(command.reasonNote);

    const duplicate = [...this.evidenceLegalHolds.values()].find(
      (hold) =>
        hold.family === policy.family &&
        hold.subjectId === subjectId &&
        hold.caseNumber === caseNumber &&
        hold.status === "active",
    );
    if (duplicate) {
      throw new ApiRequestError(
        409,
        "EVIDENCE_LEGAL_HOLD_ALREADY_ACTIVE",
        "An active legal hold already exists for this evidence subject and case number.",
        {
          family: policy.family,
          subjectId,
          caseNumber,
          holdId: duplicate.holdId,
        },
      );
    }

    const holdRecord: EvidenceLegalHoldRecord = {
      holdId: `hold-${randomUUID()}`,
      family: policy.family,
      subjectId,
      caseNumber,
      reasonCode,
      reasonNote,
      tenantId,
      manifestHash,
      status: "active",
      placedByActorId: actor.actorId,
      placedByActorType: actor.actorType,
      placedAt: new Date().toISOString(),
      releasedByActorId: null,
      releasedByActorType: null,
      releasedAt: null,
      releaseReason: null,
    };

    this.recordAuditLog({
      actorId: actor.actorId,
      actorType: actor.actorType as AuditLogRecord["actorType"],
      tenantId,
      moduleName: "audit-notification",
      actionName: "place_evidence_legal_hold",
      resourceType: "evidence_legal_hold",
      resourceId: holdRecord.holdId,
      newValuesSummary: { ...holdRecord },
      ...(requestId !== undefined ? { requestId } : {}),
    });

    return cloneEvidenceLegalHold(holdRecord);
  }

  releaseEvidenceLegalHold(
    holdId: string,
    command: ReleaseEvidenceLegalHoldCommand,
    identity: OperationalIdentity | null,
    requestId?: string,
  ) {
    const actor = this.requireOperationalIdentity(identity);
    const normalizedHoldId = this.requireNonBlank(holdId, "holdId");
    const existing = this.evidenceLegalHolds.get(normalizedHoldId);
    if (!existing) {
      throw new ApiRequestError(
        404,
        "EVIDENCE_LEGAL_HOLD_NOT_FOUND",
        "The requested evidence legal hold could not be found.",
        { holdId: normalizedHoldId },
      );
    }
    this.assertLegalHoldReleaseAllowed(existing.family, actor);
    if (existing.status !== "active") {
      throw new ApiRequestError(
        409,
        "EVIDENCE_LEGAL_HOLD_ALREADY_RELEASED",
        "The evidence legal hold is no longer active.",
        { holdId: normalizedHoldId, status: existing.status },
      );
    }

    const updated: EvidenceLegalHoldRecord = {
      ...existing,
      status: "released",
      releasedByActorId: actor.actorId,
      releasedByActorType: actor.actorType,
      releasedAt: new Date().toISOString(),
      releaseReason: this.requireNonBlank(
        command.releaseReason,
        "releaseReason",
      ),
    };

    this.recordAuditLog({
      actorId: actor.actorId,
      actorType: actor.actorType as AuditLogRecord["actorType"],
      tenantId: updated.tenantId,
      moduleName: "audit-notification",
      actionName: "release_evidence_legal_hold",
      resourceType: "evidence_legal_hold",
      resourceId: updated.holdId,
      oldValuesSummary: { ...existing },
      newValuesSummary: { ...updated },
      ...(requestId !== undefined ? { requestId } : {}),
    });

    return cloneEvidenceLegalHold(updated);
  }

  listEvidenceDeletionExceptions() {
    return [...this.evidenceDeletionExceptions.values()]
      .map((exception) =>
        cloneEvidenceDeletionException(
          this.withEffectiveDeletionExceptionStatus(exception),
        ),
      )
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
  }

  registerEvidenceDeletionException(
    command: CreateEvidenceDeletionExceptionCommand,
    identity: OperationalIdentity | null,
    requestId?: string,
  ) {
    const actor = this.requireOperationalIdentity(identity);
    const policy = getEvidenceRetentionPolicy(command.family);
    this.assertLegalHoldPlacementAllowed(policy.family, actor);

    const subjectId = this.requireNonBlank(command.subjectId, "subjectId");
    const sourceResourceType = this.requireNonBlank(
      command.sourceResourceType,
      "sourceResourceType",
    );
    const sourceResourceId = this.requireNonBlank(
      command.sourceResourceId,
      "sourceResourceId",
    );
    const reviewerActorId = this.requireNonBlank(
      command.reviewerActorId,
      "reviewerActorId",
    );
    const expiresAt = this.requireFutureIso(command.expiresAt, "expiresAt");
    const reasonCode = this.requireReasonCode(
      command.reasonCode,
      EVIDENCE_DELETION_EXCEPTION_REASON_CODES,
      "reasonCode",
    );
    const manifestHash = this.normalizeOptional(command.manifestHash);
    const tenantId = this.normalizeOptional(command.tenantId);
    const reasonNote = this.normalizeOptional(command.reasonNote);

    const duplicate = [...this.evidenceDeletionExceptions.values()].find(
      (exception) =>
        exception.family === policy.family &&
        exception.subjectId === subjectId &&
        this.withEffectiveDeletionExceptionStatus(exception).status ===
          "active",
    );
    if (duplicate) {
      throw new ApiRequestError(
        409,
        "EVIDENCE_DELETION_EXCEPTION_ALREADY_ACTIVE",
        "An active deletion exception already exists for this evidence subject.",
        {
          family: policy.family,
          subjectId,
          exceptionId: duplicate.exceptionId,
        },
      );
    }

    const exceptionRecord: EvidenceDeletionExceptionRecord = {
      exceptionId: `delex-${randomUUID()}`,
      family: policy.family,
      subjectId,
      sourceResourceType,
      sourceResourceId,
      reviewerActorId,
      reviewerActorType: command.reviewerActorType ?? null,
      expiresAt,
      reasonCode,
      reasonNote,
      tenantId,
      manifestHash,
      status: "active",
      requestedByActorId: actor.actorId,
      requestedByActorType: actor.actorType,
      requestedAt: new Date().toISOString(),
      resolvedByActorId: null,
      resolvedByActorType: null,
      resolvedAt: null,
      resolutionNote: null,
    };

    this.recordAuditLog({
      actorId: actor.actorId,
      actorType: actor.actorType as AuditLogRecord["actorType"],
      tenantId,
      moduleName: "audit-notification",
      actionName: "register_evidence_deletion_exception",
      resourceType: "evidence_deletion_exception",
      resourceId: exceptionRecord.exceptionId,
      newValuesSummary: { ...exceptionRecord },
      ...(requestId !== undefined ? { requestId } : {}),
    });

    return cloneEvidenceDeletionException(exceptionRecord);
  }

  resolveEvidenceDeletionException(
    exceptionId: string,
    command: ResolveEvidenceDeletionExceptionCommand,
    identity: OperationalIdentity | null,
    requestId?: string,
  ) {
    const actor = this.requireOperationalIdentity(identity);
    const normalizedExceptionId = this.requireNonBlank(
      exceptionId,
      "exceptionId",
    );
    const existing = this.evidenceDeletionExceptions.get(normalizedExceptionId);
    if (!existing) {
      throw new ApiRequestError(
        404,
        "EVIDENCE_DELETION_EXCEPTION_NOT_FOUND",
        "The requested evidence deletion exception could not be found.",
        { exceptionId: normalizedExceptionId },
      );
    }
    this.assertLegalHoldPlacementAllowed(existing.family, actor);
    const effectiveExisting =
      this.withEffectiveDeletionExceptionStatus(existing);
    if (effectiveExisting.status !== "active") {
      throw new ApiRequestError(
        409,
        "EVIDENCE_DELETION_EXCEPTION_NOT_ACTIVE",
        "The evidence deletion exception is no longer active.",
        {
          exceptionId: normalizedExceptionId,
          status: effectiveExisting.status,
        },
      );
    }

    const updated: EvidenceDeletionExceptionRecord = {
      ...existing,
      status: "resolved",
      resolvedByActorId: actor.actorId,
      resolvedByActorType: actor.actorType,
      resolvedAt: new Date().toISOString(),
      resolutionNote: this.requireNonBlank(
        command.resolutionNote,
        "resolutionNote",
      ),
    };

    this.recordAuditLog({
      actorId: actor.actorId,
      actorType: actor.actorType as AuditLogRecord["actorType"],
      tenantId: updated.tenantId,
      moduleName: "audit-notification",
      actionName: "resolve_evidence_deletion_exception",
      resourceType: "evidence_deletion_exception",
      resourceId: updated.exceptionId,
      oldValuesSummary: { ...effectiveExisting },
      newValuesSummary: { ...updated },
      ...(requestId !== undefined ? { requestId } : {}),
    });

    return cloneEvidenceDeletionException(updated);
  }

  getEvidenceSubjectGovernance(
    family: EvidenceRetentionFamily,
    subjectId: string,
    options?: {
      tenantId?: string | null;
      manifestHash?: string | null;
    },
  ): EvidenceSubjectGovernanceRecord {
    const tenantId = this.normalizeOptional(options?.tenantId);
    const manifestHash = this.normalizeOptional(options?.manifestHash);
    const activeLegalHolds = [...this.evidenceLegalHolds.values()]
      .filter(
        (hold) =>
          hold.family === family &&
          hold.subjectId === subjectId &&
          (!tenantId || hold.tenantId === tenantId) &&
          (!manifestHash || hold.manifestHash === manifestHash) &&
          hold.status === "active",
      )
      .map((hold) => cloneEvidenceLegalHold(hold));
    const activeDeletionExceptions = [
      ...this.evidenceDeletionExceptions.values(),
    ]
      .map((exception) => this.withEffectiveDeletionExceptionStatus(exception))
      .filter(
        (exception) =>
          exception.family === family &&
          exception.subjectId === subjectId &&
          (!tenantId || exception.tenantId === tenantId) &&
          (!manifestHash || exception.manifestHash === manifestHash) &&
          exception.status === "active",
      )
      .map((exception) => cloneEvidenceDeletionException(exception));

    return {
      family,
      subjectId,
      tenantId,
      manifestHash,
      activeLegalHolds,
      activeDeletionExceptions,
      deletionSuppressed:
        activeLegalHolds.length > 0 || activeDeletionExceptions.length > 0,
    };
  }

  recordNotification(
    input: Omit<
      NotificationRecord,
      "notificationId" | "createdAt" | "readAt" | "recipientUserId"
    > & {
      recipientUserId?: string | null;
    },
  ) {
    const notification: NotificationRecord = {
      ...input,
      recipientUserId: input.recipientUserId ?? null,
      notificationId: `notif-${randomUUID()}`,
      createdAt: new Date().toISOString(),
      readAt: null,
    };
    this.notifications = [notification, ...this.notifications];
    return notification;
  }

  recordAuditLog(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId"> & {
      requestId?: string;
    },
  ) {
    const auditLog = this.appendAuditLog(input);
    this.applyEvidenceGovernanceLog(auditLog);
    return auditLog;
  }

  markNotificationsRead(
    command: MarkNotificationsReadCommand,
    requestId?: string,
  ) {
    const notificationIds = new Set(command.notificationIds);
    const readAt = new Date().toISOString();
    let updated = 0;

    this.notifications = this.notifications.map((notification) => {
      if (!notificationIds.has(notification.notificationId)) {
        return notification;
      }
      if (notification.readAt !== null) {
        return notification;
      }
      updated += 1;
      return {
        ...notification,
        status: "read",
        readAt,
      };
    });

    if (updated > 0) {
      const auditLogInput: Omit<
        AuditLogRecord,
        "auditId" | "createdAt" | "requestId"
      > & {
        requestId?: string;
      } = {
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "audit-notification",
        actionName: "mark_notifications_read",
        resourceType: "notification_batch",
        resourceId: null,
        newValuesSummary: {
          notificationIds: [...notificationIds],
          updated,
        },
      };
      if (requestId) {
        auditLogInput.requestId = requestId;
      }
      this.recordAuditLog(auditLogInput);
    }

    return {
      updated,
    };
  }

  emitUserNotification(input: Parameters<NotificationService["emit"]>[0]) {
    return this.notificationService.emit(input);
  }

  private appendAuditLog(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId"> & {
      requestId?: string;
    },
  ) {
    const auditLog = createAuditLogRecord(input);
    this.auditLogs = trimAuditLogs([auditLog, ...this.auditLogs]);
    this.persistAuditLog(auditLog);
    return auditLog;
  }

  private toApprovalUserNotificationEventType(
    templateKey: ApprovalNotificationTemplateKey,
  ) {
    switch (templateKey) {
      case "new_request":
        return "approval_request.created";
      case "approaching_timeout":
        return "approval_request.timeout_warning";
      case "escalated":
        return "approval_request.escalated";
      case "approved":
        return "booking.approval_approved";
      case "rejected":
        return "booking.approval_rejected";
    }
  }

  private rebuildEvidenceGovernanceState(trail: AuditLogRecord[]) {
    this.evidenceLegalHolds.clear();
    this.evidenceDeletionExceptions.clear();
    for (const auditLog of [...trail].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    )) {
      this.applyEvidenceGovernanceLog(auditLog);
    }
  }

  private applyEvidenceGovernanceLog(auditLog: AuditLogRecord) {
    if (auditLog.resourceType === "evidence_legal_hold") {
      const hold = this.parseEvidenceLegalHold(auditLog.newValuesSummary);
      if (hold) {
        this.evidenceLegalHolds.set(hold.holdId, hold);
      }
      return;
    }

    if (auditLog.resourceType === "evidence_deletion_exception") {
      const exception = this.parseEvidenceDeletionException(
        auditLog.newValuesSummary,
      );
      if (exception) {
        this.evidenceDeletionExceptions.set(exception.exceptionId, exception);
      }
    }
  }

  private parseEvidenceLegalHold(
    payload: Record<string, unknown> | undefined,
  ): EvidenceLegalHoldRecord | null {
    if (!payload || typeof payload !== "object") {
      return null;
    }
    if (
      typeof payload.holdId !== "string" ||
      typeof payload.family !== "string" ||
      typeof payload.subjectId !== "string" ||
      typeof payload.caseNumber !== "string" ||
      typeof payload.reasonCode !== "string" ||
      typeof payload.status !== "string" ||
      typeof payload.placedByActorId !== "string" ||
      typeof payload.placedByActorType !== "string" ||
      typeof payload.placedAt !== "string"
    ) {
      return null;
    }
    return payload as unknown as EvidenceLegalHoldRecord;
  }

  private parseEvidenceDeletionException(
    payload: Record<string, unknown> | undefined,
  ): EvidenceDeletionExceptionRecord | null {
    if (!payload || typeof payload !== "object") {
      return null;
    }
    if (
      typeof payload.exceptionId !== "string" ||
      typeof payload.family !== "string" ||
      typeof payload.subjectId !== "string" ||
      typeof payload.sourceResourceType !== "string" ||
      typeof payload.sourceResourceId !== "string" ||
      typeof payload.reviewerActorId !== "string" ||
      typeof payload.expiresAt !== "string" ||
      typeof payload.reasonCode !== "string" ||
      typeof payload.status !== "string" ||
      typeof payload.requestedByActorId !== "string" ||
      typeof payload.requestedByActorType !== "string" ||
      typeof payload.requestedAt !== "string"
    ) {
      return null;
    }
    return payload as unknown as EvidenceDeletionExceptionRecord;
  }

  private requireOperationalIdentity(
    identity: OperationalIdentity | null,
  ): OperationalIdentity & { actorId: string } {
    if (!identity?.actorId) {
      throw new ApiRequestError(
        401,
        "EVIDENCE_GOVERNANCE_IDENTITY_REQUIRED",
        "Authenticated actor identity is required for evidence-governance operations.",
      );
    }
    return {
      ...identity,
      actorId: identity.actorId,
    };
  }

  private assertLegalHoldPlacementAllowed(
    family: EvidenceRetentionFamily,
    actor: OperationalIdentity,
  ) {
    const policy = getEvidenceRetentionPolicy(family);
    if (!policy.legalHold.placementActors.includes(actor.actorType)) {
      throw new ApiRequestError(
        403,
        "EVIDENCE_GOVERNANCE_FORBIDDEN",
        "Actor is not allowed to place evidence governance controls for this family.",
        {
          family,
          actorType: actor.actorType,
        },
      );
    }
  }

  private assertLegalHoldReleaseAllowed(
    family: EvidenceRetentionFamily,
    actor: OperationalIdentity,
  ) {
    const policy = getEvidenceRetentionPolicy(family);
    if (!policy.legalHold.releaseActors.includes(actor.actorType)) {
      throw new ApiRequestError(
        403,
        "EVIDENCE_GOVERNANCE_FORBIDDEN",
        "Actor is not allowed to release evidence legal holds for this family.",
        {
          family,
          actorType: actor.actorType,
        },
      );
    }
  }

  private requireNonBlank(value: string | null | undefined, field: string) {
    const normalized = value?.trim();
    if (!normalized) {
      throw new ApiRequestError(
        400,
        "EVIDENCE_GOVERNANCE_INVALID_INPUT",
        `The ${field} field is required.`,
        { field },
      );
    }
    return normalized;
  }

  private normalizeOptional(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private requireFutureIso(value: string, field: string) {
    const normalized = this.requireNonBlank(value, field);
    const expiresAt = new Date(normalized);
    if (
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt.getTime() <= Date.now()
    ) {
      throw new ApiRequestError(
        400,
        "EVIDENCE_GOVERNANCE_INVALID_EXPIRY",
        `The ${field} field must be a future ISO timestamp.`,
        { field, expiresAt: normalized },
      );
    }
    return expiresAt.toISOString();
  }

  private requireReasonCode<T extends readonly string[]>(
    value: string,
    allowed: T,
    field: string,
  ): T[number] {
    const normalized = this.requireNonBlank(value, field);
    if (!allowed.includes(normalized)) {
      throw new ApiRequestError(
        400,
        "EVIDENCE_GOVERNANCE_INVALID_REASON_CODE",
        `The ${field} value is not supported.`,
        { field, value: normalized, allowed },
      );
    }
    return normalized as T[number];
  }

  private withEffectiveDeletionExceptionStatus(
    exception: EvidenceDeletionExceptionRecord,
  ): EvidenceDeletionExceptionRecord {
    if (exception.status !== "active") {
      return exception;
    }
    const expiresAt = new Date(exception.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() > Date.now()) {
      return exception;
    }
    return {
      ...exception,
      status: "expired" satisfies EvidenceDeletionExceptionStatus,
    };
  }

  private persistAuditLog(auditLog: AuditLogRecord) {
    if (!this.auditLogRepository) {
      return;
    }

    void this.auditLogRepository.append(auditLog).catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Audit log write-through skipped: ${detail}`);
    });
  }
}
