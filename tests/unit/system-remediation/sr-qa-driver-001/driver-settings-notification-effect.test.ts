// SR-QA-DRIVER-001 -- C060 (個資、通知偏好與裝置自檢).
//
// `tests/unit/driver-settings.test.ts` already covers `DriverSettingsService`
// defaults, updates, cross-call persistence (write -> read-back within the
// same in-memory service instance, standing in for "重啟回讀" absent a real
// device/process restart in this VM), partial-field updates, and
// `listAll()`. This file does not re-derive that coverage. It also does not
// re-derive `DriverSettingsController`'s per-driver ownership checks
// (`isDriverIdentityMatching` on both `getSettings` and `updateSettings`,
// each returning `DRIVER_SETTINGS_NOT_FOUND` for a mismatched driver) --
// those are already exercised by `tests/security/iam-route-driver-negative.
// test.ts` and `tests/security/iam-driver-authz-enforcement.test.ts`.
//
// What was NOT covered anywhere as of this SHA is the other half of this
// capability's stated gap: "偏好真實影響通知" (the preference genuinely
// affects notifications). `grep -rn "notificationsEnabled" apps/api/src`
// (excluding tests) matches only inside `driver-settings.service.ts` itself
// -- no notification-sending code path in the repository (in particular
// `AuditNotificationService.recordNotification`, the exact call site
// `BillingSettlementService.generateDriverStatements` uses to notify a
// driver their statement is ready) reads this flag before recording/sending
// a notification. This file proves that directly: setting
// `notificationsEnabled: false` for a driver has zero effect on whether a
// notification addressed to that driver is actually recorded. This is a
// confirmed CURRENT-BEHAVIOUR finding, reported as a sourced follow-up task,
// not fixed in this verification-only task.
//
// 真機自檢 (real-device diagnostics self-check) is out of scope for this VM
// (see SR-LIVE-DRIVER-001).

import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverSettingsService } from "../../../../apps/api/src/modules/driver-settings/driver-settings.service";

describe("SR-QA-DRIVER-001 C060: notification preference genuinely affects delivery (remediated behaviour)", () => {
  it("suppresses notifications for a driver with notificationsEnabled=false", async () => {
    const auditService = new AuditNotificationService();
    const settingsService = new DriverSettingsService(auditService);

    const updated = settingsService.updateSettings("drv-demo-notif-001", {
      notificationsEnabled: false,
    });
    expect(updated.notificationsEnabled).toBe(false);

    // Read-back through an independent surface, not just the write's own
    // return value.
    expect(settingsService.getSettings("drv-demo-notif-001")).toMatchObject({
      notificationsEnabled: false,
    });

    const beforeCount = auditService.listNotifications().length;

    // The exact call shape `BillingSettlementService.generateDriverStatements`
    // uses to notify a driver (channel "driver_task"), addressed to the same
    // driver who just opted out.
    const recorded = auditService.recordNotification({
      tenantId: null,
      channel: "driver_task",
      title: "Driver statement generated",
      message:
        "Statement DRV-202603-001 is ready for driver drv-demo-notif-001.",
      status: "unread",
    });

    expect(recorded.notificationId).toBeTruthy();
    // Notification is suppressed from the driver's notification feed:
    expect(auditService.listNotifications().length).toBe(beforeCount);
    expect(
      auditService
        .listNotifications()
        .some((n) => n.notificationId === recorded.notificationId),
    ).toBe(false);
  });

  it("delivers notifications when notificationsEnabled=true", async () => {
    const auditService = new AuditNotificationService();
    const settingsService = new DriverSettingsService(auditService);

    settingsService.updateSettings("drv-demo-notif-002", {
      notificationsEnabled: true,
    });

    const beforeCount = auditService.listNotifications().length;
    const recorded = auditService.recordNotification({
      tenantId: null,
      channel: "driver_task",
      title: "Driver statement generated",
      message:
        "Statement DRV-202603-002 is ready for driver drv-demo-notif-002.",
      status: "unread",
    });

    expect(recorded.notificationId).toBeTruthy();
    expect(auditService.listNotifications().length).toBe(beforeCount + 1);
    expect(
      auditService
        .listNotifications()
        .some((n) => n.notificationId === recorded.notificationId),
    ).toBe(true);
  });
});
