import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";

describe("DriverProfileService sensitive-data governance", () => {
  it("redacts phone, email, emergency contact, and account holder details in audit logs", () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new DriverProfileService(auditNotificationService);

    service.updateProfile(
      "drv-demo-001",
      {
        phone: "+886-912-333-444",
        email: "driver.one+updated@example.com",
        emergencyContact: {
          name: "陳大文",
          phone: "0988123123",
          relationship: "spouse",
        },
        bankAccount: {
          bankName: "Demo Bank",
          accountName: "Driver Demo One",
          accountNumberMasked: "****0001",
        },
      },
      "req-driver-audit-001",
    );

    const auditLog = auditNotificationService
      .listAuditLogs()
      .find((entry) => entry.actionName === "update_driver_profile");
    expect(auditLog).toBeDefined();

    const serializedAudit = JSON.stringify(auditLog);
    expect(serializedAudit).not.toContain("+886-912-333-444");
    expect(serializedAudit).not.toContain("driver.one+updated@example.com");
    expect(serializedAudit).not.toContain("陳大文");
    expect(serializedAudit).not.toContain("0988123123");
    expect(serializedAudit).not.toContain("Driver Demo One");

    expect(auditLog?.newValuesSummary).toMatchObject({
      phone: "********3444",
      email: "d***@example.com",
      photoConfigured: false,
      emergencyContact: {
        name: "陳*文",
        phone: "******3123",
        relationship: "spouse",
      },
      bankAccount: {
        bankName: "Demo Bank",
        accountName: "D*************e",
        accountNumberMasked: "****0001",
      },
    });
  });

  it("tracks device binding links on the driver profile", () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new DriverProfileService(auditNotificationService);

    service.recordDeviceBinding("drv-demo-001", {
      bindingId: "drvbind_demo_001",
      deviceId: "ios-demo-001",
      deviceLabel: "iPhone 17",
      status: "active",
      issuedAt: "2026-04-29T00:00:00.000Z",
      refreshedAt: "2026-04-29T00:00:00.000Z",
      revokedAt: null,
    });

    service.recordDeviceBindingRevocation(
      "drv-demo-001",
      "drvbind_demo_001",
      "2026-04-29T01:00:00.000Z",
    );

    const profile = service.getProfileForDriver("drv-demo-001");
    expect(profile.deviceBindings).toEqual([
      expect.objectContaining({
        bindingId: "drvbind_demo_001",
        status: "revoked",
        deviceId: "ios-demo-001",
      }),
    ]);
  });

  it("returns null for missing persisted driver profiles", () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new DriverProfileService(auditNotificationService);

    expect(service.findProfileForDriver("drv-missing-001")).toBeNull();
    expect(service.getProfileForDriver("drv-missing-001")).toMatchObject({
      driverId: "drv-missing-001",
      name: "",
      deviceBindings: [],
    });
  });
});
