import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverSettingsRepository } from "../../apps/api/src/modules/driver-settings/driver-settings.repository";
import { DriverSettingsService } from "../../apps/api/src/modules/driver-settings/driver-settings.service";

function createService() {
  const auditService = new AuditNotificationService();
  const repository = new DriverSettingsRepository();
  const service = new DriverSettingsService(auditService, repository);

  return { auditService, repository, service };
}

describe("driver settings service", () => {
  it("returns default settings for a new driver", () => {
    const { service } = createService();

    const settings = service.getSettings("driver-new-001");

    expect(settings.driverId).toBe("driver-new-001");
    expect(settings.language).toBe("en");
    expect(settings.notificationsEnabled).toBe(true);
    expect(settings.autoAcceptEnabled).toBe(false);
    expect(settings.maxAcceptRadius).toBeNull();
    expect(settings.preferredAreas).toEqual([]);
  });

  it("updates driver settings", () => {
    const { auditService, service } = createService();

    const updated = service.updateSettings("driver-001", {
      language: "zh-TW",
      notificationsEnabled: false,
      autoAcceptEnabled: true,
      maxAcceptRadius: 15,
      preferredAreas: ["downtown", "airport"],
    });

    expect(updated.language).toBe("zh-TW");
    expect(updated.notificationsEnabled).toBe(false);
    expect(updated.autoAcceptEnabled).toBe(true);
    expect(updated.maxAcceptRadius).toBe(15);
    expect(updated.preferredAreas).toEqual(["downtown", "airport"]);
    expect(updated.updatedAt).toBeDefined();

    expect(auditService.listAuditLogs()[0]?.actionName).toBe(
      "update_driver_settings",
    );
  });

  it("persists updated settings across calls", () => {
    const { service } = createService();

    service.updateSettings("driver-002", {
      language: "ja",
      maxAcceptRadius: 20,
    });

    const retrieved = service.getSettings("driver-002");
    expect(retrieved.language).toBe("ja");
    expect(retrieved.maxAcceptRadius).toBe(20);
  });

  it("lists all driver settings", () => {
    const { service } = createService();

    service.updateSettings("driver-a", { language: "en" });
    service.updateSettings("driver-b", { language: "ko" });

    const all = service.listAll();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it("partially updates only provided fields", () => {
    const { service } = createService();

    service.updateSettings("driver-partial", {
      language: "fr",
      notificationsEnabled: true,
      autoAcceptEnabled: false,
    });

    service.updateSettings("driver-partial", {
      language: "de",
    });

    const settings = service.getSettings("driver-partial");
    expect(settings.language).toBe("de");
    // Other fields should remain unchanged
    expect(settings.notificationsEnabled).toBe(true);
    expect(settings.autoAcceptEnabled).toBe(false);
  });
});
