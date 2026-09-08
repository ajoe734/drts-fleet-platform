import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.service";

function createService() {
  const auditService = new AuditNotificationService();
  const billingSettlementService = new BillingSettlementService(auditService);
  return { auditService, billingSettlementService };
}

async function setupReimbursementBatches(service: BillingSettlementService) {
  await service.publishDriverFeePlan({
    planName: "Phase1 Driver Fee Plan",
    version: "drv-fee-v1",
    serviceFeeBps: 1500,
    reimbursementMode: "platform_funded",
  });

  const result = await service.generateDriverStatements({
    periodMonth: "2026-03",
  });
  const batchId = result.reimbursementBatchIds[0]!;
  return { batchId, result };
}

describe("SR-PROOF-001: Concurrency, Idempotency & Durable ActionReceipt", () => {
  it("supports concurrent / repeated approveReimbursementBatch calls idempotently", async () => {
    const { billingSettlementService } = createService();
    const { batchId } = await setupReimbursementBatches(billingSettlementService);
    const batch = billingSettlementService.getReimbursementBatch(batchId);

    // Concurrently trigger approval from multiple workers/operators
    const [first, second, third] = await Promise.all([
      billingSettlementService.approveReimbursementBatch(batchId, {
        statementId: batch.statementId,
      }),
      billingSettlementService.approveReimbursementBatch(batchId, {
        statementId: batch.statementId,
      }),
      billingSettlementService.approveReimbursementBatch(batchId, {
        statementId: batch.statementId,
      }),
    ]);

    expect(first.status).toBe("pending");
    expect(first.approvedAt).toBeDefined();
    expect(second.approvedAt).toBe(first.approvedAt);
    expect(third.approvedAt).toBe(first.approvedAt);
  });

  it("supports idempotent re-send of markReimbursementPaid with the same proofId", async () => {
    const { billingSettlementService } = createService();
    const { batchId } = await setupReimbursementBatches(billingSettlementService);
    const batch = billingSettlementService.getReimbursementBatch(batchId);

    await billingSettlementService.approveReimbursementBatch(batchId, {
      statementId: batch.statementId,
    });

    const proof = await billingSettlementService.uploadRemittanceProof(batchId, {
      fileName: "wire_01.pdf",
      mimeType: "application/pdf",
      contentBase64: Buffer.from("WIRE_RECORD_BYTES_01").toString("base64"),
      autoScan: true,
    });

    const firstMark = billingSettlementService.markReimbursementPaid(
      batchId,
      {
        remittanceProofId: proof.proofId,
        paidAt: "2026-04-02T10:00:00Z",
      },
      "req-first-pay-001",
    );

    expect(firstMark.status).toBe("paid");
    expect(firstMark.paidAt).toBe("2026-04-02T10:00:00Z");
    const initialReceipt = firstMark.remittanceReceipt;
    expect(initialReceipt).toBeDefined();

    // Idempotent re-send with same proofId
    const secondMark = billingSettlementService.markReimbursementPaid(
      batchId,
      {
        remittanceProofId: proof.proofId,
        paidAt: "2026-04-02T10:00:00Z",
      },
      "req-second-pay-001",
    );

    expect(secondMark.status).toBe("paid");
    expect(secondMark.paidAt).toBe("2026-04-02T10:00:00Z");
    expect(secondMark.remittanceProofId).toBe(proof.proofId);
    // Preserves original receipt action
    expect(secondMark.remittanceReceipt?.actionId).toBe(initialReceipt?.actionId);
  });

  it("rejects markReimbursementPaid if attempting to change proof on an already paid batch", async () => {
    const { billingSettlementService } = createService();
    const { batchId } = await setupReimbursementBatches(billingSettlementService);
    const batch = billingSettlementService.getReimbursementBatch(batchId);

    await billingSettlementService.approveReimbursementBatch(batchId, {
      statementId: batch.statementId,
    });

    const proof1 = await billingSettlementService.uploadRemittanceProof(batchId, {
      fileName: "wire_initial.pdf",
      mimeType: "application/pdf",
      contentBase64: Buffer.from("WIRE_BYTES_INITIAL").toString("base64"),
      autoScan: true,
    });

    billingSettlementService.markReimbursementPaid(batchId, {
      remittanceProofId: proof1.proofId,
    });

    // 1. Attempting to upload another proof to a paid batch is blocked with 409
    await expect(
      billingSettlementService.uploadRemittanceProof(batchId, {
        fileName: "wire_conflicting.pdf",
        mimeType: "application/pdf",
        contentBase64: Buffer.from("WIRE_BYTES_CONFLICT").toString("base64"),
        autoScan: true,
      }),
    ).rejects.toThrowError(ApiRequestError);

    // 2. Re-sending markPaid with different proof on already paid batch must fail with 409 conflict
    const differentProofId = "proof_different_fake_or_other";
    expect(() =>
      billingSettlementService.markReimbursementPaid(batchId, {
        remittanceProofId: differentProofId,
      }),
    ).toThrowError(ApiRequestError);

    try {
      billingSettlementService.markReimbursementPaid(batchId, {
        remittanceProofId: differentProofId,
      });
    } catch (err: any) {
      expect(err.getStatus()).toBe(409);
      expect(err.code).toBe("REIMBURSEMENT_ALREADY_PAID");
    }
  });

  it("produces durable ActionReceipt and maintains queryable audit record", async () => {
    const { auditService, billingSettlementService } = createService();
    const { batchId } = await setupReimbursementBatches(billingSettlementService);
    const batch = billingSettlementService.getReimbursementBatch(batchId);

    await billingSettlementService.approveReimbursementBatch(batchId, {
      statementId: batch.statementId,
    });

    const proof = await billingSettlementService.uploadRemittanceProof(batchId, {
      fileName: "receipt_test.pdf",
      mimeType: "application/pdf",
      contentBase64: Buffer.from("RECEIPT_TEST_BYTES").toString("base64"),
      autoScan: true,
    });

    const requestId = "client-req-audit-test-99";
    const paidBatch = billingSettlementService.markReimbursementPaid(
      batchId,
      {
        remittanceProofId: proof.proofId,
      },
      requestId,
    );

    const receipt = billingSettlementService.getReimbursementPaymentReceipt(batchId);
    expect(receipt).toBeDefined();
    expect(receipt?.resourceType).toBe("driver_reimbursement_batch");
    expect(receipt?.resourceId).toBe(batchId);
    expect(receipt?.status).toBe("completed");
    expect(receipt?.message).toContain("marked paid");
    expect(receipt?.actionId).toBe(paidBatch.remittanceReceipt?.actionId);

    // Verify audit record exists in audit service
    const auditLogs = auditService.listAuditLogs();
    const markPaidAudit = auditLogs.find(
      (log) => log.actionName === "mark_reimbursement_paid" && log.resourceId === batchId,
    );
    expect(markPaidAudit).toBeDefined();
    expect(markPaidAudit?.newValuesSummary?.remittanceProofId).toBe(proof.proofId);
    expect(markPaidAudit?.newValuesSummary?.proofSha256).toBe(proof.sha256);
  });
});
