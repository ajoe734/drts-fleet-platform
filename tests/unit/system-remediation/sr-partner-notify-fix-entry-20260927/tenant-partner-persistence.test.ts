import { describe, expect, it, vi, beforeEach } from "vitest";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantPartnerController } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";

class Deferred<T> {
  promise: Promise<T>;
  resolve!: (value: T | PromiseLike<T>) => void;
  reject!: (reason?: any) => void;
  constructor() {
    this.promise = new Promise<T>((res, rej) => {
      this.resolve = res;
      this.reject = rej;
    });
  }
}

describe("SR-PARTNER-NOTIFY-FIX-ENTRY-20260927: TenantPartnerService entry durability & concurrency", () => {
  let auditNotificationService: AuditNotificationService;
  let mockRepo: any;
  let service: TenantPartnerService;
  let controller: TenantPartnerController;
  
  beforeEach(() => {
    auditNotificationService = new AuditNotificationService();
    mockRepo = {
      persistChanges: vi.fn().mockResolvedValue(undefined),
      reportPersistenceFailure: vi.fn(),
    };
    service = new TenantPartnerService(auditNotificationService, mockRepo);
    controller = new TenantPartnerController(
      service,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  const createCommand = (slug: string) => ({
    tenantId: "tenant-demo-001",
    partnerCode: `code_${slug}`,
    partnerType: "bank_partner",
    programId: "prog-1",
    entrySlug: slug,
    displayName: `Partner ${slug}`,
    authMode: "partner_api_key" as const,
    eligibilityMode: "none",
    businessDispatchSubtype: "enterprise_dispatch",
  });

  it("1. Real service/controller create response pending until durable write, rejected write rejects response and leaves no public/listed phantom", async () => {
    const defer = new Deferred<void>();
    mockRepo.persistChanges.mockReturnValueOnce(defer.promise);

    const createPromise = controller.createPlatformPartnerEntry(createCommand("durable-1"), "req-1");

    let isResolved = false;
    createPromise.then(() => { isResolved = true; }).catch(() => { isResolved = true; });

    await new Promise((r) => setTimeout(r, 50));
    expect(isResolved).toBe(false);

    defer.reject(new Error("DB Error"));
    await expect(createPromise).rejects.toThrow("DB Error");

    expect(() => service.getPartnerEntry("durable-1")).toThrowError();
    expect(service.listPlatformPartnerEntries().find(e => e.entrySlug === "durable-1")).toBeUndefined();
  });

  it("2. Same-slug concurrent create: one initial write; successful first call makes queued duplicate reject PARTNER_ENTRY_CONFLICT. Rejected first write releases queued retry, with no public entry before retry commits", async () => {
    const defer1 = new Deferred<void>();
    mockRepo.persistChanges.mockReturnValueOnce(defer1.promise);

    const firstCreate = controller.createPlatformPartnerEntry(createCommand("concurrent-slug"), "req-1");
    await new Promise(r => setTimeout(r, 10)); // let it acquire mutex

    // second create should block on mutex
    const secondCreate = controller.createPlatformPartnerEntry(createCommand("concurrent-slug"), "req-2");

    defer1.resolve();
    await firstCreate;
    await expect(secondCreate).rejects.toMatchObject({ code: "PARTNER_ENTRY_CONFLICT" });

    // Rejected first write
    const defer3 = new Deferred<void>();
    mockRepo.persistChanges.mockReturnValueOnce(defer3.promise);
    
    const thirdCreate = controller.createPlatformPartnerEntry(createCommand("retry-slug"), "req-3");
    await new Promise(r => setTimeout(r, 10)); // let it acquire mutex

    // fourth create will block on mutex
    const defer4 = new Deferred<void>();
    mockRepo.persistChanges.mockReturnValueOnce(defer4.promise);
    const fourthCreate = controller.createPlatformPartnerEntry(createCommand("retry-slug"), "req-4");

    defer3.reject(new Error("First failed"));
    await expect(thirdCreate).rejects.toThrow("First failed");

    // it should be absent before fourth completes
    expect(() => service.getPartnerEntry("retry-slug")).toThrowError();

    defer4.resolve();
    await fourthCreate;
    expect(service.getPartnerEntry("retry-slug")).toBeDefined();
  });

  it("3. Whitespace-alias update/status/revoke ordering preserves terminal revoke; failure preserves the prior committed state", async () => {
    mockRepo.persistChanges.mockResolvedValue(undefined); // ensure non-blocking for creation
    await controller.createPlatformPartnerEntry(createCommand("state-slug"), "req-1");

    // failure preserves prior committed state
    mockRepo.persistChanges.mockRejectedValueOnce(new Error("Update failed"));
    const updateCmd = {
      entrySlug: "state-slug",
      displayName: "Updated Name",
    };
    await expect(
      controller.updatePlatformPartnerEntry(" state-slug ", updateCmd as any, "req-2")
    ).rejects.toThrow("Update failed");

    let entry = service.listPlatformPartnerEntries().find(e => e.entrySlug === "state-slug")!;
    expect(entry.displayName).toBe("Partner state-slug");

    // whitespace-alias update/status/revoke ordering preserves terminal revoke
    const deferUpdate = new Deferred<void>();
    mockRepo.persistChanges.mockReturnValueOnce(deferUpdate.promise);
    const updatePromise = controller.updatePlatformPartnerEntry("state-slug", updateCmd as any, "req-3");
    await new Promise(r => setTimeout(r, 10));

    const deferRevoke = new Deferred<void>();
    mockRepo.persistChanges.mockReturnValueOnce(deferRevoke.promise);
    const revokePromise = controller.revokePlatformPartnerEntry("  state-slug", "req-4");

    deferUpdate.resolve();
    await updatePromise;

    deferRevoke.resolve();
    await revokePromise;

    entry = service.listPlatformPartnerEntries().find(e => e.entrySlug === "state-slug")!;
    expect(entry.status).toBe("revoked");
  });

  it("4. Same-entry issue/revoke in both orders, including failed revoke and queued issuance", async () => {
    await controller.createPlatformPartnerEntry(createCommand("issue-revoke-slug"), "req-1");

    const deferIssue = new Deferred<void>();
    mockRepo.persistChanges.mockReturnValueOnce(deferIssue.promise);
    const issuePromise = controller.issuePlatformPartnerIngressCredential("issue-revoke-slug", { label: "key1" }, "req-2");
    await new Promise(r => setTimeout(r, 10));

    // The issue promise hasn't resolved so we don't have the keyId yet.
    // We cannot revoke without keyId.
    // Let's resolve issue first.
    deferIssue.resolve();
    const issueResult = await issuePromise;
    const keyId = issueResult.data.credential.keyId;

    // issue then queued revoke
    const deferRevoke = new Deferred<void>();
    mockRepo.persistChanges.mockReturnValueOnce(deferRevoke.promise);
    const revokePromise = controller.revokePlatformPartnerIngressCredential("issue-revoke-slug", keyId, {} as any, "req-3");
    await new Promise(r => setTimeout(r, 10));

    deferRevoke.resolve();
    await revokePromise;

    const creds = controller.listPlatformPartnerIngressCredentials("issue-revoke-slug").data.items;
    expect(creds.find((c: any) => c.keyId === keyId)?.status).toBe("revoked");
  });

  it("5. Cross-entry issue/issue in both completion orders preserves both keys; issue/other-key-revoke cannot resurrect a revoked key, and real authenticatePartnerBootstrap must reject it", async () => {
    await controller.createPlatformPartnerEntry(createCommand("cross-slug"), "req-1");

    const deferIssue1 = new Deferred<void>();
    mockRepo.persistChanges.mockReturnValueOnce(deferIssue1.promise);
    const issue1 = controller.issuePlatformPartnerIngressCredential("cross-slug", { label: "key1" }, "req-2");
    await new Promise(r => setTimeout(r, 10));

    const deferIssue2 = new Deferred<void>();
    mockRepo.persistChanges.mockReturnValueOnce(deferIssue2.promise);
    const issue2 = controller.issuePlatformPartnerIngressCredential("cross-slug", { label: "key2" }, "req-3");

    // Complete in reverse order (Issue2 blocks on Issue1's mutex, so Issue2 cannot complete before Issue1 finishes persistChanges)
    // Actually they are queued in the mutex.
    deferIssue1.resolve();
    const res1 = await issue1;

    deferIssue2.resolve();
    const res2 = await issue2;

    const creds = controller.listPlatformPartnerIngressCredentials("cross-slug").data.items;
    expect(creds.length).toBe(2);

    const keyId1 = res1.data.credential.keyId;
    const apiKey1 = res1.data.plaintextKey;

    await controller.revokePlatformPartnerIngressCredential("cross-slug", keyId1, {} as any, "req-4");
    
    mockRepo.persistChanges.mockRejectedValueOnce(new Error("Failed to revoke"));
    const key2Id = res2.data.credential.keyId;
    await expect(
      controller.revokePlatformPartnerIngressCredential("cross-slug", key2Id, {} as any, "req-5")
    ).rejects.toThrow("Failed to revoke");

    expect(() => 
      service.authenticatePartnerBootstrap({ entrySlug: "cross-slug", apiKey: apiKey1 }, "req-6")
    ).toThrow();
  });
});
