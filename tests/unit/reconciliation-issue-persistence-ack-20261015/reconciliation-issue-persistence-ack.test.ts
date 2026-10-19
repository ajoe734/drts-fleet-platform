import { describe, expect, it } from "vitest";

import type { ReconciliationIssueRecord } from "@drts/contracts";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import type {
  BillingSettlementRepository,
  BillingSettlementState,
  PersistBillingSettlementChanges,
} from "../../../apps/api/src/modules/billing-settlement/billing-settlement.repository";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";

/**
 * Mocks only the external persistence/socket boundary that the real
 * `BillingSettlementRepository` sits in front of -- never the service's own
 * staging/publication logic under test. `failNextPersist` models a single
 * rejected canonical write; `holdNextPersist()` models a write that is still
 * in flight; `rows` models the durable store a fresh instance reloads from.
 */
class FlakyReconciliationIssueRepository {
  private readonly rows = new Map<string, ReconciliationIssueRecord>();
  failNextPersist = false;
  private pendingHold: Promise<void> | null = null;

  isEnabled() {
    return true;
  }

  async loadState(): Promise<BillingSettlementState> {
    return {
      tenantBillingProfiles: [],
      tenantInvoices: [],
      driverFeePlans: [],
      driverStatements: [],
      reimbursementBatches: [],
      reconciliationIssues: [...this.rows.values()],
      fulfillmentSegments: [],
      sandboxBillingTreatments: [],
    };
  }

  holdNextPersist(): () => void {
    let release: () => void = () => {};
    this.pendingHold = new Promise<void>((resolve) => {
      release = resolve;
    });
    return release;
  }

  async persistChanges(changes: PersistBillingSettlementChanges) {
    if (this.pendingHold) {
      const hold = this.pendingHold;
      this.pendingHold = null;
      await hold;
    }
    if (this.failNextPersist) {
      this.failNextPersist = false;
      throw new Error("reconciliation issue persistence rejected");
    }
    for (const issue of changes.reconciliationIssues ?? []) {
      this.rows.set(issue.issueId, { ...issue });
    }
  }

  reportPersistenceFailure() {
    // Production repository only logs here; nothing for a caller to await.
  }
}

function createHarness() {
  const repository = new FlakyReconciliationIssueRepository();
  const auditNotificationService = new AuditNotificationService();
  const service = new BillingSettlementService(
    auditNotificationService,
    repository as unknown as BillingSettlementRepository,
  );
  return { repository, auditNotificationService, service };
}

function auditCountFor(
  auditNotificationService: AuditNotificationService,
  actionName: string,
  resourceId: string,
) {
  return auditNotificationService
    .getAuditLogsSnapshot()
    .filter(
      (log) => log.actionName === actionName && log.resourceId === resourceId,
    ).length;
}

async function reloadIssue(
  repository: FlakyReconciliationIssueRepository,
  issueId: string,
) {
  const freshInstance = new BillingSettlementService(
    new AuditNotificationService(),
    repository as unknown as BillingSettlementRepository,
  );
  await freshInstance.onModuleInit();
  return freshInstance
    .listReconciliationIssues()
    .find((issue) => issue.issueId === issueId);
}

async function seedIssue(
  service: BillingSettlementService,
  summary = "Lifecycle seed issue",
) {
  return service.createReconciliationIssue({
    issueType: "partner_sponsor_mismatch",
    summary,
    openedBy: "fin-ops-ack-seed",
  });
}

async function codeOf(call: () => unknown): Promise<string> {
  try {
    await call();
  } catch (error) {
    return (error as ApiRequestError).code;
  }
  throw new Error("expected the call to throw");
}

describe("RECONCILIATION-ISSUE-PERSISTENCE-ACK-20261015: canonical ACK required before shared read-visible publication", () => {
  describe("createReconciliationIssue", () => {
    it("exposes no phantom issue when persistence is rejected; a healthy retry publishes the exact result and a fresh reload agrees", async () => {
      const { repository, auditNotificationService, service } =
        createHarness();
      const before = service.listReconciliationIssues();

      repository.failNextPersist = true;
      await expect(
        service.createReconciliationIssue({
          issueType: "partner_sponsor_mismatch",
          summary: "ACK-gap create probe",
          openedBy: "fin-ops-ack-01",
          assigneeId: "fin-investigator-ack-01",
          comment: "Initial note",
          artifactIds: ["art-ack-create-1"],
        }),
      ).rejects.toThrow(/persistence rejected/);

      const afterFailure = service.listReconciliationIssues();
      expect(afterFailure).toEqual(before);
      expect(
        afterFailure.find((issue) => issue.summary === "ACK-gap create probe"),
      ).toBeUndefined();
      expect(
        auditNotificationService
          .getAuditLogsSnapshot()
          .some((log) => log.actionName === "create_reconciliation_issue"),
      ).toBe(false);

      const created = await service.createReconciliationIssue({
        issueType: "partner_sponsor_mismatch",
        summary: "ACK-gap create probe",
        openedBy: "fin-ops-ack-01",
        assigneeId: "fin-investigator-ack-01",
        comment: "Initial note",
        artifactIds: ["art-ack-create-1"],
      });

      expect(created.status).toBe("assigned");
      expect(created.ownerId).toBe("fin-investigator-ack-01");
      expect(created.evidenceArtifactIds).toContain("art-ack-create-1");
      expect(created.comments).toHaveLength(1);
      expect(
        service
          .listReconciliationIssues()
          .some((issue) => issue.issueId === created.issueId),
      ).toBe(true);
      expect(
        auditCountFor(
          auditNotificationService,
          "create_reconciliation_issue",
          created.issueId,
        ),
      ).toBe(1);

      const reloaded = await reloadIssue(repository, created.issueId);
      expect(reloaded).toMatchObject({
        summary: created.summary,
        status: created.status,
        ownerId: created.ownerId,
        evidenceArtifactIds: created.evidenceArtifactIds,
      });
      expect(reloaded?.comments).toHaveLength(1);
    });
  });

  describe("assignReconciliationIssue", () => {
    it("rejected persistence leaves ownerId/status/comments unchanged; ACK publishes the exact staged result without a duplicate note", async () => {
      const { repository, auditNotificationService, service } =
        createHarness();
      const issue = await seedIssue(service);
      const beforeSnapshot = service
        .listReconciliationIssues()
        .find((candidate) => candidate.issueId === issue.issueId);

      repository.failNextPersist = true;
      await expect(
        service.assignReconciliationIssue(issue.issueId, {
          assigneeId: "settlement-specialist-ack-01",
          actorId: "fin-manager-ack-01",
          note: "Assigning for review",
        }),
      ).rejects.toThrow(/persistence rejected/);

      const afterFailure = service
        .listReconciliationIssues()
        .find((candidate) => candidate.issueId === issue.issueId);
      expect(afterFailure).toEqual(beforeSnapshot);
      expect(afterFailure?.ownerId).toBeNull();
      expect(afterFailure?.comments).toHaveLength(0);
      expect(
        auditCountFor(
          auditNotificationService,
          "assign_reconciliation_issue",
          issue.issueId,
        ),
      ).toBe(0);

      const assigned = await service.assignReconciliationIssue(issue.issueId, {
        assigneeId: "settlement-specialist-ack-01",
        actorId: "fin-manager-ack-01",
        note: "Assigning for review",
      });
      expect(assigned.ownerId).toBe("settlement-specialist-ack-01");
      expect(assigned.status).toBe("assigned");
      expect(assigned.comments).toHaveLength(1);
      expect(assigned.comments.at(-1)?.message).toBe("Assigning for review");
      expect(
        auditCountFor(
          auditNotificationService,
          "assign_reconciliation_issue",
          issue.issueId,
        ),
      ).toBe(1);

      const reloaded = await reloadIssue(repository, issue.issueId);
      expect(reloaded).toMatchObject({
        ownerId: "settlement-specialist-ack-01",
        status: "assigned",
      });
      expect(reloaded?.comments).toHaveLength(1);
    });

    it("still denies reassigning a resolved issue before reopen (original authority regression)", async () => {
      const { service } = createHarness();
      const issue = await seedIssue(service);
      await service.resolveReconciliationIssue(issue.issueId, {
        actorId: "settlement-specialist-ack-02",
        resolutionCode: "no_action_required",
        resolutionSummary: "Nothing further required.",
      });

      const code = await codeOf(() =>
        service.assignReconciliationIssue(issue.issueId, {
          assigneeId: "someone-else",
          actorId: "fin-manager-ack-02",
        }),
      );
      expect(code).toBe("RECONCILIATION_ISSUE_RESOLVED");
    });
  });

  describe("addReconciliationIssueComment", () => {
    it("rejected persistence leaves comments/evidence unchanged; ACK publishes the exact staged comment and evidence, no duplicate", async () => {
      const { repository, auditNotificationService, service } =
        createHarness();
      const issue = await seedIssue(service);

      repository.failNextPersist = true;
      await expect(
        service.addReconciliationIssueComment(issue.issueId, {
          actorId: "settlement-specialist-ack-03",
          message: "Attached revised partner ledger.",
          artifactIds: ["art-ack-comment-1"],
        }),
      ).rejects.toThrow(/persistence rejected/);

      const afterFailure = service
        .listReconciliationIssues()
        .find((candidate) => candidate.issueId === issue.issueId);
      expect(afterFailure?.comments).toHaveLength(0);
      expect(afterFailure?.evidenceArtifactIds).toEqual([]);
      expect(
        auditCountFor(
          auditNotificationService,
          "add_reconciliation_issue_comment",
          issue.issueId,
        ),
      ).toBe(0);

      const commented = await service.addReconciliationIssueComment(
        issue.issueId,
        {
          actorId: "settlement-specialist-ack-03",
          message: "Attached revised partner ledger.",
          artifactIds: ["art-ack-comment-1"],
        },
      );
      expect(commented.comments).toHaveLength(1);
      expect(commented.evidenceArtifactIds).toEqual(["art-ack-comment-1"]);
      expect(
        auditCountFor(
          auditNotificationService,
          "add_reconciliation_issue_comment",
          issue.issueId,
        ),
      ).toBe(1);

      const reloaded = await reloadIssue(repository, issue.issueId);
      expect(reloaded?.comments).toHaveLength(1);
      expect(reloaded?.evidenceArtifactIds).toEqual(["art-ack-comment-1"]);
    });
  });

  describe("resolveReconciliationIssue", () => {
    it("rejected persistence leaves status/resolution unchanged; ACK publishes the exact staged resolution", async () => {
      const { repository, auditNotificationService, service } =
        createHarness();
      const issue = await seedIssue(service);

      repository.failNextPersist = true;
      await expect(
        service.resolveReconciliationIssue(issue.issueId, {
          actorId: "settlement-specialist-ack-04",
          resolutionCode: "sponsor_corrected",
          resolutionSummary: "Partner re-issued ledger matching figures.",
          artifactIds: ["art-ack-resolve-1"],
        }),
      ).rejects.toThrow(/persistence rejected/);

      const afterFailure = service
        .listReconciliationIssues()
        .find((candidate) => candidate.issueId === issue.issueId);
      expect(afterFailure?.status).toBe("open");
      expect(afterFailure?.resolutionCode).toBeNull();
      expect(afterFailure?.resolvedAt).toBeNull();
      expect(afterFailure?.comments).toHaveLength(0);
      expect(
        auditCountFor(
          auditNotificationService,
          "resolve_reconciliation_issue",
          issue.issueId,
        ),
      ).toBe(0);

      const resolved = await service.resolveReconciliationIssue(
        issue.issueId,
        {
          actorId: "settlement-specialist-ack-04",
          resolutionCode: "sponsor_corrected",
          resolutionSummary: "Partner re-issued ledger matching figures.",
          artifactIds: ["art-ack-resolve-1"],
        },
      );
      expect(resolved.status).toBe("resolved");
      expect(resolved.resolutionCode).toBe("sponsor_corrected");
      expect(resolved.resolvedAt).not.toBeNull();
      expect(resolved.comments).toHaveLength(1);
      expect(
        auditCountFor(
          auditNotificationService,
          "resolve_reconciliation_issue",
          issue.issueId,
        ),
      ).toBe(1);

      const reloaded = await reloadIssue(repository, issue.issueId);
      expect(reloaded).toMatchObject({
        status: "resolved",
        resolutionCode: "sponsor_corrected",
      });
      expect(reloaded?.comments).toHaveLength(1);
    });
  });

  describe("reopenReconciliationIssue", () => {
    it("rejected persistence leaves status/reopenCount unchanged; ACK publishes the exact staged reopen without double counting", async () => {
      const { repository, auditNotificationService, service } =
        createHarness();
      const issue = await seedIssue(service);
      await service.resolveReconciliationIssue(issue.issueId, {
        actorId: "settlement-specialist-ack-05",
        resolutionCode: "no_action_required",
        resolutionSummary: "Initially closed in error.",
      });

      repository.failNextPersist = true;
      await expect(
        service.reopenReconciliationIssue(issue.issueId, {
          actorId: "fin-manager-ack-05",
          reason: "Customer disputed the closure.",
          artifactIds: ["art-ack-reopen-1"],
        }),
      ).rejects.toThrow(/persistence rejected/);

      const afterFailure = service
        .listReconciliationIssues()
        .find((candidate) => candidate.issueId === issue.issueId);
      expect(afterFailure?.status).toBe("resolved");
      expect(afterFailure?.reopenCount).toBe(0);
      expect(afterFailure?.comments).toHaveLength(1);
      expect(
        auditCountFor(
          auditNotificationService,
          "reopen_reconciliation_issue",
          issue.issueId,
        ),
      ).toBe(0);

      const reopened = await service.reopenReconciliationIssue(
        issue.issueId,
        {
          actorId: "fin-manager-ack-05",
          reason: "Customer disputed the closure.",
          artifactIds: ["art-ack-reopen-1"],
        },
      );
      expect(reopened.status).toBe("reopened");
      expect(reopened.reopenCount).toBe(1);
      expect(reopened.resolutionCode).toBeNull();
      expect(reopened.comments).toHaveLength(2);
      expect(
        auditCountFor(
          auditNotificationService,
          "reopen_reconciliation_issue",
          issue.issueId,
        ),
      ).toBe(1);

      const reloaded = await reloadIssue(repository, issue.issueId);
      expect(reloaded).toMatchObject({ status: "reopened", reopenCount: 1 });
      expect(reloaded?.comments).toHaveLength(2);
    });

    it("still denies reopening an issue that is not resolved (original authority regression)", async () => {
      const { service } = createHarness();
      const issue = await seedIssue(service);

      const code = await codeOf(() =>
        service.reopenReconciliationIssue(issue.issueId, {
          actorId: "fin-manager-ack-06",
          reason: "Trying to reopen an open issue.",
        }),
      );
      expect(code).toBe("RECONCILIATION_ISSUE_NOT_RESOLVED");
    });
  });

  describe("concurrent independent issue changes", () => {
    it("an in-flight assign write on issue A does not block a concurrently created, independent issue B", async () => {
      const { repository, service } = createHarness();
      const issueA = await seedIssue(service, "Concurrency issue A");

      const release = repository.holdNextPersist();
      const assignPromise = service.assignReconciliationIssue(
        issueA.issueId,
        {
          assigneeId: "specialist-concurrent-01",
          actorId: "manager-concurrent-01",
        },
      );

      const issueB = await service.createReconciliationIssue({
        issueType: "partner_sponsor_mismatch",
        summary: "Concurrency issue B",
        openedBy: "fin-ops-concurrent-01",
      });

      expect(
        service
          .listReconciliationIssues()
          .some((issue) => issue.issueId === issueB.issueId),
      ).toBe(true);
      expect(
        service
          .listReconciliationIssues()
          .find((issue) => issue.issueId === issueA.issueId)?.status,
      ).toBe("open");

      release();
      const assigned = await assignPromise;
      expect(assigned.status).toBe("assigned");
      expect(
        service
          .listReconciliationIssues()
          .some((issue) => issue.issueId === issueB.issueId),
      ).toBe(true);
    });

    it("serializes two concurrent comments on the SAME issue so the second starts from the first's acknowledged state instead of clobbering it", async () => {
      const { repository, service } = createHarness();
      const issue = await seedIssue(service, "Same-issue concurrency");

      const release = repository.holdNextPersist();
      const firstCommentPromise = service.addReconciliationIssueComment(
        issue.issueId,
        { actorId: "specialist-serial-01", message: "First concurrent comment" },
      );
      const secondCommentPromise = service.addReconciliationIssueComment(
        issue.issueId,
        {
          actorId: "specialist-serial-02",
          message: "Second concurrent comment",
        },
      );

      release();
      const [first, second] = await Promise.all([
        firstCommentPromise,
        secondCommentPromise,
      ]);

      expect(first.comments).toHaveLength(1);
      expect(second.comments).toHaveLength(2);
      expect(second.comments.map((comment) => comment.message)).toEqual([
        "First concurrent comment",
        "Second concurrent comment",
      ]);

      const reloaded = await reloadIssue(repository, issue.issueId);
      expect(reloaded?.comments).toHaveLength(2);
    });
  });

  describe("noDB/demo mode preserved (no repository configured)", () => {
    it("still runs the full create/assign/comment/resolve/reopen lifecycle synchronously with no repository", async () => {
      const service = new BillingSettlementService(
        new AuditNotificationService(),
      );

      const issue = await service.createReconciliationIssue({
        issueType: "partner_sponsor_mismatch",
        summary: "noDB lifecycle issue",
        openedBy: "fin-ops-nodb-01",
      });
      expect(issue.status).toBe("open");

      const assigned = await service.assignReconciliationIssue(
        issue.issueId,
        { assigneeId: "specialist-nodb-01", actorId: "manager-nodb-01" },
      );
      expect(assigned.status).toBe("assigned");

      const commented = await service.addReconciliationIssueComment(
        issue.issueId,
        { actorId: "specialist-nodb-01", message: "Reviewing." },
      );
      expect(commented.comments).toHaveLength(1);

      const resolved = await service.resolveReconciliationIssue(
        issue.issueId,
        {
          actorId: "specialist-nodb-01",
          resolutionCode: "no_action_required",
          resolutionSummary: "Resolved in noDB mode.",
        },
      );
      expect(resolved.status).toBe("resolved");

      const reopened = await service.reopenReconciliationIssue(
        issue.issueId,
        { actorId: "manager-nodb-01", reason: "Reopening in noDB mode." },
      );
      expect(reopened.status).toBe("reopened");
      expect(reopened.reopenCount).toBe(1);
    });
  });
});
