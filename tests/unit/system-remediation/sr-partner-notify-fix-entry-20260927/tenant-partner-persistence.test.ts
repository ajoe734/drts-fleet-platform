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

    // assert one initial write
    expect(mockRepo.persistChanges).toHaveBeenCalledTimes(1);
    
    let secondResolved = false;
    // second create should block on mutex
    const secondCreate = controller.createPlatformPartnerEntry(
      createCommand("concurrent-slug"),
      "req-2",
    ).catch(e => { secondResolved = true; throw e; });
    await new Promise((r) => setTimeout(r, 10)); // wait to ensure it's pending
    expect(secondResolved).toBe(false);

    defer1.resolve();
    await firstCreate;
    await expect(secondCreate).rejects.toMatchObject({
      code: "PARTNER_ENTRY_CONFLICT",
    });
    expect(secondResolved).toBe(true);

    // Rejected first write
    const defer3 = new Deferred<void>();
    mockRepo.persistChanges.mockReturnValueOnce(defer3.promise);

    const thirdCreate = controller.createPlatformPartnerEntry(
      createCommand("retry-slug"),
      "req-3",
    );
    await new Promise((r) => setTimeout(r, 10)); // let it acquire mutex

    let fourthResolved = false;
    // fourth create will block on mutex
    const defer4 = new Deferred<void>();
    mockRepo.persistChanges.mockReturnValueOnce(defer4.promise);
    const fourthCreate = controller.createPlatformPartnerEntry(
      createCommand("retry-slug"),
      "req-4",
    ).then(res => { fourthResolved = true; return res; });
    
    await new Promise((r) => setTimeout(r, 10)); // wait to ensure it's pending
    expect(fourthResolved).toBe(false);

    defer3.reject(new Error("First failed"));
    await expect(thirdCreate).rejects.toThrow("First failed");

    // it should be absent before fourth completes
    expect(() => service.getPartnerEntry("retry-slug")).toThrowError();
    expect(fourthResolved).toBe(false);

    defer4.resolve();
    await fourthCreate;
    expect(fourthResolved).toBe(true);
    expect(service.getPartnerEntry("retry-slug")).toBeDefined();
  });

  it("3. Whitespace-alias update/status/revoke ordering preserves terminal revoke; failure preserves the prior committed state", async () => {
    mockRepo.persistChanges.mockResolvedValue(undefined); // ensure non-blocking for creation
    await controller.createPlatformPartnerEntry(
      createCommand("state-slug"),
      "req-1",
    );
    // seed key to test usable auth remains
    const seedReq = await controller.issuePlatformPartnerIngressCredential(
      "state-slug",
      { purpose: "seed" },
      "req-seed",
    );
    const seedKey = seedReq.data.plaintextKey;

    // A: update held, B: revoke queued
    const deferUpdate = new Deferred<void>();
    let updateHeld = false;
    let revokeResolved = false;
    mockRepo.persistChanges.mockImplementationOnce(() => {
      updateHeld = true;
      return deferUpdate.promise;
    });

    const updateCmd = {
      entrySlug: "state-slug",
      displayName: "Updated Name",
    };
    const updatePromise = controller.updatePlatformPartnerEntry(
      " state-slug ",
      updateCmd as any,
      "req-2",
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(updateHeld).toBe(true);

    const deferRevoke1 = new Deferred<void>();
    mockRepo.persistChanges.mockImplementationOnce(() => deferRevoke1.promise);

    const revokePromise = controller.revokePlatformPartnerEntry(
      " state-slug",
      "req-3",
    ).then(() => { revokeResolved = true; });
    await new Promise((r) => setTimeout(r, 10));
    expect(revokeResolved).toBe(false);

    deferUpdate.resolve();
    await updatePromise;
    expect(revokeResolved).toBe(false); // Explicit no-early-response

    deferRevoke1.resolve();
    await revokePromise;
    expect(revokeResolved).toBe(true);

    let entry = service
      .listPlatformPartnerEntries()
      .find((e) => e.entrySlug === "state-slug")!;
    expect(entry.status).toBe("revoked");

    // create new entry for reverse order (revoke-first, activate queued)
    await controller.createPlatformPartnerEntry(
      createCommand("state-slug-2"),
      "req-4",
    );

    const deferRevoke2 = new Deferred<void>();
    let revoke2Held = false;
    let activateResolved = false;
    mockRepo.persistChanges.mockImplementationOnce(() => {
      revoke2Held = true;
      return deferRevoke2.promise;
    });

    const revokePromise2 = controller.revokePlatformPartnerEntry(
      " state-slug-2 ",
      "req-5",
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(revoke2Held).toBe(true);

    const activatePromise = controller.activatePlatformPartnerEntry(
      "state-slug-2  ",
      "req-6",
    ).catch(e => { activateResolved = true; throw e; });
    await new Promise((r) => setTimeout(r, 10));
    expect(activateResolved).toBe(false);

    deferRevoke2.resolve();
    await revokePromise2;

    await expect(activatePromise).rejects.toMatchObject({ code: "PARTNER_ENTRY_REVOKED" });
    expect(activateResolved).toBe(true);
    
    // failure preserves prior committed state
    mockRepo.persistChanges.mockRejectedValueOnce(new Error("Update failed"));
    const updateCmdFail = {
      entrySlug: "state-slug-2",
      displayName: "Updated Name Fail",
    };
    await expect(
      controller.updatePlatformPartnerEntry(
        " state-slug-2 ",
        updateCmdFail as any,
        "req-7",
      ),
    ).rejects.toThrow("Update failed");
    
    const entry2 = service
      .listPlatformPartnerEntries()
      .find((e) => e.entrySlug === "state-slug-2")!;
    expect(entry2.displayName).toBe("Partner state-slug-2"); // Still original name
  });

  it("4. Same-entry issue/revoke in both orders, including failed revoke and queued issuance", async () => {
    mockRepo.persistChanges.mockResolvedValue(undefined); // default
    await controller.createPlatformPartnerEntry(
      createCommand("issue-revoke-slug"),
      "req-1",
    );

    // start entry revoke while issue persistence is held
    const deferIssue = new Deferred<void>();
    let issueHeld = false;
    let revokeResolved = false;
    mockRepo.persistChanges.mockImplementationOnce(() => {
      issueHeld = true;
      return deferIssue.promise;
    });

    const issuePromise = controller.issuePlatformPartnerIngressCredential(
      "issue-revoke-slug",
      { purpose: "key1" },
      "req-2",
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(issueHeld).toBe(true);

    const deferRevoke = new Deferred<void>();
    mockRepo.persistChanges.mockImplementationOnce(() => deferRevoke.promise);
    const revokePromise = controller.revokePlatformPartnerEntry(
      "issue-revoke-slug",
      "req-3",
    ).then(() => { revokeResolved = true; });
    await new Promise((r) => setTimeout(r, 10)); // queued on mutex
    expect(revokeResolved).toBe(false);

    deferIssue.resolve();
    await issuePromise;
    expect(revokeResolved).toBe(false); // shouldn't be early response

    deferRevoke.resolve();
    await revokePromise;
    expect(revokeResolved).toBe(true);

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
    let revoke2Held = false;
    let issue2Resolved = false;
    mockRepo.persistChanges.mockImplementationOnce(() => {
      revoke2Held = true;
      return deferRevoke2.promise;
    });
    const revokePromise2 = controller.revokePlatformPartnerEntry(
      "revoke-issue-slug",
      "req-6",
    );
    await new Promise((r) => setTimeout(r, 10)); // allow mutex acquire
    expect(revoke2Held).toBe(true);

    const issuePromise2 = controller.issuePlatformPartnerIngressCredential(
      "revoke-issue-slug",
      { purpose: "key3" },
      "req-7",
    ).catch(e => { issue2Resolved = true; throw e; });
    await new Promise((r) => setTimeout(r, 10)); // allow mutex acquire
    expect(issue2Resolved).toBe(false); // no early response

    deferRevoke2.resolve();
    await revokePromise2;

    await expect(issuePromise2).rejects.toMatchObject({
      code: "PARTNER_ENTRY_REVOKED",
    });
    expect(issue2Resolved).toBe(true);

    // "Add that bounded failure scenario plus explicit no-early-response/publication assertions."
    await controller.createPlatformPartnerEntry(
      createCommand("failed-revoke-slug"),
      "req-8",
    );
    const seedReq = await controller.issuePlatformPartnerIngressCredential(
      "failed-revoke-slug",
      { purpose: "seed" },
      "req-seed",
    );
    const seedKey = seedReq.data.plaintextKey;

    const deferRevoke3 = new Deferred<void>();
    let revoke3Held = false;
    let issue3Resolved = false;
    mockRepo.persistChanges.mockImplementationOnce(() => {
      revoke3Held = true;
      return deferRevoke3.promise;
    });

    const revokePromise3 = controller.revokePlatformPartnerEntry(
      "failed-revoke-slug",
      "req-9",
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(revoke3Held).toBe(true);

    const deferIssue3 = new Deferred<void>();
    mockRepo.persistChanges.mockImplementationOnce(() => deferIssue3.promise);

    const issuePromise3 = controller.issuePlatformPartnerIngressCredential(
      "failed-revoke-slug",
      { purpose: "queued-issue" },
      "req-10",
    ).then(res => { issue3Resolved = true; return res; });
    
    await new Promise((r) => setTimeout(r, 10));
    expect(issue3Resolved).toBe(false);

    deferRevoke3.reject(new Error("Revoke failed"));
    await expect(revokePromise3).rejects.toThrow("Revoke failed");

    deferIssue3.resolve();
    const issueRes3 = await issuePromise3;
    expect(issue3Resolved).toBe(true);

    // usable auth remains
    const authSuccess = service.authenticatePartnerBootstrap(
      { entrySlug: "failed-revoke-slug", apiKey: seedKey },
      "req-auth-check",
    );
    expect(authSuccess.partnerEntry.entrySlug).toBe("failed-revoke-slug");

    // new key works
    const authSuccessNew = service.authenticatePartnerBootstrap(
      { entrySlug: "failed-revoke-slug", apiKey: issueRes3.data.plaintextKey },
      "req-auth-check-new",
    );
    expect(authSuccessNew.partnerEntry.entrySlug).toBe("failed-revoke-slug");
  });

  it("5. Cross-entry issue/issue in both completion orders preserves both keys; issue/other-key-revoke cannot resurrect a revoked key, and real authenticatePartnerBootstrap must reject it", async () => {
    mockRepo.persistChanges.mockResolvedValue(undefined); // Default

    // --- Scenario 1: A/B completion order ---
    await controller.createPlatformPartnerEntry(createCommand("issue-a1"), "req-c1");
    await controller.createPlatformPartnerEntry(createCommand("issue-b1"), "req-c2");

    let deferA1 = new Deferred<void>();
    let deferB1 = new Deferred<void>();
    let a1Held = false;
    let b1Held = false;

    mockRepo.persistChanges.mockImplementation((changes: any) => {
      if (changes.partnerIngressCredentials?.some((c: any) => c.entrySlug === "issue-a1" && c.purpose === "key-a1")) {
        a1Held = true;
        return deferA1.promise;
      }
      if (changes.partnerIngressCredentials?.some((c: any) => c.entrySlug === "issue-b1" && c.purpose === "key-b1")) {
        b1Held = true;
        return deferB1.promise;
      }
      return Promise.resolve();
    });

    const issueA1 = controller.issuePlatformPartnerIngressCredential(
      "issue-a1", { purpose: "key-a1" }, "req-i1"
    );
    const issueB1 = controller.issuePlatformPartnerIngressCredential(
      "issue-b1", { purpose: "key-b1" }, "req-i2"
    );

    await new Promise((r) => setTimeout(r, 10));
    expect(a1Held).toBe(true);
    expect(b1Held).toBe(true);

    deferA1.resolve();
    const resA1 = await issueA1;
    deferB1.resolve();
    const resB1 = await issueB1;

    // Both keys work
    expect(service.authenticatePartnerBootstrap({ entrySlug: "issue-a1", apiKey: resA1.data.plaintextKey }, "r").partnerEntry.entrySlug).toBe("issue-a1");
    expect(service.authenticatePartnerBootstrap({ entrySlug: "issue-b1", apiKey: resB1.data.plaintextKey }, "r").partnerEntry.entrySlug).toBe("issue-b1");

    // --- Scenario 2: B/A completion order ---
    await controller.createPlatformPartnerEntry(createCommand("issue-a2"), "req-c3");
    await controller.createPlatformPartnerEntry(createCommand("issue-b2"), "req-c4");

    let deferA2 = new Deferred<void>();
    let deferB2 = new Deferred<void>();
    let a2Held = false;
    let b2Held = false;

    mockRepo.persistChanges.mockImplementation((changes: any) => {
      if (changes.partnerIngressCredentials?.some((c: any) => c.entrySlug === "issue-a2" && c.purpose === "key-a2")) {
        a2Held = true;
        return deferA2.promise;
      }
      if (changes.partnerIngressCredentials?.some((c: any) => c.entrySlug === "issue-b2" && c.purpose === "key-b2")) {
        b2Held = true;
        return deferB2.promise;
      }
      return Promise.resolve();
    });

    const issueA2 = controller.issuePlatformPartnerIngressCredential(
      "issue-a2", { purpose: "key-a2" }, "req-i3"
    );
    const issueB2 = controller.issuePlatformPartnerIngressCredential(
      "issue-b2", { purpose: "key-b2" }, "req-i4"
    );

    await new Promise((r) => setTimeout(r, 10));
    expect(a2Held).toBe(true);
    expect(b2Held).toBe(true);

    deferB2.resolve();
    const resB2 = await issueB2;
    deferA2.resolve();
    const resA2 = await issueA2;

    expect(service.authenticatePartnerBootstrap({ entrySlug: "issue-a2", apiKey: resA2.data.plaintextKey }, "r").partnerEntry.entrySlug).toBe("issue-a2");
    expect(service.authenticatePartnerBootstrap({ entrySlug: "issue-b2", apiKey: resB2.data.plaintextKey }, "r").partnerEntry.entrySlug).toBe("issue-b2");

    // --- Scenario 3: issue/other-key-revoke cannot resurrect a revoked key ---
    await controller.createPlatformPartnerEntry(createCommand("entry-c"), "req-c5");
    await controller.createPlatformPartnerEntry(createCommand("entry-d"), "req-c6");

    // Seed key for entry D
    mockRepo.persistChanges.mockImplementation(() => Promise.resolve());
    const resDSeed = await controller.issuePlatformPartnerIngressCredential(
      "entry-d", { purpose: "key-d-seed" }, "req-seed-D"
    );
    const apiKeyD = resDSeed.data.plaintextKey;
    const keyIdD = resDSeed.data.credential.keyId;

    // Successful authentication control before revoke
    expect(service.authenticatePartnerBootstrap({ entrySlug: "entry-d", apiKey: apiKeyD }, "req-auth-1").partnerEntry.entrySlug).toBe("entry-d");

    // Hold entry-C issuance while entry-D existing-key revoke commits
    const deferIssueC = new Deferred<void>();
    let cHeld = false;
    let cResolved = false;

    mockRepo.persistChanges.mockImplementation((changes: any) => {
      if (changes.partnerIngressCredentials?.some((c: any) => c.entrySlug === "entry-c" && c.purpose === "key-c")) {
        cHeld = true;
        return deferIssueC.promise;
      }
      return Promise.resolve();
    });

    const issueC = controller.issuePlatformPartnerIngressCredential(
      "entry-c", { purpose: "key-c" }, "req-i5"
    ).then((res) => { cResolved = true; return res; });

    await new Promise((r) => setTimeout(r, 10)); // C acquires mutex
    expect(cHeld).toBe(true);
    expect(cResolved).toBe(false); // Explicit no-early-response

    const revokeD = controller.revokePlatformPartnerIngressCredential(
      "entry-d", keyIdD, {} as any, "req-r1"
    );
    await revokeD; // D is independent, so it completes immediately

    expect(cResolved).toBe(false); // Still not resolved

    deferIssueC.resolve();
    const issueResC = await issueC; 
    expect(cResolved).toBe(true);

    // assert D remains revoked and real authenticatePartnerBootstrap rejects specifically PARTNER_API_KEY_REVOKED
    const credsD = controller.listPlatformPartnerIngressCredentials("entry-d").data.items;
    expect(credsD.find((c: any) => c.keyId === keyIdD)?.status).toBe("revoked");

    try {
      service.authenticatePartnerBootstrap({ entrySlug: "entry-d", apiKey: apiKeyD }, "req-auth-2");
      expect.fail("Should throw");
    } catch (e: any) {
      expect(e.code).toBe("PARTNER_API_KEY_REVOKED");
    }
    
    // state/authentication preservation after rejected writes
    mockRepo.persistChanges.mockRejectedValueOnce(new Error("Failed to revoke C"));
    const keyIdC = issueResC.data.credential.keyId;
    await expect(
      controller.revokePlatformPartnerIngressCredential(
        "entry-c", keyIdC, {} as any, "req-r2"
      )
    ).rejects.toThrow("Failed to revoke C");

    // C's key should still be active because revoke failed
    const apiKeyC = issueResC.data.plaintextKey;
    expect(service.authenticatePartnerBootstrap({ entrySlug: "entry-c", apiKey: apiKeyC }, "req-auth-3").partnerEntry.entrySlug).toBe("entry-c");
  });
});
