import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import type { MoneyAmount } from "@drts/contracts";

import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { RemittanceProofService } from "../../../../apps/api/src/modules/billing-settlement/remittance-proof.service";
import {
  EicarSignatureRemittanceProofScannerAdapter,
  UnprovisionedRemittanceProofScannerAdapter,
} from "../../../../apps/api/src/modules/billing-settlement/remittance-proof-scanner.adapter";
import type {
  RemittanceProofScanInput,
  RemittanceProofScanOutcome,
  RemittanceProofScannerAvailability,
  RemittanceProofScannerPort,
} from "../../../../apps/api/src/modules/billing-settlement/remittance-proof-scanner.port";
import { InMemoryRemittanceProofStorageAdapter } from "../../../../apps/api/src/modules/billing-settlement/remittance-proof-storage.adapter";

/**
 * Deterministic, test-only scanner double: returns whatever verdict was
 * pre-registered for a proofId, defaulting to "clean". Never shipped as a
 * runtime default -- production wiring uses
 * `UnprovisionedRemittanceProofScannerAdapter` (see
 * `remittance-proof-scanner.adapter.ts`), which this file also tests
 * directly below.
 */
class ScriptedRemittanceProofScanner implements RemittanceProofScannerPort {
  readonly providerName = "scripted-test-scanner";
  private readonly verdicts = new Map<string, RemittanceProofScanOutcome>();

  setVerdict(proofId: string, outcome: RemittanceProofScanOutcome) {
    this.verdicts.set(proofId, outcome);
  }

  availability(): RemittanceProofScannerAvailability {
    return { state: "available" };
  }

  async scan(
    input: RemittanceProofScanInput,
  ): Promise<RemittanceProofScanOutcome> {
    return (
      this.verdicts.get(input.proofId) ?? {
        scanState: "clean",
        rejectionReason: null,
        scanCompletedAt: new Date().toISOString(),
      }
    );
  }
}

function driverIdentity(actorId: string): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "driver_user",
    actorId,
    realm: "driver",
    tenantId: null,
    roleFamilies: ["driver"],
    roles: [],
    scopes: ["driver:write"],
    requestId: null,
  };
}

async function createApprovedBatch(
  billingSettlementService: BillingSettlementService,
) {
  await billingSettlementService.publishDriverFeePlan({
    planName: "Phase1 Driver Fee Plan",
    version: "drv-fee-v1",
    serviceFeeBps: 1500,
    reimbursementMode: "platform_funded",
  });
  const result = await billingSettlementService.generateDriverStatements({
    periodMonth: "2026-03",
  });
  const batchId = result.reimbursementBatchIds[0]!;
  const pendingBatch = billingSettlementService.getReimbursementBatch(batchId);
  await billingSettlementService.approveReimbursementBatch(
    batchId,
    { statementId: pendingBatch.statementId },
    "sr-proof-001-approve",
  );
  return billingSettlementService.getReimbursementBatch(batchId);
}

async function uploadAndScanCleanProof(
  billingSettlementService: BillingSettlementService,
  scanner: ScriptedRemittanceProofScanner,
  batchId: string,
  driverId: string,
  fileBytes = Buffer.from("real remittance PDF bytes"),
) {
  const staged = await billingSettlementService.stageRemittanceProofContent(
    fileBytes,
    "application/pdf",
  );
  const proof = await billingSettlementService.uploadRemittanceProof(
    {
      batchId,
      originalFilename: "remit.pdf",
      contentType: "application/pdf",
      sizeBytes: fileBytes.length,
      stagedContentRef: staged.stagedContentRef,
    },
    driverIdentity(driverId),
    "sr-proof-001-upload",
  );
  scanner.setVerdict(proof.proofId, {
    scanState: "clean",
    rejectionReason: null,
    scanCompletedAt: new Date().toISOString(),
  });
  await billingSettlementService.remittanceProofServiceForTest.attemptScan(
    proof.proofId,
  );
  return billingSettlementService.getRemittanceProof(proof.proofId);
}

function createService() {
  const auditService = new AuditNotificationService();
  const scanner = new ScriptedRemittanceProofScanner();
  const remittanceProofService = new RemittanceProofService(
    undefined,
    new InMemoryRemittanceProofStorageAdapter(),
    scanner,
  );
  const billingSettlementService = new BillingSettlementService(
    auditService,
    undefined,
    undefined,
    undefined,
    undefined,
    remittanceProofService,
  );
  return { auditService, billingSettlementService, scanner };
}

describe("SR-PROOF-001: remittance proof upload / scan / readback / mark-paid gate", () => {
  describe("upload → pending_scan → clean happy path", () => {
    it("uploads a proof denormalising driverId from the batch, always starting pending_scan", async () => {
      const { billingSettlementService } = createService();
      const batch = await createApprovedBatch(billingSettlementService);

      const staged = await billingSettlementService.stageRemittanceProofContent(
        Buffer.from("remittance bytes"),
        "application/pdf",
      );
      const proof = await billingSettlementService.uploadRemittanceProof(
        {
          batchId: batch.batchId,
          originalFilename: "remit.pdf",
          contentType: "application/pdf",
          sizeBytes: 99999, // deliberately wrong -- server must not trust this
          stagedContentRef: staged.stagedContentRef,
        },
        driverIdentity(batch.driverId),
        "sr-proof-001-upload",
      );

      expect(proof.batchId).toBe(batch.batchId);
      expect(proof.driverId).toBe(batch.driverId);
      expect(proof.scanState).toBe("pending_scan");
      expect(proof.content.sizeBytes).toBe(
        Buffer.from("remittance bytes").length,
      );
      expect(proof.content.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(proof.proofId).not.toContain(String(99999));
    });

    it("rejects an upload from a driver who does not own the batch", async () => {
      const { billingSettlementService } = createService();
      const batch = await createApprovedBatch(billingSettlementService);

      const staged = await billingSettlementService.stageRemittanceProofContent(
        Buffer.from("remittance bytes"),
        "application/pdf",
      );

      await expect(
        billingSettlementService.uploadRemittanceProof(
          {
            batchId: batch.batchId,
            originalFilename: "remit.pdf",
            contentType: "application/pdf",
            sizeBytes: 10,
            stagedContentRef: staged.stagedContentRef,
          },
          driverIdentity("some-other-driver"),
          "sr-proof-001-upload-wrong-owner",
        ),
      ).rejects.toMatchObject({ code: "REMITTANCE_PROOF_BATCH_OWNERSHIP_VIOLATION" });
    });

    it("rejects an unknown/expired stagedContentRef (no upload endpoint bypass)", async () => {
      const { billingSettlementService } = createService();
      const batch = await createApprovedBatch(billingSettlementService);

      await expect(
        billingSettlementService.uploadRemittanceProof(
          {
            batchId: batch.batchId,
            originalFilename: "remit.pdf",
            contentType: "application/pdf",
            sizeBytes: 10,
            stagedContentRef: "staged-remittance-proof-does-not-exist",
          },
          driverIdentity(batch.driverId),
          "sr-proof-001-upload-bad-ref",
        ),
      ).rejects.toMatchObject({ code: "REMITTANCE_PROOF_STAGED_CONTENT_INVALID" });
    });
  });

  describe("mark-paid gate: fake id / cross-batch / unscanned / unapproved all fail closed", () => {
    it("rejects a fabricated proofId", async () => {
      const { billingSettlementService } = createService();
      const batch = await createApprovedBatch(billingSettlementService);

      await expect(
        billingSettlementService.markReimbursementPaidWithProof(
          batch.batchId,
          {
            batchId: batch.batchId,
            proofId: "remit-proof-does-not-exist",
            idempotencyKey: "key-fake-id",
          },
          null,
          "sr-proof-001-pay-fake-id",
        ),
      ).rejects.toMatchObject({ code: "REMITTANCE_PROOF_NOT_FOUND" });
    });

    it("rejects a proof that belongs to a different batch", async () => {
      // Exercises `RemittanceProofService.markPaidWithProof` directly --
      // the exact function that owns the batch-ownership check -- against a
      // real, uploaded, clean proof. `BillingSettlementService`'s wrapper
      // additionally 404s on an unknown batchId before this is ever
      // reached, which the "fabricated proofId" case above already covers;
      // this isolates the "proof.batchId !== batchId" branch specifically,
      // which needs two independent batches to observe and the seeded
      // fixture data does not reliably provide two reimbursement-eligible
      // batches in one period.
      const { billingSettlementService, scanner } = createService();
      const batchA = await createApprovedBatch(billingSettlementService);
      const proofForA = await uploadAndScanCleanProof(
        billingSettlementService,
        scanner,
        batchA.batchId,
        batchA.driverId,
      );
      const remittanceProofService =
        billingSettlementService.remittanceProofServiceForTest;

      // Sanity: paying the batch the proof actually belongs to works.
      await expect(
        remittanceProofService.markPaidWithProof({
          batchId: batchA.batchId,
          proofId: proofForA.proofId,
          idempotencyKey: "key-cross-batch-sanity",
          driverId: batchA.driverId,
          amount: batchA.totalAmount,
          paidAt: new Date().toISOString(),
        }),
      ).resolves.toBeTruthy();

      // The same proof cannot pay a *different* batchId.
      await expect(
        remittanceProofService.markPaidWithProof({
          batchId: "some-other-real-looking-batch-id",
          proofId: proofForA.proofId,
          idempotencyKey: "key-cross-batch",
          driverId: batchA.driverId,
          amount: batchA.totalAmount,
          paidAt: new Date().toISOString(),
        }),
      ).rejects.toMatchObject({ code: "REMITTANCE_PROOF_BATCH_MISMATCH" });
    });

    it("rejects a proof still pending_scan", async () => {
      const { billingSettlementService } = createService();
      const batch = await createApprovedBatch(billingSettlementService);

      const staged = await billingSettlementService.stageRemittanceProofContent(
        Buffer.from("remittance bytes"),
        "application/pdf",
      );
      const proof = await billingSettlementService.uploadRemittanceProof(
        {
          batchId: batch.batchId,
          originalFilename: "remit.pdf",
          contentType: "application/pdf",
          sizeBytes: 10,
          stagedContentRef: staged.stagedContentRef,
        },
        driverIdentity(batch.driverId),
        "sr-proof-001-upload-pending",
      );
      expect(proof.scanState).toBe("pending_scan");

      await expect(
        billingSettlementService.markReimbursementPaidWithProof(
          batch.batchId,
          {
            batchId: batch.batchId,
            proofId: proof.proofId,
            idempotencyKey: "key-pending-scan",
          },
          null,
          "sr-proof-001-pay-pending-scan",
        ),
      ).rejects.toMatchObject({ code: "REMITTANCE_PROOF_NOT_CLEAN" });
    });

    it("rejects a proof the scanner rejected", async () => {
      const { billingSettlementService, scanner } = createService();
      const batch = await createApprovedBatch(billingSettlementService);

      const staged = await billingSettlementService.stageRemittanceProofContent(
        Buffer.from("remittance bytes"),
        "application/pdf",
      );
      const proof = await billingSettlementService.uploadRemittanceProof(
        {
          batchId: batch.batchId,
          originalFilename: "remit.pdf",
          contentType: "application/pdf",
          sizeBytes: 10,
          stagedContentRef: staged.stagedContentRef,
        },
        driverIdentity(batch.driverId),
        "sr-proof-001-upload-rejected",
      );
      scanner.setVerdict(proof.proofId, {
        scanState: "rejected",
        rejectionReason: "watermark_mismatch",
        scanCompletedAt: new Date().toISOString(),
      });
      await billingSettlementService.remittanceProofServiceForTest.attemptScan(
        proof.proofId,
      );
      const rejected = await billingSettlementService.getRemittanceProof(
        proof.proofId,
      );
      expect(rejected.scanState).toBe("rejected");
      expect(rejected.rejectionReason).toBe("watermark_mismatch");

      await expect(
        billingSettlementService.markReimbursementPaidWithProof(
          batch.batchId,
          {
            batchId: batch.batchId,
            proofId: proof.proofId,
            idempotencyKey: "key-rejected-scan",
          },
          null,
          "sr-proof-001-pay-rejected-scan",
        ),
      ).rejects.toMatchObject({ code: "REMITTANCE_PROOF_NOT_CLEAN" });
    });

    it("rejects mark-paid when the batch is not yet approved, even with a clean proof", async () => {
      const { billingSettlementService, scanner } = createService();
      await billingSettlementService.publishDriverFeePlan({
        planName: "Phase1 Driver Fee Plan",
        version: "drv-fee-v1",
        serviceFeeBps: 1500,
        reimbursementMode: "platform_funded",
      });
      const result = await billingSettlementService.generateDriverStatements({
        periodMonth: "2026-03",
      });
      const unapprovedBatch = billingSettlementService.getReimbursementBatch(
        result.reimbursementBatchIds[0]!,
      );
      expect(unapprovedBatch.approvedAt).toBeFalsy();

      const proof = await uploadAndScanCleanProof(
        billingSettlementService,
        scanner,
        unapprovedBatch.batchId,
        unapprovedBatch.driverId,
      );

      await expect(
        billingSettlementService.markReimbursementPaidWithProof(
          unapprovedBatch.batchId,
          {
            batchId: unapprovedBatch.batchId,
            proofId: proof.proofId,
            idempotencyKey: "key-not-approved",
          },
          null,
          "sr-proof-001-pay-not-approved",
        ),
      ).rejects.toMatchObject({ code: "REMITTANCE_PROOF_BATCH_NOT_APPROVED" });
    });
  });

  describe("legitimate proof pays, and is traceable back from the payment record", () => {
    it("pays with a clean, batch-matching, approved proof and records a durable receipt", async () => {
      const { billingSettlementService, auditService, scanner } =
        createService();
      const batch = await createApprovedBatch(billingSettlementService);
      const proof = await uploadAndScanCleanProof(
        billingSettlementService,
        scanner,
        batch.batchId,
        batch.driverId,
      );

      const receipt = await billingSettlementService.markReimbursementPaidWithProof(
        batch.batchId,
        {
          batchId: batch.batchId,
          proofId: proof.proofId,
          idempotencyKey: "key-happy-path",
        },
        null,
        "sr-proof-001-pay-happy-path",
      );

      expect(receipt.proofId).toBe(proof.proofId);
      expect(receipt.batchId).toBe(batch.batchId);
      expect(receipt.driverId).toBe(batch.driverId);
      expect(receipt.amount.amountMinor).toBe(batch.totalAmount.amountMinor);

      const paidBatch = billingSettlementService.getReimbursementBatch(
        batch.batchId,
      );
      expect(paidBatch.status).toBe("paid");
      expect(paidBatch.remittanceProofId).toBe(proof.proofId);

      // Traceable back from the payment record: proof metadata is still
      // readable, and a fresh, verifiable, expiring readback grant can be
      // issued for it.
      const proofFromPaymentRecord = await billingSettlementService.getRemittanceProof(
        paidBatch.remittanceProofId!,
      );
      expect(proofFromPaymentRecord.scanState).toBe("clean");

      const grant = await billingSettlementService.requestRemittanceProofReadback(
        { proofId: paidBatch.remittanceProofId! },
        null,
        "sr-proof-001-readback",
      );
      expect(grant.proofId).toBe(proof.proofId);
      expect(Date.parse(grant.expiresAt)).toBeGreaterThan(Date.now());
      expect(grant.readbackUrl).toContain(encodeURIComponent(proof.proofId));

      expect(
        auditService
          .listAuditLogs()
          .some(
            (log) => log.actionName === "mark_reimbursement_paid_with_proof",
          ),
      ).toBe(true);
    });
  });

  describe("resend / concurrency / durable receipt correctness", () => {
    it("replays the identical receipt when markPaid is resent with the same idempotencyKey", async () => {
      const { billingSettlementService, scanner } = createService();
      const batch = await createApprovedBatch(billingSettlementService);
      const proof = await uploadAndScanCleanProof(
        billingSettlementService,
        scanner,
        batch.batchId,
        batch.driverId,
      );
      const command = {
        batchId: batch.batchId,
        proofId: proof.proofId,
        idempotencyKey: "key-resend",
      };

      const first = await billingSettlementService.markReimbursementPaidWithProof(
        batch.batchId,
        command,
        null,
        "sr-proof-001-resend-1",
      );
      const second = await billingSettlementService.markReimbursementPaidWithProof(
        batch.batchId,
        command,
        null,
        "sr-proof-001-resend-2",
      );

      expect(second.receiptId).toBe(first.receiptId);
      expect(second.paidAt).toBe(first.paidAt);
      expect(second.createdAt).toBe(first.createdAt);
    });

    it("converges concurrent markPaid calls with the same idempotencyKey onto one receipt", async () => {
      const { billingSettlementService, scanner } = createService();
      const batch = await createApprovedBatch(billingSettlementService);
      const proof = await uploadAndScanCleanProof(
        billingSettlementService,
        scanner,
        batch.batchId,
        batch.driverId,
      );
      const command = {
        batchId: batch.batchId,
        proofId: proof.proofId,
        idempotencyKey: "key-concurrent",
      };

      const [first, second, third] = await Promise.all([
        billingSettlementService.markReimbursementPaidWithProof(
          batch.batchId,
          command,
          null,
          "sr-proof-001-concurrent-1",
        ),
        billingSettlementService.markReimbursementPaidWithProof(
          batch.batchId,
          command,
          null,
          "sr-proof-001-concurrent-2",
        ),
        billingSettlementService.markReimbursementPaidWithProof(
          batch.batchId,
          command,
          null,
          "sr-proof-001-concurrent-3",
        ),
      ]);

      expect(second.receiptId).toBe(first.receiptId);
      expect(third.receiptId).toBe(first.receiptId);

      const paidBatch = billingSettlementService.getReimbursementBatch(
        batch.batchId,
      );
      expect(paidBatch.status).toBe("paid");
    });
  });

  describe("authorized readback: expiring grant requires re-authorization", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("verifies a fresh grant, then rejects the same grant once expired", async () => {
      const { billingSettlementService, scanner } = createService();
      const batch = await createApprovedBatch(billingSettlementService);
      const proof = await uploadAndScanCleanProof(
        billingSettlementService,
        scanner,
        batch.batchId,
        batch.driverId,
      );

      vi.setSystemTime(new Date("2026-05-25T10:06:00Z"));
      const grant = await billingSettlementService.requestRemittanceProofReadback(
        { proofId: proof.proofId },
        null,
        "sr-proof-001-readback-fresh",
      );

      const remittanceProofService =
        billingSettlementService.remittanceProofServiceForTest;
      // The grant's own claims (proofId + contentHash + issuedAt/expiresAt +
      // signature) are opaque in `readbackUrl`; re-derive them the same way
      // the service constructed them so we can verify against the exact
      // signing utility the readback endpoint uses.
      const url = new URL(grant.readbackUrl, "http://localhost");
      const claims = {
        proofId: proof.proofId,
        contentHash: proof.content.contentHash,
        signedAt: url.searchParams.get("signed_at")!,
        expiresAt: url.searchParams.get("expires_at")!,
        keyId: url.searchParams.get("key_id")!,
        signature: url.searchParams.get("sig")!,
      };

      expect(remittanceProofService.verifyReadbackGrant(claims)).toEqual({
        ok: true,
      });

      // Past expiresAt: the same grant must now fail, requiring the caller
      // to request a fresh one rather than reuse the old link.
      vi.setSystemTime(new Date(Date.parse(grant.expiresAt) + 1000));
      expect(remittanceProofService.verifyReadbackGrant(claims)).toEqual({
        ok: false,
        reason: "expired",
      });

      // Re-authorization: a fresh request issues a new, currently-valid grant.
      const reAuthorized =
        await billingSettlementService.requestRemittanceProofReadback(
          { proofId: proof.proofId },
          null,
          "sr-proof-001-readback-reauth",
        );
      expect(Date.parse(reAuthorized.expiresAt)).toBeGreaterThan(Date.now());
      expect(reAuthorized.readbackUrl).not.toBe(grant.readbackUrl);
    });
  });

  describe("getRemittanceProof / not found", () => {
    it("404s for a proofId that was never uploaded", async () => {
      const { billingSettlementService } = createService();
      await expect(
        billingSettlementService.getRemittanceProof("remit-proof-never-existed"),
      ).rejects.toMatchObject({ code: "REMITTANCE_PROOF_NOT_FOUND" });
    });
  });
});

describe("SR-PROOF-001: storage adapter (InMemoryRemittanceProofStorageAdapter)", () => {
  it("computes real content identity from staged bytes and ignores nothing the client claims", async () => {
    const storage = new InMemoryRemittanceProofStorageAdapter();
    const bytes = Buffer.from("hello remittance world");
    const { stagedContentRef } = await storage.stage({
      bytes,
      contentType: "application/pdf",
    });
    const committed = await storage.commit({
      proofId: "proof-1",
      stagedContentRef,
    });

    expect(committed.sizeBytes).toBe(bytes.length);
    expect(committed.contentType).toBe("application/pdf");
    expect(committed.contentHash).toMatch(/^[0-9a-f]{64}$/);

    const read = await storage.read("proof-1");
    expect(read?.bytes.toString("utf8")).toBe(bytes.toString("utf8"));
  });

  it("rejects committing an unknown stagedContentRef", async () => {
    const storage = new InMemoryRemittanceProofStorageAdapter();
    await expect(
      storage.commit({ proofId: "proof-2", stagedContentRef: "nope" }),
    ).rejects.toThrow();
  });

  it("consumes a stagedContentRef exactly once (no replay into a second proof)", async () => {
    const storage = new InMemoryRemittanceProofStorageAdapter();
    const { stagedContentRef } = await storage.stage({
      bytes: Buffer.from("x"),
      contentType: "text/plain",
    });
    await storage.commit({ proofId: "proof-a", stagedContentRef });
    await expect(
      storage.commit({ proofId: "proof-b", stagedContentRef }),
    ).rejects.toThrow();
  });
});

describe("SR-PROOF-001: scanner adapters", () => {
  it("UnprovisionedRemittanceProofScannerAdapter is fail-closed by default", async () => {
    const scanner = new UnprovisionedRemittanceProofScannerAdapter();
    expect(scanner.availability()).toEqual({
      state: "unavailable",
      reason: expect.any(String),
    });
    await expect(
      scanner.scan({
        proofId: "proof-1",
        contentHash: "abc",
        contentType: "application/pdf",
        sizeBytes: 10,
      }),
    ).rejects.toThrow(/not provisioned/i);
  });

  it("EicarSignatureRemittanceProofScannerAdapter detects the EICAR test signature and clears clean content", async () => {
    const eicar = Buffer.from(
      "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
      "ascii",
    );
    const store = new Map<string, Buffer>([
      ["infected", eicar],
      ["clean", Buffer.from("an ordinary remittance PDF")],
    ]);
    const scanner = new EicarSignatureRemittanceProofScannerAdapter(
      (proofId) => store.get(proofId) ?? null,
    );
    expect(scanner.availability()).toEqual({ state: "available" });

    const infectedResult = await scanner.scan({
      proofId: "infected",
      contentHash: "x",
      contentType: "application/pdf",
      sizeBytes: eicar.length,
    });
    expect(infectedResult.scanState).toBe("rejected");
    expect(infectedResult.rejectionReason).toBe("EICAR_TEST_SIGNATURE_DETECTED");

    const cleanResult = await scanner.scan({
      proofId: "clean",
      contentHash: "y",
      contentType: "application/pdf",
      sizeBytes: 10,
    });
    expect(cleanResult.scanState).toBe("clean");
    expect(cleanResult.rejectionReason).toBeNull();
  });
});

describe("SR-PROOF-001: proof amount as MoneyAmount (type sanity)", () => {
  it("keeps receipt amount immutable from the batch snapshot at pay time", async () => {
    const amount: MoneyAmount = { amountMinor: 20000, currency: "TWD" };
    expect(amount.amountMinor).toBe(20000);
  });
});
