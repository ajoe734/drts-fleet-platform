import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.service";

function createService() {
  const auditService = new AuditNotificationService();
  const billingSettlementService = new BillingSettlementService(auditService);
  return {
    auditService,
    billingSettlementService,
  };
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

describe("SR-PROOF-001: Remittance Proof Payment Gate & Verification", () => {
  it("rejects markPaid when batch has not been approved (未核准)", async () => {
    const { billingSettlementService } = createService();
    const { batchId } = await setupReimbursementBatches(billingSettlementService);

    // Batch is pending, not approved
    const batch = billingSettlementService.getReimbursementBatch(batchId);
    expect(batch.approvedAt).toBeNull();

    // Upload a valid clean proof
    const proof = await billingSettlementService.uploadRemittanceProof(batchId, {
      fileName: "wire_slip.pdf",
      mimeType: "application/pdf",
      contentBase64: Buffer.from("CLEAN_BANK_WIRE_TRANSFER_PROOF").toString("base64"),
      autoScan: true,
    });
    expect(proof.scanStatus).toBe("clean");

    // Attempting markPaid without approval must fail with 409
    await expect(
      () =>
        billingSettlementService.markReimbursementPaid(batchId, {
          remittanceProofId: proof.proofId,
          paidAt: "2026-04-01T12:00:00Z",
        }),
    ).toThrowError(ApiRequestError);

    try {
      billingSettlementService.markReimbursementPaid(batchId, {
        remittanceProofId: proof.proofId,
      });
    } catch (err: any) {
      expect(err.status).toBe(409);
      expect(err.code).toBe("REIMBURSEMENT_NOT_APPROVED");
    }
  });

  it("rejects markPaid when remittanceProofId is missing or blank", async () => {
    const { billingSettlementService } = createService();
    const { batchId } = await setupReimbursementBatches(billingSettlementService);
    const pendingBatch = billingSettlementService.getReimbursementBatch(batchId);

    await billingSettlementService.approveReimbursementBatch(batchId, {
      statementId: pendingBatch.statementId,
    });

    // Reset remittanceProofId to null
    pendingBatch.remittanceProofId = null;

    expect(() =>
      billingSettlementService.markReimbursementPaid(batchId, {
        remittanceProofId: "",
      }),
    ).toThrowError(ApiRequestError);

    try {
      billingSettlementService.markReimbursementPaid(batchId, {
        remittanceProofId: "   ",
      });
    } catch (err: any) {
      expect(err.status).toBe(400);
      expect(err.code).toBe("VALIDATION_ERROR");
    }
  });

  it("rejects markPaid when remittanceProofId is fictitious / does not exist (虛構ID)", async () => {
    const { billingSettlementService } = createService();
    const { batchId } = await setupReimbursementBatches(billingSettlementService);
    const pendingBatch = billingSettlementService.getReimbursementBatch(batchId);

    await billingSettlementService.approveReimbursementBatch(batchId, {
      statementId: pendingBatch.statementId,
    });

    const fictitiousProofId = "wire_fake_999999_xyz";

    expect(() =>
      billingSettlementService.markReimbursementPaid(batchId, {
        remittanceProofId: fictitiousProofId,
      }),
    ).toThrowError(ApiRequestError);

    try {
      billingSettlementService.markReimbursementPaid(batchId, {
        remittanceProofId: fictitiousProofId,
      });
    } catch (err: any) {
      expect(err.getStatus()).toBe(404);
      expect(err.code).toBe("REMITTANCE_PROOF_NOT_FOUND");
      const resp = err.getResponse() as any;
      expect(resp?.error?.message).toContain(fictitiousProofId);
    }
  });

  it("rejects markPaid when remittance proof belongs to another batch (他batch)", async () => {
    const { billingSettlementService } = createService();
    const { batchId: batchA } = await setupReimbursementBatches(billingSettlementService);

    // Create a second batch
    const batchB = "reimbursement-test-batch-002";
    (billingSettlementService as any).reimbursementBatches.push({
      batchId: batchB,
      driverId: "driver-002",
      statementId: "statement-002",
      periodMonth: "2026-03",
      status: "pending",
      totalAmount: { amountMinor: 20000, currency: "TWD" },
      remittanceProofId: null,
      items: [],
      approvedAt: "2026-04-01T09:00:00Z",
      paidAt: null,
    });

    // Upload a valid proof specifically for batch A
    const proofForBatchA = await billingSettlementService.uploadRemittanceProof(batchA, {
      fileName: "wire_slip_for_batch_a.pdf",
      mimeType: "application/pdf",
      contentBase64: Buffer.from("PROOF_FOR_BATCH_A").toString("base64"),
      autoScan: true,
    });
    expect(proofForBatchA.batchId).toBe(batchA);

    // Attempting to mark batch B paid using batch A's proof must be rejected with 409
    expect(() =>
      billingSettlementService.markReimbursementPaid(batchB, {
        remittanceProofId: proofForBatchA.proofId,
      }),
    ).toThrowError(ApiRequestError);

    try {
      billingSettlementService.markReimbursementPaid(batchB, {
        remittanceProofId: proofForBatchA.proofId,
      });
    } catch (err: any) {
      expect(err.getStatus()).toBe(409);
      expect(err.code).toBe("REMITTANCE_PROOF_BATCH_MISMATCH");
      const resp = err.getResponse() as any;
      expect(resp?.error?.message).toContain(batchB);
      expect(resp?.error?.message).toContain(batchA);
    }
  });

  it("rejects markPaid when remittance proof is unscanned or pending scan (未掃描)", async () => {
    const { billingSettlementService } = createService();
    const { batchId } = await setupReimbursementBatches(billingSettlementService);
    const pendingBatch = billingSettlementService.getReimbursementBatch(batchId);

    await billingSettlementService.approveReimbursementBatch(batchId, {
      statementId: pendingBatch.statementId,
    });

    // Upload with autoScan: false -> scanStatus remains "pending"
    const pendingProof = await billingSettlementService.uploadRemittanceProof(batchId, {
      fileName: "unscanned_transfer.pdf",
      mimeType: "application/pdf",
      contentBase64: Buffer.from("UNSCANNED_FILE_BYTES").toString("base64"),
      autoScan: false,
    });
    expect(pendingProof.scanStatus).toBe("pending");

    expect(() =>
      billingSettlementService.markReimbursementPaid(batchId, {
        remittanceProofId: pendingProof.proofId,
      }),
    ).toThrowError(ApiRequestError);

    try {
      billingSettlementService.markReimbursementPaid(batchId, {
        remittanceProofId: pendingProof.proofId,
      });
    } catch (err: any) {
      expect(err.getStatus()).toBe(409);
      expect(err.code).toBe("REMITTANCE_PROOF_NOT_SCANNED");
      const resp = err.getResponse() as any;
      expect(resp?.error?.message).toContain("pending");
    }
  });

  it("rejects markPaid when remittance proof scan detects infected/malicious file", async () => {
    const { billingSettlementService } = createService();
    const { batchId } = await setupReimbursementBatches(billingSettlementService);
    const pendingBatch = billingSettlementService.getReimbursementBatch(batchId);

    await billingSettlementService.approveReimbursementBatch(batchId, {
      statementId: pendingBatch.statementId,
    });

    // Upload a simulated infected file
    const infectedProof = await billingSettlementService.uploadRemittanceProof(batchId, {
      fileName: "infected_eicar_virus_receipt.pdf",
      mimeType: "application/pdf",
      contentBase64: Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*").toString("base64"),
      autoScan: true,
    });
    expect(infectedProof.scanStatus).toBe("infected");

    try {
      billingSettlementService.markReimbursementPaid(batchId, {
        remittanceProofId: infectedProof.proofId,
      });
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err.getStatus()).toBe(409);
      expect(err.code).toBe("REMITTANCE_PROOF_NOT_SCANNED");
      const resp = err.getResponse() as any;
      expect(resp?.error?.message).toContain("infected");
    }
  });

  it("allows markPaid when proof is clean, approved, and correctly attributed; allows readback (合法證明可從付款紀錄回看)", async () => {
    const { auditService, billingSettlementService } = createService();
    const { batchId } = await setupReimbursementBatches(billingSettlementService);
    const pendingBatch = billingSettlementService.getReimbursementBatch(batchId);

    // 1. Approve batch
    const approved = await billingSettlementService.approveReimbursementBatch(batchId, {
      statementId: pendingBatch.statementId,
    });
    expect(approved.approvedAt).toBeTruthy();

    // 2. Upload legitimate remittance proof
    const rawContent = "BANK_WIRE_TRANSFER_REF_2026_04_01_TAIPEI_FUBON";
    const expectedSha256 = createHash("sha256").update(Buffer.from(rawContent)).digest("hex");
    const proof = await billingSettlementService.uploadRemittanceProof(batchId, {
      fileName: "fubon_wire_receipt_20260401.pdf",
      mimeType: "application/pdf",
      contentBase64: Buffer.from(rawContent).toString("base64"),
      autoScan: true,
    });
    expect(proof.scanStatus).toBe("clean");
    expect(proof.sha256).toBe(expectedSha256);
    expect(proof.batchId).toBe(batchId);

    // 3. Mark Paid
    const paidAt = "2026-04-01T15:30:00Z";
    const paidBatch = billingSettlementService.markReimbursementPaid(
      batchId,
      {
        remittanceProofId: proof.proofId,
        paidAt,
      },
      "req-payment-gate-001",
    );

    expect(paidBatch.status).toBe("paid");
    expect(paidBatch.paidAt).toBe(paidAt);
    expect(paidBatch.remittanceProofId).toBe(proof.proofId);

    // 4. Read back legitimate proof from payment record
    expect(paidBatch.remittanceProof).toBeDefined();
    expect(paidBatch.remittanceProof?.proofId).toBe(proof.proofId);
    expect(paidBatch.remittanceProof?.fileName).toBe("fubon_wire_receipt_20260401.pdf");
    expect(paidBatch.remittanceProof?.sha256).toBe(expectedSha256);
    expect(paidBatch.remittanceProof?.scanStatus).toBe("clean");

    // Can query proof by batchId
    const readBackProof = billingSettlementService.getRemittanceProof(batchId);
    expect(readBackProof.proofId).toBe(proof.proofId);
    expect(readBackProof.sha256).toBe(expectedSha256);

    // Download returns original bytes
    const downloaded = billingSettlementService.downloadRemittanceProof(batchId, proof.proofId);
    expect(downloaded.buffer.toString()).toBe(rawContent);
    expect(downloaded.mimeType).toBe("application/pdf");
    expect(downloaded.fileName).toBe("fubon_wire_receipt_20260401.pdf");

    // Driver statement payout status updated
    const statement = billingSettlementService.getDriverStatement(pendingBatch.statementId);
    expect(statement.payoutStatus).toBe("paid");

    // Durable receipt created
    expect(paidBatch.remittanceReceipt).toBeDefined();
    expect(paidBatch.remittanceReceipt?.resourceType).toBe("driver_reimbursement_batch");
    expect(paidBatch.remittanceReceipt?.resourceId).toBe(batchId);
    expect(paidBatch.remittanceReceipt?.status).toBe("completed");

    const directReceipt = billingSettlementService.getReimbursementPaymentReceipt(batchId);
    expect(directReceipt?.actionId).toBe(paidBatch.remittanceReceipt?.actionId);
  });
});
