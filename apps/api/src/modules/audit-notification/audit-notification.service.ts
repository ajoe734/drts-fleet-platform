import { randomUUID } from "node:crypto";

import { Injectable, Logger, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  MarkNotificationsReadCommand,
  NotificationRecord,
} from "@drts/contracts";

import {
  BOOTSTRAP_AUDIT_LOG,
  cloneAuditLog,
  createAuditLogRecord,
} from "./audit-log.persistence";
import { AuditLogRepository } from "./audit-log.repository";

const MAX_IN_MEMORY_AUDIT_LOGS = 1000;

function trimAuditLogs(auditLogs: AuditLogRecord[]) {
  return auditLogs.length <= MAX_IN_MEMORY_AUDIT_LOGS
    ? auditLogs
    : auditLogs.slice(0, MAX_IN_MEMORY_AUDIT_LOGS);
}

@Injectable()
export class AuditNotificationService implements OnModuleInit {
  private readonly logger = new Logger(AuditNotificationService.name);

  private notifications: NotificationRecord[] = [
    {
      notificationId: "notif-tenant-sla-001",
      tenantId: "tenant-demo-001",
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

  constructor(
    @Optional() private readonly auditLogRepository?: AuditLogRepository,
  ) {}

  async onModuleInit() {
    if (!this.auditLogRepository) {
      return;
    }

    try {
      this.auditLogs = trimAuditLogs(
        await this.auditLogRepository.loadRecent(MAX_IN_MEMORY_AUDIT_LOGS),
      );
    } catch (error) {
      this.auditLogRepository.reportPersistenceFailure(error, "module init");
      this.auditLogs = trimAuditLogs([cloneAuditLog(BOOTSTRAP_AUDIT_LOG)]);
    }
  }

  listNotifications() {
    return this.notifications.map((notification) => ({ ...notification }));
  }

  listAuditLogs() {
    return this.auditLogs.map((auditLog) => cloneAuditLog(auditLog));
  }

  recordNotification(
    input: Omit<NotificationRecord, "notificationId" | "createdAt" | "readAt">,
  ) {
    const notification: NotificationRecord = {
      ...input,
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
    return this.appendAuditLog(input);
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
