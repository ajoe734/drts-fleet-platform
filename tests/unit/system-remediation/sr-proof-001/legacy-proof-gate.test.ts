import { describe, expect, it, vi } from "vitest";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.service";

async function setup() {
  const repository = {
    isEnabled: () => false,
    persistChanges: vi.fn(async () => undefined),
  };
  const billing = new BillingSettlementService(
    new AuditNotificationService(),
    repository as never,
  );
  await billing.publishDriverFeePlan({
    planName: "Proof gate unit",
    version: "proof-gate-unit",
    serviceFeeBps: 1500,
    reimbursementMode: "platform_funded",
  });
  const result = await billing.generateDriverStatements({
    periodMonth: "2026-03",
  });
  const batch = billing.getReimbursementBatch(result.reimbursementBatchIds[0]!);
  await billing.approveReimbursementBatch(batch.batchId, {
    statementId: batch.statementId,
  });
  const proofService = billing.remittanceProofServiceForTest;
  async function proof(
    state: "pending_scan" | "clean" | "rejected",
    batchId = batch.batchId,
  ) {
    const staged = await proofService.stageContent(
      Buffer.from("unit proof bytes"),
      "application/pdf",
    );
    const record = await proofService.uploadProof({
      batchId,
      driverId: batch.driverId,
      originalFilename: "receipt.pdf",
      stagedContentRef: staged.stagedContentRef,
      uploadedByActorId: "unit-driver",
    });
    if (state !== "pending_scan")
      await proofService.recordScanResult(record.proofId, {
        scanState: state,
        rejectionReason: state === "rejected" ? "TEST_MALWARE" : null,
        scanCompletedAt: new Date().toISOString(),
      });
    return record;
  }
  return { billing, batch, proof, repository };
}

for (const route of ["legacy", "proof-backed"] as const) {
  describe(`${route} payment proof gate (real service, no server/provider calls)`, () => {
    for (const [scenario, code] of [
      ["fabricated", "REMITTANCE_PROOF_NOT_FOUND"],
      ["pending_scan", "REMITTANCE_PROOF_NOT_CLEAN"],
      ["rejected", "REMITTANCE_PROOF_NOT_CLEAN"],
      ["cross-batch", "REMITTANCE_PROOF_BATCH_MISMATCH"],
      ["missing", "VALIDATION_ERROR"],
    ] as const) {
      it(`rejects ${scenario} without changing batch or statement`, async () => {
        const { billing, batch, proof } = await setup();
        const proofId =
          scenario === "fabricated"
            ? "invented-proof"
            : scenario === "missing"
              ? ""
              : (
                  await proof(
                    scenario === "cross-batch" ? "clean" : scenario,
                    scenario === "cross-batch"
                      ? "foreign-batch"
                      : batch.batchId,
                  )
                ).proofId;
        const before = billing.getReimbursementBatch(batch.batchId);
        // Promise wrapper also observes the old synchronous compatibility path.
        const payment = Promise.resolve().then<unknown>(() =>
          route === "legacy"
            ? billing.markReimbursementPaid(
                batch.batchId,
                { remittanceProofId: proofId },
                undefined,
                "gate-intent",
              )
            : billing.markReimbursementPaidWithProof(
                batch.batchId,
                {
                  batchId: batch.batchId,
                  proofId,
                  idempotencyKey: "gate-intent",
                },
                null,
              ),
        );
        await expect(payment).rejects.toMatchObject({ code });
        expect(billing.getReimbursementBatch(batch.batchId)).toEqual(before);
        expect(
          billing.getDriverStatement(batch.statementId).payoutStatus,
        ).not.toBe("paid");
      });
    }
  });
}

it("converges old/new routes and different intent keys, but refuses proof substitution", async () => {
  const { billing, batch, proof } = await setup();
  const first = await proof("clean");
  const other = await proof("clean");
  const old = await billing.markReimbursementPaid(
    batch.batchId,
    { remittanceProofId: first.proofId },
    undefined,
    "legacy-intent",
  );
  const receipt = await billing.markReimbursementPaidWithProof(
    batch.batchId,
    {
      batchId: batch.batchId,
      proofId: first.proofId,
      idempotencyKey: "new-intent",
    },
    null,
  );
  expect(receipt.idempotencyKey).toBe("legacy-intent");
  expect(receipt.paidAt).toBe(old.paidAt);
  await expect(
    billing.markReimbursementPaid(
      batch.batchId,
      { remittanceProofId: other.proofId },
      undefined,
      "legacy-intent",
    ),
  ).rejects.toMatchObject({ code: "REMITTANCE_PROOF_PAYMENT_CONFLICT" });
});

it("does not publish paid state before persistence succeeds and can recover the receipt on retry", async () => {
  const { billing, batch, proof, repository } = await setup();
  const record = await proof("clean");
  const before = billing.getReimbursementBatch(batch.batchId);
  repository.persistChanges.mockRejectedValueOnce(
    new Error("DB write unavailable"),
  );
  await expect(
    billing.markReimbursementPaid(
      batch.batchId,
      { remittanceProofId: record.proofId },
      undefined,
      "retry-intent",
    ),
  ).rejects.toThrow("DB write unavailable");
  expect(billing.getReimbursementBatch(batch.batchId)).toEqual(before);
  expect(billing.getDriverStatement(batch.statementId).payoutStatus).not.toBe(
    "paid",
  );
  const retry = await billing.markReimbursementPaid(
    batch.batchId,
    { remittanceProofId: record.proofId },
    undefined,
    "retry-intent",
  );
  expect(retry.status).toBe("paid");
  expect(retry.remittanceProofId).toBe(record.proofId);
});

it("requires an idempotency key even for direct compatibility-service callers", async () => {
  const { billing, batch, proof } = await setup();
  const record = await proof("clean");
  await expect(
    billing.markReimbursementPaid(batch.batchId, {
      remittanceProofId: record.proofId,
    }),
  ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
});
