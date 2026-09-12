import { describe, expect, it } from "vitest";

import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.service";

function createService() {
  const auditNotificationService = new AuditNotificationService();
  return {
    service: new BillingSettlementService(auditNotificationService, undefined, {
      listReconciliationIssues: () => [],
    } as any),
    auditNotificationService,
  };
}

function driverIdentity(driverId: string): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "driver_user",
    actorId: driverId,
    realm: "driver",
    tenantId: null,
    roleFamilies: ["driver"],
    roles: ["driver"],
    scopes: ["driver:write"],
    requestId: null,
  };
}

function platformFinanceIdentity(actorId = "fin-admin-qa"): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "platform_admin",
    actorId,
    realm: "platform",
    tenantId: null,
    roleFamilies: ["platform"],
    roles: ["platform_admin"],
    scopes: ["billing:write", "reimbursement:write"],
    requestId: null,
  };
}

describe("SR-QA-FINANCE-001 - C080 & C081: 代墊批次、核准、匯款證明與付款狀態", () => {
  describe("1. C080: 代墊批次生命週期與核准保護", () => {
    it("generates reimbursement batch for platform-funded discounts and supports maker-checker approval", async () => {
      const { service } = createService();

      await service.publishDriverFeePlan({
        planName: "QA Platform Funded Fee Plan",
        version: "qa-fee-2026-03",
        serviceFeeBps: 1000,
        reimbursementMode: "platform_funded",
      });

      await service.generateDriverStatements({
        periodMonth: "2026-03",
      });

      const batches = service.listReimbursementBatches();
      expect(batches.length).toBeGreaterThan(0);
      const batch = batches[0]!;
      expect(batch.batchId).toBeDefined();
      expect(batch.status).toBe("pending");
      expect(batch.approvedAt).toBeNull();
      expect(batch.totalAmount.amountMinor).toBeGreaterThan(0);

      // Approve batch
      const approved = await service.approveReimbursementBatch(batch.batchId, {
        statementId: batch.statementId,
      });
      expect(approved.approvedAt).not.toBeNull();
    });

    it("rejects batch approval when statementId does not match", async () => {
      const { service } = createService();

      await service.publishDriverFeePlan({
        planName: "QA Fee Plan",
        version: "qa-fee-2026-03",
        serviceFeeBps: 1000,
        reimbursementMode: "platform_funded",
      });
      await service.generateDriverStatements({ periodMonth: "2026-03" });

      const batch = service.listReimbursementBatches()[0]!;
      await expect(
        service.approveReimbursementBatch(batch.batchId, {
          statementId: "mismatched-statement-id-999",
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });
    });

    it("rejects marking unapproved batch as paid", async () => {
      const { service } = createService();

      await service.publishDriverFeePlan({
        planName: "QA Fee Plan",
        version: "qa-fee-2026-03",
        serviceFeeBps: 1000,
        reimbursementMode: "platform_funded",
      });
      await service.generateDriverStatements({ periodMonth: "2026-03" });

      const batch = service.listReimbursementBatches()[0]!;
      expect(batch.approvedAt).toBeNull();

      expect(() =>
        service.markReimbursementPaid(batch.batchId, {
          remittanceProofId: "proof-test-01",
        }),
      ).toThrowError();
    });
  });

  describe("2. C081: 上傳與查驗匯款證明原檔 (N09)", () => {
    it("enforces driver ownership boundary: rejects foreign driver proof upload", async () => {
      const { service } = createService();

      await service.publishDriverFeePlan({
        planName: "QA Fee Plan",
        version: "qa-fee-2026-03",
        serviceFeeBps: 1000,
        reimbursementMode: "platform_funded",
      });
      await service.generateDriverStatements({ periodMonth: "2026-03" });

      const batch = service.listReimbursementBatches()[0]!;
      const targetDriverId = batch.driverId;
      const attackerDriverId = `attacker-${targetDriverId}`;

      const staged = await service.stageRemittanceProofContent(
        Buffer.from("test payment slip image"),
        "image/png",
      );

      await expect(
        service.uploadRemittanceProof(
          {
            batchId: batch.batchId,
            originalFilename: "remittance_slip.png",
            contentType: "image/png",
            sizeBytes: 21,
            stagedContentRef: staged.stagedContentRef,
          },
          driverIdentity(attackerDriverId),
        ),
      ).rejects.toMatchObject({
        status: 403,
        code: "REMITTANCE_PROOF_BATCH_OWNERSHIP_VIOLATION",
      });
    });

    it("enforces fail-closed scan policy: rejects payment when proof is in pending_scan state", async () => {
      const { service } = createService();

      await service.publishDriverFeePlan({
        planName: "QA Fee Plan",
        version: "qa-fee-2026-03",
        serviceFeeBps: 1000,
        reimbursementMode: "platform_funded",
      });
      await service.generateDriverStatements({ periodMonth: "2026-03" });

      const batch = service.listReimbursementBatches()[0]!;
      await service.approveReimbursementBatch(batch.batchId, {
        statementId: batch.statementId,
      });

      const staged = await service.stageRemittanceProofContent(
        Buffer.from("bank payment confirmation receipt"),
        "image/png",
      );
      const uploaded = await service.uploadRemittanceProof(
        {
          batchId: batch.batchId,
          originalFilename: "slip.png",
          contentType: "image/png",
          sizeBytes: 32,
          stagedContentRef: staged.stagedContentRef,
        },
        driverIdentity(batch.driverId),
      );

      // Default scanState is pending_scan
      expect(uploaded.scanState).toBe("pending_scan");

      // Attempting to pay with unscanned proof must be rejected with 409 REMITTANCE_PROOF_NOT_CLEAN
      await expect(
        service.markReimbursementPaidWithProof(
          batch.batchId,
          {
            batchId: batch.batchId,
            proofId: uploaded.proofId,
            idempotencyKey: "idem-unscanned-001",
            paidAt: "2026-03-31T15:00:00.000Z",
          },
          platformFinanceIdentity(),
        ),
      ).rejects.toMatchObject({
        status: 409,
        code: "REMITTANCE_PROOF_NOT_CLEAN",
      });
    });

    it("verifies clean scan verification, readback grant, and payment receipt completion", async () => {
      const { service } = createService();

      await service.publishDriverFeePlan({
        planName: "QA Fee Plan",
        version: "qa-fee-2026-03",
        serviceFeeBps: 1000,
        reimbursementMode: "platform_funded",
      });
      await service.generateDriverStatements({ periodMonth: "2026-03" });

      const batch = service.listReimbursementBatches()[0]!;
      await service.approveReimbursementBatch(batch.batchId, {
        statementId: batch.statementId,
      });

      const fileBytes = Buffer.from("bank remittance transaction proof 123456789");
      const staged = await service.stageRemittanceProofContent(
        fileBytes,
        "image/png",
      );

      const uploaded = await service.uploadRemittanceProof(
        {
          batchId: batch.batchId,
          originalFilename: "remittance_202603.png",
          contentType: "image/png",
          sizeBytes: fileBytes.length,
          stagedContentRef: staged.stagedContentRef,
        },
        driverIdentity(batch.driverId),
      );

      expect(uploaded.proofId).toBeDefined();
      expect(uploaded.batchId).toBe(batch.batchId);
      expect(uploaded.driverId).toBe(batch.driverId);
      expect(uploaded.originalFilename).toBe("remittance_202603.png");
      expect(uploaded.content.contentHash).toMatch(/^[a-f0-9]{64}$/);

      // Verify readback grant
      const grant = await service.requestRemittanceProofReadback(
        { proofId: uploaded.proofId },
        platformFinanceIdentity(),
      );
      expect(grant.proofId).toBe(uploaded.proofId);
      expect(grant.expiresAt).toBeDefined();
      expect(grant.readbackUrl).toBeDefined();

      // Simulate clean scan verdict via test escape hatch
      const proofRecord = (service as any).remittanceProofService.proofs.find(
        (p: any) => p.proofId === uploaded.proofId,
      );
      if (proofRecord) {
        proofRecord.scanState = "clean";
        proofRecord.scanCompletedAt = new Date().toISOString();
      }

      // Mark batch paid with proof
      const receipt = await service.markReimbursementPaidWithProof(
        batch.batchId,
        {
          batchId: batch.batchId,
          proofId: uploaded.proofId,
          idempotencyKey: "idem-remittance-pay-001",
          paidAt: "2026-03-31T15:00:00.000Z",
        },
        platformFinanceIdentity(),
      );

      expect(receipt.receiptId).toBeDefined();
      expect(receipt.batchId).toBe(batch.batchId);
      expect(receipt.proofId).toBe(uploaded.proofId);
      expect(receipt.idempotencyKey).toBe("idem-remittance-pay-001");
      expect(receipt.paidAt).toBe("2026-03-31T15:00:00.000Z");

      // Verify batch and statement state updated to paid
      const updatedBatch = service.getReimbursementBatch(batch.batchId);
      expect(updatedBatch.status).toBe("paid");
      expect(updatedBatch.remittanceProofId).toBe(uploaded.proofId);

      const allStatements = await service.listDriverStatements();
      const linkedStatement = allStatements.find(
        (s) => s.statementId === batch.statementId,
      );
      expect(linkedStatement?.payoutStatus).toBe("paid");
    });
  });
});
