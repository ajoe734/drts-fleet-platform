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
  ) {}

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

  // --- Private helpers ---

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
