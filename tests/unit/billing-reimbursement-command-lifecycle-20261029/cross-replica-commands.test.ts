import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import { controlledIO } from "./controlled-io";
import { describe, expect, it, vi } from "vitest";
import {
  databaseSocket,
  publish,
  setup,
} from "../billing-monthly-batch-resumption-20261015/fixtures";

type Replica = Awaited<ReturnType<ReturnType<typeof controlledIO>["replica"]>>;
const finance: BootstrapRequestIdentity = {
  authMode: "bootstrap_headers",
  actorType: "platform_admin",
  actorId: "SIM-command-finance",
  realm: "platform",
  tenantId: null,
  roleFamilies: ["platform"],
  roles: [],
  scopes: ["billing:read", "billing:write"],
  requestId: null,
};
async function generated(a: Replica, driverId: string) {
  await publish(a.service);
  const response = await a.controller.generateDriverStatements(
    { periodMonth: "2026-07", driverId },
    `SIM-generate-${driverId}`,
  );
  expect(response.data.reimbursementBatchIds).toHaveLength(1);
  return {
    batchId: response.data.reimbursementBatchIds[0]!,
    statementId: response.data.items[0]!.statementId,
  };
}
async function approved(
  b: Replica,
  batch: { batchId: string; statementId: string },
) {
  return b.controller.approveReimbursementBatch(
    batch.batchId,
    { statementId: batch.statementId },
    `SIM-approve-${batch.batchId}`,
  );
}
async function uploaded(b: Replica, batchId: string) {
  const bytes = Buffer.from(
    "SIM external bank remittance input, not a real transfer",
  );
  const staged = await b.controller.financeStageRemittanceProofContent(
    { contentBase64: bytes.toString("base64"), contentType: "application/pdf" },
    `SIM-stage-${batchId}`,
  );
  return b.controller.financeUploadRemittanceProof(
    {
      batchId,
      originalFilename: "SIM-remit.pdf",
      contentType: "application/pdf",
      sizeBytes: bytes.length,
      stagedContentRef: staged.data.stagedContentRef,
    },
    finance,
    `SIM-upload-${batchId}`,
  );
}
async function paid(d: Replica, batchId: string, proofId: string) {
  return d.controller.markReimbursementPaidWithProof(
    batchId,
    { batchId, proofId, idempotencyKey: `SIM-pay-${batchId}` },
    finance,
  );
}

// Actual normal Controller/Service/Repository; only shared database IO is SIM.
// The canonical completed trip is explicit synthetic input, never a fake finished batch.
describe("C080 canonical cross-replica reimbursement commands", () => {
  it.each(["driver", "finance"] as const)(
    "uploads through the original %s route on a warm replica without a prior local batch command",
    async (route) => {
      const io = controlledIO();
      const driverId = `SIM-direct-upload-${route}`;
      io.addTrip(driverId, `direct-upload-${route}`);
      const [a, b] = await Promise.all(["A", "B"].map(io.replica));
      const batch = await generated(a!, driverId);
      await approved(a!, batch);

      expect(b!.service.listReimbursementBatches()).toEqual([]);
      const read = await b!.controller.getReimbursementBatch(batch.batchId);
      expect(read.data.approvedAt).toBeTruthy();
      // A detached canonical GET must not seed this replica's command cache.
      expect(() => b!.service.getReimbursementBatch(batch.batchId)).toThrow();

      const bytes = Buffer.from("SIM direct proof for the original batch");
      const body = {
        contentBase64: bytes.toString("base64"),
        contentType: "application/pdf",
      };
      const staged =
        route === "driver"
          ? await b!.controller.stageRemittanceProofContent(
              body,
              `SIM-direct-stage-${route}`,
            )
          : await b!.controller.financeStageRemittanceProofContent(
              body,
              `SIM-direct-stage-${route}`,
            );
      const command = {
        batchId: batch.batchId,
        originalFilename: "SIM-direct-remit.pdf",
        contentType: body.contentType,
        sizeBytes: bytes.length,
        stagedContentRef: staged.data.stagedContentRef,
      };
      const driver: BootstrapRequestIdentity = {
        ...finance,
        actorType: "driver_user",
        actorId: driverId,
        realm: "driver",
        roleFamilies: ["driver"],
        scopes: ["driver:write"],
      };
      const response =
        route === "driver"
          ? await b!.controller.uploadRemittanceProof(
              command,
              driver,
              `SIM-direct-upload-${route}`,
            )
          : await b!.controller.financeUploadRemittanceProof(
              command,
              finance,
              `SIM-direct-upload-${route}`,
            );
      expect(response.data).toMatchObject({
        batchId: batch.batchId,
        driverId,
        uploadedByActorId: route === "driver" ? driverId : finance.actorId,
        scanState: "clean",
      });
      expect(io.proofs.get(response.data.proofId)).toMatchObject({
        batch_id: batch.batchId,
        driver_id: driverId,
        scan_state: "clean",
      });
      expect(io.scanner.scan).toHaveBeenCalledTimes(1);
      expect(b!.service.listReimbursementBatches()).toEqual([]);
    },
  );

  it("rejects a foreign Driver upload against a canonically present batch absent from the local cache", async () => {
    const io = controlledIO();
    io.addTrip("SIM-direct-owned-driver", "direct-owned");
    const [a, b] = await Promise.all(["A", "B"].map(io.replica));
    const batch = await generated(a!, "SIM-direct-owned-driver");
    await approved(a!, batch);
    const bytes = Buffer.from("SIM foreign proof");
    const staged = await b!.controller.stageRemittanceProofContent(
      {
        contentBase64: bytes.toString("base64"),
        contentType: "application/pdf",
      },
      "SIM-foreign-stage",
    );
    await expect(
      b!.controller.uploadRemittanceProof(
        {
          batchId: batch.batchId,
          originalFilename: "SIM-foreign.pdf",
          contentType: "application/pdf",
          sizeBytes: bytes.length,
          stagedContentRef: staged.data.stagedContentRef,
        },
        {
          ...finance,
          actorType: "driver_user",
          actorId: "SIM-another-driver",
          realm: "driver",
          roleFamilies: ["driver"],
          scopes: ["driver:write"],
        },
        "SIM-foreign-upload",
      ),
    ).rejects.toMatchObject({
      code: "REMITTANCE_PROOF_BATCH_OWNERSHIP_VIOLATION",
      status: 403,
    });
    expect(io.proofs.size).toBe(0);
    expect(io.scanner.scan).not.toHaveBeenCalled();
    expect(b!.service.listReimbursementBatches()).toEqual([]);
  });

  it("propagates the original canonical batch read failure before a finance proof is written or scanned", async () => {
    const io = controlledIO();
    io.addTrip("SIM-direct-read-failure-driver", "direct-read-failure");
    const [a, b] = await Promise.all(["A", "B"].map(io.replica));
    const batch = await generated(a!, "SIM-direct-read-failure-driver");
    await approved(a!, batch);
    // Only external SQL IO fails; all original controllers and repositories run.
    io.socket.query.mockRejectedValueOnce(
      new Error("SIM canonical batch read rejected"),
    );
    await expect(uploaded(b!, batch.batchId)).rejects.toThrow(
      "SIM canonical batch read rejected",
    );
    expect(io.proofs.size).toBe(0);
    expect(io.scanner.scan).not.toHaveBeenCalled();
    expect(b!.service.listReimbursementBatches()).toEqual([]);
  });

  it("approves A's normally generated same batch directly on already booted B", async () => {
    const socket = databaseSocket();
    socket.liveRows.push({
      order_record: {
        orderId: "SIM-command-order",
        tenantId: "SIM-command-tenant",
        orderSource: "api",
        serviceBucket: "business_dispatch",
        businessDispatchSubtype: "credit_card_airport_transfer",
        serviceProductCode: "credit_card_airport_transfer",
        costCenter: null,
        passenger: null,
        partnerId: "SIM-command-partner",
        partnerProgramId: null,
        partnerEntrySlug: null,
        eligibilityVerificationId: null,
        issuerAuthorizationRef: "SIM-command-issuer-ref",
        benefitReference: "SIM-command-benefit-ref",
      },
      task_record: {
        taskId: "SIM-command-task",
        orderId: "SIM-command-order",
        driverId: "SIM-command-driver",
        status: "completed",
        completedAt: "2026-07-15T12:00:00.000Z",
        fare: { currency: "TWD", amountMinor: 12345 },
      },
    });
    const a = await setup(socket);
    const b = await setup(socket);
    await publish(a.service);
    const generated = await a.controller.generateDriverStatements(
      { periodMonth: "2026-07", driverId: "SIM-command-driver" },
      "SIM-command-generate",
      "SIM-command-generate-request",
    );
    expect(generated.data.reimbursementBatchIds).toHaveLength(1);
    const batchId = generated.data.reimbursementBatchIds[0]!;
    const statementId = generated.data.items[0]!.statementId;
    const canonical = (
      await a.repository!.loadState()
    ).reimbursementBatches.find((row) => row.batchId === batchId)!;
    expect(canonical).toMatchObject({
      batchId,
      statementId,
      workflowState: "pending_approval",
    });
    // B goes straight to the normal write command: no GET or runtime-cache hydration first.
    let approved: {
      batchId: string;
      approvedAt: string | null | undefined;
      workflowState: string | undefined;
    } | null = null;
    let failure: { code: string; status: number | null } | null = null;
    try {
      const response = await b.controller.approveReimbursementBatch(
        batchId,
        { statementId },
        "SIM-command-approve",
        "SIM-command-approve-request",
      );
      approved = {
        batchId: response.data.batchId,
        approvedAt: response.data.approvedAt,
        workflowState: response.data.workflowState,
      };
    } catch (error) {
      const actual = error as { code?: string; status?: number };
      failure = {
        code: actual.code ?? "UNKNOWN",
        status: actual.status ?? null,
      };
    }
    const observed = {
      batchId,
      statementId,
      canonicalBefore: canonical.workflowState,
      approved,
      failure,
    };
    writeFileSync(
      "cross-replica-command-latest-observations.json",
      JSON.stringify(
        {
          ...observed,
          downstreamNotExecuted: failure
            ? [
                "other-instance export",
                "normal proof-backed pay",
                "normal reconciliation",
              ]
            : [],
        },
        null,
        2,
      ) + "\n",
    );
    expect(failure).toBeNull();
    expect(approved).toMatchObject({ batchId, workflowState: "approved" });
    expect(approved?.approvedAt).toBeTruthy();
  });

  it("runs A generation, warm B approval, C actual PDF/proof upload, D payment and E reconciliation through single-checkout pools", async () => {
    const io = controlledIO();
    io.addTrip("SIM-full-driver", "full");
    const [a, b, c, d, e] = await Promise.all(
      ["A", "B", "C", "D", "E"].map(io.replica),
    );
    const batch = await generated(a!, "SIM-full-driver");
    await approved(b!, batch);
    const exported = (
      await c!.controller.exportReimbursementBatch(
        batch.batchId,
        "SIM-full-export",
        undefined,
        finance,
      )
    ).data;
    const artifact = await io.artifactStore.get("report", batch.batchId);
    expect(artifact?.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(createHash("sha256").update(artifact!.bytes).digest("hex")).toBe(
      exported.manifestHash,
    );
    const proof = (await uploaded(c!, batch.batchId)).data;
    expect(proof.scanState).toBe("clean");
    const start = io.calls.length;
    const receipt = (await paid(d!, batch.batchId, proof.proofId)).data;
    const payCalls = io.calls.slice(start);
    expect(new Set(payCalls.map((row) => row.client)).size).toBe(1);
    expect(payCalls.every((row) => row.client !== null)).toBe(true);
    expect(payCalls.filter((row) => row.sql === "BEGIN")).toHaveLength(1);
    expect(payCalls.filter((row) => row.sql === "COMMIT")).toHaveLength(1);
    expect(
      payCalls
        .filter(
          (row) =>
            row.sql.includes("pg_advisory_lock(") ||
            row.sql.includes("pg_advisory_xact_lock("),
        )
        .map((row) => row.values[0]),
    ).toEqual([
      `remittance-proof-payment:${batch.batchId}`,
      `remittance-proof-payment:${batch.batchId}`,
    ]);
    const reconciled = (
      await e!.controller.markReimbursementBatchReconciled(
        batch.batchId,
        {
          reason: "SIM bank statement reviewed",
          evidenceRef: "SIM-statement-42",
        },
        "SIM-full-reconcile",
        undefined,
        finance,
      )
    ).data;
    const final = (await a!.controller.getReimbursementBatch(batch.batchId))
      .data;
    expect(final).toMatchObject({
      ...batch,
      status: "paid",
      workflowState: "reconciled",
      remittanceProofId: proof.proofId,
      exportManifestHash: exported.manifestHash,
      reconciliationReceiptId: reconciled.receiptId,
      reconciliationEvidenceRef: "SIM-statement-42",
    });
    expect(final.totalAmount).toEqual({ currency: "TWD", amountMinor: 12345 });
    expect(receipt.amount).toEqual(final.totalAmount);
    expect(
      (await d!.repository.loadState()).driverStatements.find(
        (row) => row.statementId === batch.statementId,
      )?.payoutStatus,
    ).toBe("paid");
    expect(io.receipts.size).toBe(1);
    expect(
      io.pools.every((pool) => pool.active === 0 && pool.maximum === 1),
    ).toBe(true);
    writeFileSync(
      "cross-replica-full-lifecycle-observations.json",
      JSON.stringify(
        {
          ...batch,
          proofId: proof.proofId,
          paymentReceiptId: receipt.receiptId,
          reconciliationReceiptId: reconciled.receiptId,
          workflowState: final.workflowState,
          amount: final.totalAmount,
          manifestHash: exported.manifestHash,
          actualPdfBytes: artifact!.bytes.length,
          perReplicaMaximumCheckouts: io.pools.map((pool) => ({
            replica: pool.replica,
            maximum: pool.maximum,
            active: pool.active,
          })),
        },
        null,
        2,
      ) + "\n",
    );
  });

  it("serializes two actual writers so a delayed export is retained by later pay/reconcile and re-export", async () => {
    const io = controlledIO();
    io.addTrip("SIM-race-driver", "race");
    const [a, b, c, d, e] = await Promise.all(
      ["A", "B", "C", "D", "E"].map(io.replica),
    );
    const batch = await generated(a!, "SIM-race-driver");
    await approved(b!, batch);
    const proof = (await uploaded(b!, batch.batchId)).data;
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const originalPut = io.artifactStore.put.bind(io.artifactStore);
    const puts = vi
      .spyOn(io.artifactStore, "put")
      .mockImplementation(async (input) => {
        if (input.subjectId === batch.batchId) {
          enter();
          await gate;
        }
        return originalPut(input);
      });
    const exporting = c!.controller.exportReimbursementBatch(
      batch.batchId,
      "SIM-race-export",
      undefined,
      finance,
    );
    await entered;
    const paying = paid(d!, batch.batchId, proof.proofId);
    try {
      await vi.waitFor(() =>
        expect(
          io.calls.some(
            (row) =>
              row.replica === "D" && row.sql.includes("pg_advisory_lock("),
          ),
        ).toBe(true),
      );
      expect(
        io.calls.some(
          (row) =>
            row.replica === "D" &&
            row.sql.includes(
              "SELECT record FROM billing.phase1_reimbursement_batches",
            ),
        ),
      ).toBe(false);
      expect(io.receipts.size).toBe(0);
      release();
      const exported = (await exporting).data;
      await paying;
      const firstReconciliation = (
        await e!.controller.markReimbursementBatchReconciled(
          batch.batchId,
          { reason: "SIM first reconciliation" },
          "SIM-race-reconcile",
          undefined,
          finance,
        )
      ).data;
      const reexported = (
        await b!.controller.exportReimbursementBatch(
          batch.batchId,
          "SIM-race-reexport",
          undefined,
          finance,
        )
      ).data;
      const replay = (
        await c!.controller.markReimbursementBatchReconciled(
          batch.batchId,
          { reason: "SIM different replay reason" },
          "SIM-race-reconcile-replay",
          undefined,
          finance,
        )
      ).data;
      expect(replay).toEqual(firstReconciliation);
      expect(reexported.manifestHash).toBe(exported.manifestHash);
      const final = (await a!.controller.getReimbursementBatch(batch.batchId))
        .data;
      expect(final).toMatchObject({
        status: "paid",
        workflowState: "reconciled",
        exportManifestHash: exported.manifestHash,
        reconciliationReceiptId: firstReconciliation.receiptId,
      });
      expect(
        puts.mock.calls.filter(([input]) => input.subjectId === batch.batchId),
      ).toHaveLength(1);
      expect(io.receipts.size).toBe(1);
    } finally {
      release();
      await Promise.allSettled([exporting, paying]);
      puts.mockRestore();
    }
    expect(io.pools.every((pool) => pool.active === 0)).toBe(true);
  });

  it("commits the original proof receipt before a rejected batch save and repairs with that same receipt on another instance", async () => {
    const io = controlledIO();
    io.addTrip("SIM-repair-driver", "repair");
    const [a, b, c, d] = await Promise.all(
      ["A", "B", "C", "D"].map(io.replica),
    );
    const batch = await generated(a!, "SIM-repair-driver");
    await approved(b!, batch);
    const proof = (await uploaded(b!, batch.batchId)).data;
    io.rejectNextBatchWrite();
    await expect(paid(c!, batch.batchId, proof.proofId)).rejects.toThrow(
      "SIM batch persistence rejected after receipt COMMIT",
    );
    expect(io.receipts.size).toBe(1);
    expect(io.events).toContain("batch-rejected-after-1-committed-receipts");
    const originalReceipt = [...io.receipts.values()][0]!;
    expect(
      (await a!.controller.getReimbursementBatch(batch.batchId)).data.status,
    ).toBe("pending");
    expect(c!.service.listReimbursementBatches()).toEqual([]);
    expect(c!.pool.active).toBe(0);
    const repaired = (await paid(d!, batch.batchId, proof.proofId)).data;
    expect(repaired.receiptId).toBe(originalReceipt.receipt_id);
    expect(io.receipts.size).toBe(1);
    expect(
      (await a!.controller.getReimbursementBatch(batch.batchId)).data,
    ).toMatchObject({
      status: "paid",
      workflowState: "paid",
      remittanceProofId: proof.proofId,
    });
    expect(io.pools.every((pool) => pool.active === 0)).toBe(true);
  });

  it("preserves original statement/approval/scan/proof validation and releases the held session after each rejection", async () => {
    const io = controlledIO();
    io.addTrip("SIM-gates-driver", "gates");
    const [a, b, c] = await Promise.all(["A", "B", "C"].map(io.replica));
    const batch = await generated(a!, "SIM-gates-driver");
    await expect(
      paid(b!, batch.batchId, "SIM-unknown-proof"),
    ).rejects.toMatchObject({ code: "REMITTANCE_PROOF_BATCH_NOT_APPROVED" });
    await expect(
      b!.controller.approveReimbursementBatch(
        batch.batchId,
        { statementId: "SIM-other-statement" },
        "SIM-wrong-statement",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(b!.pool.active).toBe(0);
    expect(b!.service.listReimbursementBatches()).toEqual([]);
    await approved(b!, batch);
    io.scanner.available = false;
    const proof = (await uploaded(b!, batch.batchId)).data;
    expect(proof.scanState).toBe("pending_scan");
    await expect(paid(c!, batch.batchId, proof.proofId)).rejects.toMatchObject({
      code: "REMITTANCE_PROOF_NOT_CLEAN",
    });
    expect(io.receipts.size).toBe(0);
    expect(c!.pool.active).toBe(0);
    io.scanner.available = true;
    await c!.controller.scanRemittanceProof(proof.proofId, finance);
    await paid(c!, batch.batchId, proof.proofId);
    await expect(
      c!.controller.markReimbursementPaidWithProof(
        batch.batchId,
        {
          batchId: batch.batchId,
          proofId: "SIM-other-proof",
          idempotencyKey: "SIM-conflicting-proof",
        },
        finance,
      ),
    ).rejects.toMatchObject({ code: "REMITTANCE_PROOF_PAYMENT_CONFLICT" });
    expect(io.receipts.size).toBe(1);
    expect(c!.pool.active).toBe(0);
  });

  it("discards uncertain lock sessions and permits retry without leaking a pool checkout", async () => {
    const io = controlledIO();
    io.addTrip("SIM-lock-driver", "lock");
    const a = await io.replica("A"),
      b = await io.replica("B");
    const batch = await generated(a, "SIM-lock-driver");
    io.loseNextLockAck();
    await expect(
      b.controller.approveReimbursementBatch(
        batch.batchId,
        { statementId: batch.statementId },
        "SIM-lock-lost-approve",
      ),
    ).rejects.toThrow("SIM session lock ACK lost");
    expect(b.pool.active).toBe(0);
    expect(b.pool.releases).toEqual([true]);
    expect(b.service.listReimbursementBatches()).toEqual([]);
    io.loseNextUnlockAck();
    await approved(b, batch);
    expect(b.pool.active).toBe(0);
    expect(b.pool.releases).toEqual([true, true]);
    expect(
      (await a.controller.getReimbursementBatch(batch.batchId)).data
        .workflowState,
    ).toBe("approved");
  });
});
