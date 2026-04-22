import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileRepository } from "../../apps/api/src/modules/driver-profile/driver-profile.repository";
import { DriverProfileService } from "../../apps/api/src/modules/driver-profile/driver-profile.service";

function createService(repository = new DriverProfileRepository()) {
  const auditService = new AuditNotificationService();
  const service = new DriverProfileService(auditService, repository);

  return { auditService, service };
}

describe("driver profile service", () => {
  it("returns an explicit empty state when no persisted profile exists", () => {
    const { service } = createService();

    const profile = service.getProfile("driver-demo-001");

    expect(profile.driverId).toBe("drv-demo-001");
    expect(profile.name).toBe("");
    expect(profile.phone).toBeNull();
    expect(profile.email).toBeNull();
    expect(profile.photoUrl).toBeNull();
    expect(profile.emergencyContact).toBeNull();
    expect(profile.bankAccount).toBeNull();
    expect(profile.updatedAt).toEqual(expect.any(String));
  });

  it("creates a new profile for the demo driver alias when no persisted record exists", () => {
    const { auditService, service } = createService();

    const created = service.createProfile(
      "driver-demo-001",
      {
        name: "Driver Demo One",
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

    expect(created.driverId).toBe("drv-demo-001");
    expect(created.name).toBe("Driver Demo One");
    expect(created.phone).toBe("+886-900-111-222");
    expect(created.email).toBe("driver.new@example.com");
    expect(created.emergencyContact?.relationship).toBe("sibling");
    expect(created.bankAccount?.accountNumberMasked).toBe("****9001");
    expect(auditService.listAuditLogs()[0]?.actionName).toBe(
      "create_driver_profile",
    );
    expect(service.getProfile("demo-driver").name).toBe("Driver Demo One");
  });

  it("rejects creating a profile when a persisted driver profile already exists", async () => {
    const persistedProfile = {
      driverId: "drv-demo-001",
      name: "Persisted Demo Driver",
      phone: "+886-900-000-001",
      email: "persisted.driver@example.com",
      photoUrl: null,
      emergencyContact: null,
      bankAccount: null,
      updatedAt: "2026-04-22T00:00:00.000Z",
    };
    const repository = {
      loadAll: vi.fn().mockResolvedValue([persistedProfile]),
      upsert: vi.fn().mockResolvedValue(undefined),
      reportPersistenceFailure: vi.fn(),
    } as unknown as DriverProfileRepository;
    const { auditService, service } = createService(repository);
    await service.onModuleInit();
    const beforeCount = auditService.listAuditLogs().filter((entry) => {
      return entry.actionName === "create_driver_profile";
    }).length;

    expect(() =>
      service.createProfile(
        "driver-demo-001",
        {
          name: "Replacement Demo Driver",
        },
        "req-driver-profile-persisted-create",
      ),
    ).toThrowError(ApiRequestError);

    const afterCount = auditService.listAuditLogs().filter((entry) => {
      return entry.actionName === "create_driver_profile";
    }).length;
    expect(afterCount).toBe(beforeCount);
  });

  it("uses the persisted profile as the update base while preserving unchanged fields", async () => {
    const persistedProfile = {
      driverId: "drv-demo-001",
      name: "Persisted Demo Driver",
      phone: "+886-900-000-001",
      email: "persisted.driver@example.com",
      photoUrl: null,
      emergencyContact: {
        name: "Persisted Contact",
        phone: "+886-900-000-999",
        relationship: "parent",
      },
      bankAccount: {
        bankName: "Persisted Bank",
        accountName: "Persisted Demo Driver",
        accountNumberMasked: "****0001",
      },
      updatedAt: "2026-04-22T00:00:00.000Z",
    };
    const upsert = vi.fn().mockResolvedValue(undefined);
    const repository = {
      loadAll: vi.fn().mockResolvedValue([persistedProfile]),
      upsert,
      reportPersistenceFailure: vi.fn(),
    } as unknown as DriverProfileRepository;
    const auditService = new AuditNotificationService();
    const service = new DriverProfileService(auditService, repository);
    await service.onModuleInit();

    const updated = service.updateProfile(
      "driver-demo-001",
      {
        photoUrl: " https://cdn.example.com/driver-001.jpg ",
        emergencyContact: null,
      },
      "req-driver-profile-update",
    );

    expect(updated.driverId).toBe("drv-demo-001");
    expect(updated.name).toBe("Persisted Demo Driver");
    expect(updated.phone).toBe("+886-900-000-001");
    expect(updated.photoUrl).toBe("https://cdn.example.com/driver-001.jpg");
    expect(updated.emergencyContact).toBeNull();
    expect(updated.bankAccount?.bankName).toBe("Persisted Bank");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        driverId: "drv-demo-001",
        name: "Persisted Demo Driver",
        photoUrl: "https://cdn.example.com/driver-001.jpg",
      }),
    );
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
