import { describe, expect, it, vi } from "vitest";
import type { ReimbursementBatchRecord } from "@drts/contracts";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import type { BillingSettlementRepository } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.repository";

// Isolated regression inputs, never live payment or uploaded-file evidence.
function setup(approved = true, persistChanges = vi.fn().mockResolvedValue(undefined)) {
  const batch: ReimbursementBatchRecord = {
    batchId: "sr-proof-001-batch-a",
    driverId: "sr-proof-001-driver-a",
    statementId: "sr-proof-001-statement-a",
    periodMonth: "2026-09",
    status: "pending",
    totalAmount: { amountMinor: 10000, currency: "TWD" },
    remittanceProofId: null,
    items: [],
    approvedAt: approved ? "2026-09-06T00:00:00.000Z" : null,
    paidAt: null,
  };
  const service = new BillingSettlementService(
    new AuditNotificationService(),
    { persistChanges } as unknown as BillingSettlementRepository,
  );
  // Seed only a batch; deliberately no proof object exists in any store.
  Object.assign(service, { reimbursementBatches: [batch] });
  return { service, batch, persistChanges };
}

describe("SR-PROOF-001 payment acceptance (red until authority is implemented)", () => {
  it("rejects an unapproved batch without writing paid state", async () => {
    const { service, batch, persistChanges } = setup(false);
    await expect(
      Promise.resolve().then(() => service.markReimbursementPaid(batch.batchId, {
        remittanceProofId: "sr-proof-001-nonexistent-proof",
      })),
    ).rejects.toMatchObject({ code: "REIMBURSEMENT_NOT_APPROVED" });
    expect(batch.status).toBe("pending");
    expect(persistChanges).not.toHaveBeenCalled();
  });

  it("rejects a fabricated proof ID without writing paid state", async () => {
    const { service, batch, persistChanges } = setup();
    await expect(
      Promise.resolve().then(() => service.markReimbursementPaid(batch.batchId, {
        remittanceProofId: "sr-proof-001-nonexistent-proof",
      })),
    ).rejects.toThrow();
    expect(batch.status).toBe("pending");
    expect(persistChanges).not.toHaveBeenCalled();
  });

  it("never returns paid while persistence is still unresolved", async () => {
    let release!: () => void;
    const pendingWrite = new Promise<void>((resolve) => { release = resolve; });
    const { service, batch } = setup(true, vi.fn().mockReturnValue(pendingWrite));
    let returnedPaid = false;
    const result = Promise.resolve().then(() => service.markReimbursementPaid(batch.batchId, {
      remittanceProofId: "sr-proof-001-nonexistent-proof",
    })).then((value) => { returnedPaid = value.status === "paid"; }, () => undefined);
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(returnedPaid).toBe(false);
    } finally {
      release();
      await result;
    }
  });
});
