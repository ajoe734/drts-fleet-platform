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
});
