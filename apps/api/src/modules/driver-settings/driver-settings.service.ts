import { randomUUID } from "node:crypto";
import { Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  DriverSettings,
  UpdateDriverSettingsCommand,
} from "@drts/contracts";

import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { DriverSettingsRepository } from "./driver-settings.repository";

@Injectable()
export class DriverSettingsService implements OnModuleInit {
  private settings: DriverSettings[] = [];

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    @Optional() private readonly repository?: DriverSettingsRepository,
  ) {
    if (this.auditNotificationService) {
      this.attachNotificationInterception();
    }
  }

  async onModuleInit() {
    if (!this.repository) return;
    try {
      const data = await this.repository.loadAll();
      if (data.length === 0) return;
      this.settings = data.map((s) => this.clone(s));
    } catch (error) {
      this.repository.reportPersistenceFailure(error, "module init");
    }
  }

  getSettings(driverId: string) {
    const existing = this.settings.find((s) => s.driverId === driverId);
    if (existing) return this.clone(existing);

    // Return defaults
    const defaults: DriverSettings = {
      driverId,
      language: "en",
      notificationsEnabled: true,
      autoAcceptEnabled: false,
      maxAcceptRadius: null,
      preferredAreas: [],
      updatedAt: new Date().toISOString(),
    };
    return defaults;
  }

  updateSettings(
    driverId: string,
    command: UpdateDriverSettingsCommand,
    requestId?: string,
  ) {
    const existing = this.getSettings(driverId);
    const now = new Date().toISOString();

    const updated: DriverSettings = {
      ...existing,
      ...(command.language !== undefined && { language: command.language }),
      ...(command.notificationsEnabled !== undefined && {
        notificationsEnabled: command.notificationsEnabled,
      }),
      ...(command.autoAcceptEnabled !== undefined && {
        autoAcceptEnabled: command.autoAcceptEnabled,
      }),
      ...(command.maxAcceptRadius !== undefined && {
        maxAcceptRadius: command.maxAcceptRadius,
      }),
      ...(command.preferredAreas !== undefined && {
        preferredAreas: command.preferredAreas,
      }),
      updatedAt: now,
    };

    // Replace or add
    const idx = this.settings.findIndex((s) => s.driverId === driverId);
    if (idx >= 0) {
      this.settings[idx] = updated;
    } else {
      this.settings.push(updated);
    }

    this.persist(updated);
    this.recordAudit(
      {
        actorId: driverId,
        actorType: "system",
        tenantId: null,
        moduleName: "driver-settings",
        actionName: "update_driver_settings",
        resourceType: "driver_settings",
        resourceId: driverId,
        newValuesSummary: command as Record<string, unknown>,
      },
      requestId,
    );

    return this.clone(updated);
  }

  listAll() {
    return this.settings.map((s) => this.clone(s));
  }

  isNotificationEnabled(driverId: string): boolean {
    const settings = this.getSettings(driverId);
    return settings.notificationsEnabled !== false;
  }

  shouldDeliverNotification(
    driverId: string,
    channel?: string | null,
  ): boolean {
    if (!this.isNotificationEnabled(driverId)) {
      if (
        !channel ||
        channel === "driver_task" ||
        channel.startsWith("driver_")
      ) {
        return false;
      }
    }
    return true;
  }

  // --- Private helpers ---

  private extractDriverId(input: {
    recipientUserId?: string | null;
    channel?: string | null;
    title?: string | null;
    message?: string | null;
  }): string | null {
    if (input.recipientUserId && input.recipientUserId.trim()) {
      return input.recipientUserId.trim();
    }
    const text = `${input.title ?? ""} ${input.message ?? ""}`;
    const forDriverMatch = text.match(/(?:for\s+driver\s+)([\w-]+)/i);
    if (forDriverMatch && forDriverMatch[1]) {
      return forDriverMatch[1];
    }
    const driverDrvMatch = text.match(/(?:driver\s+)(drv-[\w-]+)/i);
    if (driverDrvMatch && driverDrvMatch[1]) {
      return driverDrvMatch[1];
    }
    const drvPatternMatch = text.match(/\b(drv-(?!20\d{2})[\w-]+)\b/i);
    if (drvPatternMatch && drvPatternMatch[1]) {
      return drvPatternMatch[1];
    }
    return null;
  }

  private attachNotificationInterception() {
    if (!this.auditNotificationService) return;
    const target = this.auditNotificationService as any;
    if (target.__driverSettingsFilterAttached) {
      return;
    }
    target.__driverSettingsFilterAttached = true;

    const originalRecordNotification = target.recordNotification.bind(
      this.auditNotificationService,
    );

    target.recordNotification = (input: any) => {
      const driverId = this.extractDriverId(input);
      if (
        driverId &&
        (!input.channel ||
          input.channel === "driver_task" ||
          input.channel.startsWith("driver_"))
      ) {
        if (!this.shouldDeliverNotification(driverId, input.channel)) {
          return {
            ...input,
            recipientUserId: input.recipientUserId ?? driverId,
            notificationId: `notif-suppressed-${randomUUID()}`,
            createdAt: new Date().toISOString(),
            readAt: null,
            status: "unread",
          };
        }
      }
      return originalRecordNotification(input);
    };
  }

  private clone(settings: DriverSettings) {
    return { ...settings };
  }

  private persist(settings: DriverSettings) {
    if (!this.repository) return;
    void this.repository.upsert(settings).catch((error: unknown) => {
      this.repository!.reportPersistenceFailure(error, "update_settings");
    });
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    const log = { ...input };
    if (requestId) (log as any).requestId = requestId;
    this.auditNotificationService.recordAuditLog(log);
  }
}
