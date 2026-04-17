import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileRepository } from "../../apps/api/src/modules/driver-profile/driver-profile.repository";
import { DriverProfileService } from "../../apps/api/src/modules/driver-profile/driver-profile.service";

function createService() {
  const auditService = new AuditNotificationService();
  const repository = new DriverProfileRepository();
  const service = new DriverProfileService(auditService, repository);

  return { auditService, service };
}

describe("driver profile service", () => {
  it("returns seeded fallback data for the demo driver alias", () => {
    const { service } = createService();

    const profile = service.getProfile("driver-demo-001");

    expect(profile.driverId).toBe("drv-demo-001");
    expect(profile.name).toBe("Driver Demo One");
    expect(profile.phone).toBe("+886-912-000-001");
    expect(profile.emergencyContact?.name).toBe("Demo Contact One");
  });

  it("creates a new profile for an unseeded driver", () => {
    const { auditService, service } = createService();

    const created = service.createProfile(
      "driver-new-001",
      {
        name: "Driver New",
        phone: " +886-900-111-222 ",
        email: " driver.new@example.com ",
        emergencyContact: {
          name: "Emergency Contact",
          phone: " +886-900-333-444 ",
          relationship: " sibling ",
        },
        bankAccount: {
          bankName: "Demo Bank",
          accountName: "Driver New",
          accountNumberMasked: "****9001",
        },
      },
      "req-driver-profile-create",
    );

    expect(created.driverId).toBe("driver-new-001");
    expect(created.name).toBe("Driver New");
    expect(created.phone).toBe("+886-900-111-222");
    expect(created.email).toBe("driver.new@example.com");
    expect(created.emergencyContact?.relationship).toBe("sibling");
    expect(created.bankAccount?.accountNumberMasked).toBe("****9001");
    expect(auditService.listAuditLogs()[0]?.actionName).toBe(
      "create_driver_profile",
    );
  });

  it("rejects creating a profile when a seeded driver profile already exists", () => {
    const { auditService, service } = createService();
    const beforeCount = auditService.listAuditLogs().filter((entry) => {
      return entry.actionName === "create_driver_profile";
    }).length;

    expect(() =>
      service.createProfile(
        "driver-demo-001",
        {
          name: "Replacement Demo Driver",
        },
        "req-driver-profile-seeded-create",
      ),
    ).toThrowError(ApiRequestError);

    const afterCount = auditService.listAuditLogs().filter((entry) => {
      return entry.actionName === "create_driver_profile";
    }).length;
    expect(afterCount).toBe(beforeCount);
  });

  it("updates the current profile while preserving unchanged fields", () => {
    const { auditService, service } = createService();

    const updated = service.updateProfile(
      "driver-demo-001",
      {
        photoUrl: " https://cdn.example.com/driver-001.jpg ",
        emergencyContact: null,
      },
      "req-driver-profile-update",
    );

    expect(updated.driverId).toBe("drv-demo-001");
    expect(updated.name).toBe("Driver Demo One");
    expect(updated.photoUrl).toBe("https://cdn.example.com/driver-001.jpg");
    expect(updated.emergencyContact).toBeNull();
    expect(updated.bankAccount?.bankName).toBe("Demo Bank");
    expect(auditService.listAuditLogs()[0]?.actionName).toBe(
      "update_driver_profile",
    );
  });

  it("rejects reads when bootstrap identity has no actorId", () => {
    const { service } = createService();

    expect(() => service.getProfile(null)).toThrowError(ApiRequestError);
  });

  it("rejects creates when bootstrap identity has no actorId", () => {
    const { service } = createService();

    expect(() =>
      service.createProfile(
        undefined,
        {
          name: "Missing Identity Driver",
        },
        "req-driver-profile-create-missing-actor",
      ),
    ).toThrowError(ApiRequestError);
  });

  it("rejects updates when bootstrap identity has no actorId", () => {
    const { service } = createService();

    expect(() =>
      service.updateProfile(
        "   ",
        {
          name: "Missing Identity Driver",
        },
        "req-driver-profile-update-missing-actor",
      ),
    ).toThrowError(ApiRequestError);
  });
});
