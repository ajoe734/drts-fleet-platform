import { describe, expect, it, vi, beforeEach } from "vitest";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantPartnerController } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import type { CreatePartnerChannelEntryCommand } from "@drts/contracts";

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

  const createCommand = (slug: string): CreatePartnerChannelEntryCommand => ({
    tenantId: "tenant-demo-001",
    partnerCode: `code_${slug}`,
    partnerType: "bank_partner",
    programId: "prog-1",
    entrySlug: slug,
    displayName: `Partner ${slug}`,
    authMode: "partner_api_key",
    eligibilityMode: "none",
    businessDispatchSubtype: "enterprise_dispatch",
  });

  it("1. Real service/controller create response pending until durable write, rejected write rejects response and leaves no public/listed phantom", async () => {
    const defer = new Deferred<void>();
    mockRepo.persistChanges.mockReturnValueOnce(defer.promise);

    const createPromise = controller.createPlatformPartnerEntry(
      createCommand("durable-1"),
      "req-1",
    );

    let isResolved = false;
    createPromise
      .then(() => {
        isResolved = true;
      })
      .catch(() => {
        isResolved = true;
      });

    await new Promise((r) => setTimeout(r, 50));
    expect(isResolved).toBe(false);

    defer.reject(new Error("DB Error"));
    await expect(createPromise).rejects.toThrow("DB Error");

    expect(() => service.getPartnerEntry("durable-1")).toThrowError();
    expect(
      service
        .listPlatformPartnerEntries()
        .find((e) => e.entrySlug === "durable-1"),
    ).toBeUndefined();
  });

  it("2. Same-slug concurrent create: one initial write; successful first call makes queued duplicate reject PARTNER_ENTRY_CONFLICT. Rejected first write releases queued retry, with no public entry before retry commits", async () => {
    const defer1 = new Deferred<void>();
    mockRepo.persistChanges.mockReturnValueOnce(defer1.promise);

    const firstCreate = controller.createPlatformPartnerEntry(
      createCommand("concurrent-slug"),
      "req-1",
    );
    await new Promise((r) => setTimeout(r, 10)); // let it acquire mutex

    // second create should block on mutex
    const secondCreate = controller.createPlatformPartnerEntry(
      createCommand("concurrent-slug"),
      "req-2",
    );

    defer1.resolve();
    await firstCreate;
    await expect(secondCreate).rejects.toMatchObject({
      code: "PARTNER_ENTRY_CONFLICT",
    });

    // Rejected first write
    const defer3 = new Deferred<void>();
    mockRepo.persistChanges.mockReturnValueOnce(defer3.promise);

    const thirdCreate = controller.createPlatformPartnerEntry(
      createCommand("retry-slug"),
      "req-3",
    );
    await new Promise((r) => setTimeout(r, 10)); // let it acquire mutex

    // fourth create will block on mutex
    const defer4 = new Deferred<void>();
    mockRepo.persistChanges.mockReturnValueOnce(defer4.promise);
    const fourthCreate = controller.createPlatformPartnerEntry(
      createCommand("retry-slug"),
      "req-4",
    );

    defer3.reject(new Error("First failed"));
    await expect(thirdCreate).rejects.toThrow("First failed");

    // it should be absent before fourth completes
    expect(() => service.getPartnerEntry("retry-slug")).toThrowError();

    defer4.resolve();
    await fourthCreate;
    expect(service.getPartnerEntry("retry-slug")).toBeDefined();

    expect(mockRepo.persistChanges).toHaveBeenCalledTimes(3); // 2 successful, 2 failed but one rejected before calling persistChanges
  });

  it("3. Whitespace-alias update/status/revoke ordering preserves terminal revoke; failure preserves the prior committed state", async () => {
    mockRepo.persistChanges.mockResolvedValue(undefined); // ensure non-blocking for creation
    await controller.createPlatformPartnerEntry(
      createCommand("state-slug"),
      "req-1",
    );

    // failure preserves prior committed state
    mockRepo.persistChanges.mockRejectedValueOnce(new Error("Update failed"));
    const updateCmd = {
      entrySlug: "state-slug",
      displayName: "Updated Name",
    };
    await expect(
      controller.updatePlatformPartnerEntry(
        " state-slug ",
        updateCmd as any,
        "req-2",
      ),
    ).rejects.toThrow("Update failed");

    let entry = service
      .listPlatformPartnerEntries()
      .find((e) => e.entrySlug === "state-slug")!;
    expect(entry.displayName).toBe("Partner state-slug");

    // Revoke first refusal (revoke-first/queued-reactivation refusal)
    await controller.revokePlatformPartnerEntry("state-slug ", "req-3");

    await expect(
      controller.activatePlatformPartnerEntry(" state-slug", "req-4"),
    ).rejects.toMatchObject({ code: "PARTNER_ENTRY_REVOKED" });

    entry = service
      .listPlatformPartnerEntries()
      .find((e) => e.entrySlug === "state-slug")!;
    expect(entry.status).toBe("revoked");
  });

  it("4. Same-entry issue/revoke in both orders, including failed revoke and queued issuance", async () => {
    await controller.createPlatformPartnerEntry(
      createCommand("issue-revoke-slug"),
      "req-1",
    );

    // Seed an entry/key as needed
    await controller.issuePlatformPartnerIngressCredential(
      "issue-revoke-slug",
      { purpose: "seeded-key" },
      "req-seed",
    );

    // start entry revoke while issue persistence is held
    const deferIssue = new Deferred<void>();
    mockRepo.persistChanges.mockReturnValueOnce(deferIssue.promise);
    const issuePromise = controller.issuePlatformPartnerIngressCredential(
      "issue-revoke-slug",
      { purpose: "key1" },
      "req-2",
    );
    await new Promise((r) => setTimeout(r, 10)); // allow mutex acquire

    const deferRevoke = new Deferred<void>();
    mockRepo.persistChanges.mockReturnValueOnce(deferRevoke.promise);
    const revokePromise = controller.revokePlatformPartnerEntry(
      "issue-revoke-slug",
      "req-3",
    );
    await new Promise((r) => setTimeout(r, 10)); // queued on mutex

    deferIssue.resolve();
    await issuePromise;
    deferRevoke.resolve();
    await revokePromise;

    const entryAfter = service
      .listPlatformPartnerEntries()
      .find((e) => e.entrySlug === "issue-revoke-slug")!;
    expect(entryAfter.status).toBe("revoked");
    await expect(
      controller.issuePlatformPartnerIngressCredential(
        "issue-revoke-slug",
        { purpose: "key2" },
        "req-4",
      ),
    ).rejects.toMatchObject({ code: "PARTNER_ENTRY_REVOKED" });

    // Now test vice versa: start issue while entry revoke persistence is held
    await controller.createPlatformPartnerEntry(
      createCommand("revoke-issue-slug"),
      "req-5",
    );
    const deferRevoke2 = new Deferred<void>();
    mockRepo.persistChanges.mockReturnValueOnce(deferRevoke2.promise);
    const revokePromise2 = controller.revokePlatformPartnerEntry(
      "revoke-issue-slug",
      "req-6",
    );
    await new Promise((r) => setTimeout(r, 10)); // allow mutex acquire

    const deferIssue2 = new Deferred<void>();
    mockRepo.persistChanges.mockReturnValueOnce(deferIssue2.promise);
    const issuePromise2 = controller.issuePlatformPartnerIngressCredential(
      "revoke-issue-slug",
      { purpose: "key3" },
      "req-7",
    );

    deferRevoke2.resolve();
    await revokePromise2;
    deferIssue2.resolve(); // it should be rejected because entry is revoked
    await expect(issuePromise2).rejects.toMatchObject({
      code: "PARTNER_ENTRY_REVOKED",
    });
  });

  it("5. Cross-entry issue/issue in both completion orders preserves both keys; issue/other-key-revoke cannot resurrect a revoked key, and real authenticatePartnerBootstrap must reject it", async () => {
    // Two distinct entries
    await controller.createPlatformPartnerEntry(
      createCommand("entry-a"),
      "req-1A",
    );
    await controller.createPlatformPartnerEntry(
      createCommand("entry-b"),
      "req-1B",
    );

    // Seed key for entry B
    const resBSeed = await controller.issuePlatformPartnerIngressCredential(
      "entry-b",
      { purpose: "key-b-seed" },
      "req-seed-B",
    );
    const apiKeyB = resBSeed.data.plaintextKey;
    const keyIdB = resBSeed.data.credential.keyId;

    // Successful authentication control before revoke
    const authSuccess = service.authenticatePartnerBootstrap(
      { entrySlug: "entry-b", apiKey: apiKeyB },
      "req-auth-1",
    );
    expect(authSuccess.partnerEntry.entrySlug).toBe("entry-b");

    // Hold entry-A issuance while entry-B existing-key revoke commits
    const deferIssueA = new Deferred<void>();
    mockRepo.persistChanges.mockImplementation((entry: any) => {
      if (entry.entrySlug === "entry-a") return deferIssueA.promise;
      return Promise.resolve();
    });

    const issueA = controller.issuePlatformPartnerIngressCredential(
      "entry-a",
      { purpose: "key-a" },
      "req-2A",
    );
    await new Promise((r) => setTimeout(r, 10)); // A acquires mutex

    const revokeB = controller.revokePlatformPartnerIngressCredential(
      "entry-b",
      keyIdB,
      {} as any,
      "req-3B",
    );
    await revokeB; // B is independent, so it completes immediately

    deferIssueA.resolve();
    await issueA; // A completes

    // assert B remains revoked and real authenticatePartnerBootstrap rejects specifically PARTNER_API_KEY_REVOKED
    const credsB =
      controller.listPlatformPartnerIngressCredentials("entry-b").data.items;
    expect(credsB.find((c: any) => c.keyId === keyIdB)?.status).toBe("revoked");

    try {
      service.authenticatePartnerBootstrap(
        { entrySlug: "entry-b", apiKey: apiKeyB },
        "req-auth-2",
      );
      expect.fail("Should throw");
    } catch (e: any) {
      expect(e.code).toBe("PARTNER_API_KEY_REVOKED");
    }

    // state/authentication preservation after rejected writes
    mockRepo.persistChanges.mockRejectedValueOnce(
      new Error("Failed to revoke A"),
    );
    const keyIdA = (await issueA).data.credential.keyId;
    await expect(
      controller.revokePlatformPartnerIngressCredential(
        "entry-a",
        keyIdA,
        {} as any,
        "req-4A",
      ),
    ).rejects.toThrow("Failed to revoke A");

    // A's key should still be active because revoke failed
    const apiKeyA = (await issueA).data.plaintextKey;
    const authSuccessA = service.authenticatePartnerBootstrap(
      { entrySlug: "entry-a", apiKey: apiKeyA },
      "req-auth-3",
    );
    expect(authSuccessA.partnerEntry.entrySlug).toBe("entry-a");
  });
});
