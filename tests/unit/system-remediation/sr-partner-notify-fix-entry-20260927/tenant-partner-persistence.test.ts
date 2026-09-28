import { describe, expect, it, vi } from "vitest";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";

describe("SR-PARTNER-NOTIFY-FIX-ENTRY-20260927: TenantPartnerService entry durability", () => {
  it("deferred persistence keeps response pending; success returns only after durable write", async () => {
    const auditNotificationService = new AuditNotificationService();
    // Use an injected mock for persistChangesRequired if possible, but the service doesn't inject repository directly in this simplified constructor.
    // Wait, the repository is injected in constructor?
    // Constructor: constructor(private auditNotificationService: AuditNotificationService, private tenantPartnerRepository?: TenantPartnerRepository, ...)
    const mockRepo: any = {
      persistChanges: vi.fn(),
    };
    const service = new TenantPartnerService(auditNotificationService, mockRepo);

    let resolvePersistence: () => void = () => {};
    const persistencePromise = new Promise<void>((resolve) => {
      resolvePersistence = resolve;
    });
    mockRepo.persistChanges.mockReturnValue(persistencePromise);

    let isResolved = false;
    const createPromise = service.createPlatformPartnerEntry(
      {
        tenantId: "tenant-demo-001",
        partnerCode: "durable_partner",
        partnerType: "bank_partner",
        programId: "prog-1",
        entrySlug: "durable-partner-1",
        displayName: "Durable Partner",
        authMode: "partner_api_key",
        eligibilityMode: "none",
        businessDispatchSubtype: "enterprise_dispatch",
      },
      "req-1",
    ).then((res) => {
      isResolved = true;
      return res;
    });

    // Wait a bit to ensure it stays pending
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(isResolved).toBe(false); // deferred persistence keeps response pending

    // Now resolve persistence
    resolvePersistence();
    const created = await createPromise;

    expect(isResolved).toBe(true);
    expect(created.entrySlug).toBe("durable-partner-1");

    // verify it is usable
    const retrieved = service.getPartnerEntry("durable-partner-1");
    expect(retrieved).toBeDefined();
    expect(retrieved.entrySlug).toBe("durable-partner-1");
  });

  it("rejected persistence fails and leaves no usable entry", async () => {
    const auditNotificationService = new AuditNotificationService();
    const mockRepo: any = {
      persistChanges: vi.fn().mockRejectedValue(new Error("DB Connection Lost")),
      reportPersistenceFailure: vi.fn(),
    };
    const service = new TenantPartnerService(auditNotificationService, mockRepo);

    await expect(
      service.createPlatformPartnerEntry(
        {
          tenantId: "tenant-demo-001",
          partnerCode: "failed_partner",
          partnerType: "bank_partner",
          programId: "prog-2",
          entrySlug: "failed-partner-1",
          displayName: "Failed Partner",
          authMode: "partner_api_key",
          eligibilityMode: "none",
          businessDispatchSubtype: "enterprise_dispatch",
        },
        "req-2",
      )
    ).rejects.toThrow("DB Connection Lost");

    // verify it is NOT usable
    expect(() => service.getPartnerEntry("failed-partner-1")).toThrowError();

    // check it is not in the list
    const entries = service.listPlatformPartnerEntries();
    expect(entries.find(e => e.entrySlug === "failed-partner-1")).toBeUndefined();
  });
});
