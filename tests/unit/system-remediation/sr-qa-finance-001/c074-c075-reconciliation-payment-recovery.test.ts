import { describe, expect, it } from "vitest";

import type { ForwarderReconciliationIssue } from "@drts/contracts";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.service";

function createService(forwarderIssues: ForwarderReconciliationIssue[] = []) {
  const auditNotificationService = new AuditNotificationService();
  return new BillingSettlementService(auditNotificationService, undefined, {
    listReconciliationIssues: () => forwarderIssues,
  } as any);
}

describe("SR-QA-FINANCE-001 - C074 & C075: 支付訂單、Reconciliation 案件查詢與 Payment Recovery", () => {
  describe("1. C074: Reconciliation Issue Lifecycle & Querying", () => {
    it("creates a reconciliation issue with initial assignment, status and evidence artifacts", async () => {
      const service = createService();

      const created = await service.createReconciliationIssue({
        issueType: "partner_sponsor_mismatch",
        summary: "Bank sponsor benefit statement variance detected during month-end reconcile",
        openedBy: "fin-ops-lead-01",
        assigneeId: "fin-investigator-01",
        partnerId: "partner-bank-demo-001",
        partnerProgramId: "program-airport-platinum",
        sponsorReference: "sponsor-ref-qa-901",
        orderId: "ord-qa-fin-901",
        comment: "Discrepancy of 300 NTD identified against bank settlement file.",
        artifactIds: ["art-bank-stmt-202606-raw"],
      });

      expect(created.issueId).toBeDefined();
      expect(created.status).toBe("assigned");
      expect(created.ownerId).toBe("fin-investigator-01");
      expect(created.evidenceArtifactIds).toContain("art-bank-stmt-202606-raw");
      expect(created.comments).toHaveLength(1);
      expect(created.comments[0]!.message).toContain("Discrepancy of 300 NTD");
    });

    it("executes assignment, comment addition, resolution, and reopening transitions", async () => {
      const service = createService();

      // Create issue
      const issue = await service.createReconciliationIssue({
        issueType: "partner_sponsor_mismatch",
        summary: "Platform gross calculation differs from partner report",
        openedBy: "fin-auditor-01",
        comment: "Initial audit discrepancy",
      });
      expect(issue.status).toBe("open");

      // Reassign
      const assigned = await service.assignReconciliationIssue(issue.issueId, {
        assigneeId: "settlement-specialist-02",
        actorId: "fin-manager-01",
        note: "Assigned to specialist for partner reconciliation review.",
      });
      expect(assigned.status).toBe("assigned");
      expect(assigned.ownerId).toBe("settlement-specialist-02");
      expect(assigned.comments.at(-1)?.message).toContain("Assigned to specialist");

      // Comment and append evidence artifact
      const commented = await service.addReconciliationIssueComment(issue.issueId, {
        actorId: "settlement-specialist-02",
        message: "Attached revised partner settlement ledger.",
        artifactIds: ["art-partner-ledger-v2"],
      });
      expect(commented.evidenceArtifactIds).toContain("art-partner-ledger-v2");

      // Resolve issue
      const resolved = await service.resolveReconciliationIssue(issue.issueId, {
        actorId: "settlement-specialist-02",
        resolutionCode: "sponsor_corrected",
        resolutionSummary: "Partner re-issued ledger matching platform figures.",
        artifactIds: ["art-partner-signoff"],
      });
      expect(resolved.status).toBe("resolved");
      expect(resolved.resolutionCode).toBe("sponsor_corrected");
      expect(resolved.resolvedAt).not.toBeNull();

      // Reopen issue
      const reopened = await service.reopenReconciliationIssue(issue.issueId, {
        actorId: "fin-auditor-01",
        reason: "Secondary bank audit flagged recurring timing mismatch.",
        artifactIds: ["art-reopen-audit-evidence"],
      });
      expect(reopened.status).toBe("reopened");
      expect(reopened.reopenCount).toBe(1);
      expect(reopened.resolutionCode).toBeNull();
      expect(reopened.resolvedAt).toBeNull();
      expect(reopened.comments.at(-1)?.message).toContain("Secondary bank audit");
    });

    it("derives forwarder sync discrepancies into finance reconciliation queue with shadow ledger context", () => {
      const forwarderIssue: ForwarderReconciliationIssue = {
        reconciliationJob: {
          reconciliationJobId: "recon-forwarder-qa-001",
          mirrorOrderId: "mirror-ord-qa-001",
          platformCode: "grab_taiwan",
          externalOrderId: "grab-order-qa-12345",
          status: "queued",
          reason: "sync_failed",
          mismatchCount: 1,
          notes: "Grab Taiwan shadow order status diverged from upstream.",
          createdAt: "2026-06-01T12:00:00Z",
          completedAt: null,
        },
        mirrorOrderId: "mirror-ord-qa-001",
        platformCode: "grab_taiwan",
        externalOrderId: "grab-order-qa-12345",
        status: "sync_failed",
        acceptedDriverId: "drv-fwd-qa-001",
        lastSyncError: {
          code: "FORWARDER_ACCEPT_RELAY_FAILED",
          message: "Upstream accept relay failed.",
          retryable: true,
          failedAt: "2026-06-01T12:05:00Z",
          nativeStatus: "DRIVER_RELAY_ERROR",
          payload: {},
        },
        financeContext: {
          fareAuthority: "external_platform",
          settlementAuthority: "external_platform",
          driverPayoutAuthority: "external_platform",
          localLedgerMode: "shadow_only",
        },
        manualFallback: {
          required: true,
          reason: "sync_failed",
          requestedAt: "2026-06-01T12:05:00Z",
          requestedBy: "ops-system",
          notes: "Manual coordination required with forwarder platform.",
        },
        createdAt: "2026-06-01T12:00:00Z",
        updatedAt: "2026-06-01T12:05:00Z",
      };

      const service = createService([forwarderIssue]);
      const issues = service.listReconciliationIssues({
        issueType: "forwarder_status_mismatch",
      });

      expect(issues).toHaveLength(1);
      expect(issues[0]!.channelKey).toBe("forwarded_shadow");
      expect(issues[0]!.forwardedFinanceContext?.platformCode).toBe("grab_taiwan");
      expect(issues[0]!.forwardedFinanceContext?.localLedgerMode).toBe("shadow_only");
      expect(issues[0]!.forwardedFinanceContext?.driverPayoutAuthority).toBe("external_platform");
    });
  });

  describe("2. C075: Payment Recovery Execution & Defense Guards", () => {
    it("rejects payment recovery execution when orderId is empty or missing", async () => {
      const service = createService();
      await expect(
        service.executeMultiTaxiPaymentRecovery(
          "",
          "retry_charge",
          {},
          {
            actorId: "fin-admin-01",
            realm: "platform",
            scopes: ["billing:write"],
          } as any,
          { idempotencyKey: "idem-qa-001" },
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: "PAYMENT_EXCEPTION_ORDER_ID_REQUIRED",
      });
    });

    it("rejects payment recovery execution when action value is invalid", async () => {
      const service = createService();
      await expect(
        service.executeMultiTaxiPaymentRecovery(
          "ord-qa-901",
          "unsupported_action",
          {},
          {
            actorId: "fin-admin-01",
            realm: "platform",
            scopes: ["billing:write"],
          } as any,
          { idempotencyKey: "idem-qa-001" },
        ),
      ).rejects.toMatchObject({
        status: 404,
        code: "PAYMENT_RECOVERY_ACTION_NOT_SUPPORTED",
      });
    });

    it("rejects payment recovery when caller lacks platform realm or billing:write authority", async () => {
      const service = createService();

      // Driver realm caller
      await expect(
        service.executeMultiTaxiPaymentRecovery(
          "ord-qa-901",
          "retry_capture",
          {},
          {
            actorId: "drv-01",
            realm: "driver",
            scopes: ["billing:read"],
          } as any,
          { idempotencyKey: "idem-qa-002" },
        ),
      ).rejects.toMatchObject({
        status: 403,
        code: "PAYMENT_RECOVERY_WRITE_AUTHORITY_REQUIRED",
      });

      // Platform realm caller but missing billing:write scope
      await expect(
        service.executeMultiTaxiPaymentRecovery(
          "ord-qa-901",
          "retry_capture",
          {},
          {
            actorId: "fin-viewer-01",
            realm: "platform",
            scopes: ["billing:read"],
          } as any,
          { idempotencyKey: "idem-qa-003" },
        ),
      ).rejects.toMatchObject({
        status: 403,
        code: "PAYMENT_RECOVERY_WRITE_AUTHORITY_REQUIRED",
      });
    });

    it("enforces durable Idempotency-Key validation (required and max 255 chars)", async () => {
      const service = createService();

      // Missing idempotency key
      await expect(
        service.executeMultiTaxiPaymentRecovery(
          "ord-qa-901",
          "retry_capture",
          {},
          {
            actorId: "fin-admin-01",
            realm: "platform",
            scopes: ["billing:write"],
          } as any,
          {},
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: "IDEMPOTENCY_KEY_REQUIRED",
      });

      // Exceeding 255 chars
      const excessivelyLongKey = "k".repeat(256);
      await expect(
        service.executeMultiTaxiPaymentRecovery(
          "ord-qa-901",
          "retry_capture",
          {},
          {
            actorId: "fin-admin-01",
            realm: "platform",
            scopes: ["billing:write"],
          } as any,
          { idempotencyKey: excessivelyLongKey },
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: "IDEMPOTENCY_KEY_INVALID",
      });
    });

    it("fails honestly when persistence repository or recovery provider is unconfigured", async () => {
      const service = createService();

      // When DB repository is disabled/in-memory, service does not pretend real banking execution
      await expect(
        service.executeMultiTaxiPaymentRecovery(
          "ord-qa-901",
          "retry_capture",
          {},
          {
            actorId: "fin-admin-01",
            realm: "platform",
            scopes: ["billing:write"],
          } as any,
          { idempotencyKey: "idem-qa-valid-001" },
        ),
      ).rejects.toMatchObject({
        status: 503,
        code: "PAYMENT_RECOVERY_AUTHORITY_UNAVAILABLE",
      });
    });
  });
});
