import { describe, it, expect, vi } from "vitest";

import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementRepository } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.repository";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { RemittanceProofService } from "../../../apps/api/src/modules/billing-settlement/remittance-proof.service";
import { InMemoryRemittanceProofStorageAdapter } from "../../../apps/api/src/modules/billing-settlement/remittance-proof-storage.adapter";
import type {
  RemittanceProofScanInput,
  RemittanceProofScanOutcome,
  RemittanceProofScannerAvailability,
  RemittanceProofScannerPort,
} from "../../../apps/api/src/modules/billing-settlement/remittance-proof-scanner.port";
import { ControlledDownloadController } from "../../../apps/api/src/modules/controlled-download/controlled-download.controller";
import { InMemoryDocumentArtifactStore } from "../../../apps/api/src/common/document-artifacts";
import {
  exportReimbursementBatch,
  markReimbursementBatchReconciled,
} from "../../../apps/platform-admin-web/app/payments/reimbursements/reimbursement-workflow-client";

type StreamableFileLike = {
  getStream(): NodeJS.ReadableStream;
  getHeaders(): { type?: string };
};

function financeIdentity(actorId = "pa-finance-1"): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "platform_admin",
    actorId,
    realm: "platform",
    tenantId: null,
    roleFamilies: ["platform"],
    roles: [],
    scopes: ["billing:write"],
    requestId: null,
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
    roles: [],
    scopes: ["driver:write"],
    requestId: null,
  };
}

function paramsOf(downloadUrl: string) {
  const query = new URLSearchParams(downloadUrl.split("?")[1]);
  return {
    signedAt: query.get("signed_at") ?? undefined,
    expiresAt: query.get("expires_at") ?? undefined,
    keyId: query.get("key_id") ?? undefined,
    manifestHash: query.get("manifest_hash") ?? undefined,
    sig: query.get("sig") ?? undefined,
    sigV: query.get("sig_v") ?? undefined,
  };
}

async function drain(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function createApprovedBatch(service: BillingSettlementService) {
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
  const pendingBatch = service.getReimbursementBatch(batchId);
  await service.approveReimbursementBatch(
    batchId,
    { statementId: pendingBatch.statementId },
    "export-reconcile-approve",
  );
  return service.getReimbursementBatch(batchId);
}

/**
 * A minimal, generic fake of `DatabaseService.query` keyed by table name,
 * exercising the real `BillingSettlementRepository` SQL/JSONB round-trip
 * (not a copy of its business logic) so a second `BillingSettlementService`
 * instance can genuinely reload persisted state -- the "repository reload"
 * boundary this task's acceptance requires.
 */
function createFakeDatabase() {
  const tables = new Map<string, Map<string, unknown>>();
  const insertKeyField: Record<string, string> = {
    "billing.phase1_tenant_billing_profiles": "tenantId",
    "billing.phase1_tenant_invoices": "invoiceId",
    "billing.phase1_driver_fee_plans": "feePlanId",
    "billing.phase1_driver_statements": "statementId",
    "billing.phase1_reimbursement_batches": "batchId",
    "billing.phase1_reconciliation_issues": "issueId",
  };

  let failReimbursementBatchWrite: Error | null = null;

  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    const insertMatch = sql.match(/INSERT INTO (\S+)/);
    if (insertMatch) {
      const table = insertMatch[1]!;
      if (
        table === "billing.phase1_reimbursement_batches" &&
        failReimbursementBatchWrite
      ) {
        throw failReimbursementBatchWrite;
      }
      const keyField = insertKeyField[table];
      const record = JSON.parse(String(values[values.length - 1])) as Record<
        string,
        unknown
      >;
      const bucket = tables.get(table) ?? new Map<string, unknown>();
      bucket.set(String(record[keyField!]), structuredClone(record));
      tables.set(table, bucket);
      return { rows: [], rowCount: 1 };
    }

    const selectMatch = sql.match(/FROM (\S+)/);
    if (selectMatch) {
      const bucket = tables.get(selectMatch[1]!);
      const rows = bucket
        ? [...bucket.values()].map((record) => ({
            record: structuredClone(record),
          }))
        : [];
      return { rows };
    }

    return { rows: [] };
  });

  const databaseService = {
    isEnabled: () => true,
    query,
  } as unknown as DatabaseService;
  const repository = new BillingSettlementRepository(databaseService);

  return {
    repository,
    setFailReimbursementBatchWrite: (error: Error | null) => {
      failReimbursementBatchWrite = error;
    },
  };
}

/** Always-clean test double so `payBatch` can reach a paid batch deterministically. */
class AlwaysCleanRemittanceProofScanner implements RemittanceProofScannerPort {
  readonly providerName = "always-clean-test-scanner";

  availability(): RemittanceProofScannerAvailability {
    return { state: "available" };
  }

  async scan(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    input: RemittanceProofScanInput,
  ): Promise<RemittanceProofScanOutcome> {
    return {
      scanState: "clean",
      rejectionReason: null,
      scanCompletedAt: new Date().toISOString(),
    };
  }
}

function createService(repository?: BillingSettlementRepository) {
  const auditService = new AuditNotificationService();
  const documentArtifactStore = new InMemoryDocumentArtifactStore();
  const remittanceProofService = new RemittanceProofService(
    undefined,
    new InMemoryRemittanceProofStorageAdapter(),
    new AlwaysCleanRemittanceProofScanner(),
  );
  const service = new BillingSettlementService(
    auditService,
    repository,
    undefined,
    undefined,
    documentArtifactStore,
    remittanceProofService,
  );
  return { auditService, documentArtifactStore, service };
}

describe("REIMBURSEMENT-BATCH-EXPORT-RECONCILIATION-20261015: signed export + manual reconciliation", () => {
  describe("exportReimbursementBatch", () => {
    it("refuses to export a batch that has not been approved", async () => {
      const { service } = createService();
      await service.publishDriverFeePlan({
        planName: "Phase1 Driver Fee Plan",
        version: "drv-fee-v2",
        serviceFeeBps: 1500,
        reimbursementMode: "platform_funded",
      });
      const result = await service.generateDriverStatements({
        periodMonth: "2026-03",
      });
      const batchId = result.reimbursementBatchIds[0]!;

      await expect(
        service.exportReimbursementBatch(batchId, financeIdentity()),
      ).rejects.toMatchObject({
        status: 409,
        code: "REIMBURSEMENT_BATCH_NOT_APPROVED_FOR_EXPORT",
      });
    });

    it("binds the approved batch's canonical order/amount snapshot to real, downloadable PDF bytes and advances workflowState", async () => {
      const { service, documentArtifactStore } = createService();
      const batch = await createApprovedBatch(service);

      const receipt = await service.exportReimbursementBatch(
        batch.batchId,
        financeIdentity("pa-finance-export"),
        "export-req-1",
      );

      expect(receipt.batchId).toBe(batch.batchId);
      expect(receipt.exportedByActorId).toBe("pa-finance-export");
      expect(receipt.manifestHash).toMatch(/^[0-9a-f]{64}$/);
      expect(receipt.download.immutable).toBe(true);
      expect(receipt.download.manifestHash).toBe(receipt.manifestHash);

      const updatedBatch = service.getReimbursementBatch(batch.batchId);
      expect(updatedBatch.workflowState).toBe("exported");
      expect(updatedBatch.exportReceiptId).toBe(receipt.receiptId);
      expect(updatedBatch.exportManifestHash).toBe(receipt.manifestHash);

      const downloadController = new ControlledDownloadController(
        documentArtifactStore,
      );
      const query = paramsOf(receipt.download.downloadUrl);
      const streamable = (await downloadController.resolve(
        "report",
        batch.batchId,
        query.signedAt,
        query.expiresAt,
        query.keyId,
        query.manifestHash,
        query.sig,
        query.sigV,
      )) as unknown as StreamableFileLike;

      expect(streamable.getHeaders().type).toBe("application/pdf");
      const bytes = await drain(streamable.getStream());
      const text = bytes.toString("latin1");
      expect(text.startsWith("%PDF-1.4")).toBe(true);
      expect(text).toContain(batch.batchId);
      expect(text).toContain(batch.driverId);
      for (const item of batch.items) {
        expect(text).toContain(item.orderId);
      }
    });

    it("reissues the same manifest hash on a repeat export instead of re-rendering different bytes", async () => {
      const { service } = createService();
      const batch = await createApprovedBatch(service);

      const first = await service.exportReimbursementBatch(
        batch.batchId,
        financeIdentity(),
      );
      const second = await service.exportReimbursementBatch(
        batch.batchId,
        financeIdentity(),
      );

      expect(second.receiptId).toBe(first.receiptId);
      expect(second.manifestHash).toBe(first.manifestHash);
      expect(second.exportedAt).toBe(first.exportedAt);
    });

    it("never regresses workflowState backward when a paid batch is re-exported", async () => {
      const { service } = createService();
      const batch = await createApprovedBatch(service);
      await service.exportReimbursementBatch(batch.batchId, financeIdentity());

      const staged = await service.stageRemittanceProofContent(
        Buffer.from("remittance bytes"),
        "application/pdf",
      );
      const proof = await service.uploadRemittanceProof(
        {
          batchId: batch.batchId,
          originalFilename: "remit.pdf",
          contentType: "application/pdf",
          sizeBytes: 17,
          stagedContentRef: staged.stagedContentRef,
        },
        driverIdentity(batch.driverId),
      );
      await service.remittanceProofServiceForTest.attemptScan(proof.proofId);
      await service.markReimbursementPaidWithProof(
        batch.batchId,
        {
          batchId: batch.batchId,
          proofId: proof.proofId,
          idempotencyKey: "pay-1",
        },
        financeIdentity(),
      );

      expect(service.getReimbursementBatch(batch.batchId).workflowState).toBe(
        "paid",
      );

      await service.exportReimbursementBatch(batch.batchId, financeIdentity());
      expect(service.getReimbursementBatch(batch.batchId).workflowState).toBe(
        "paid",
      );
    });
  });

  describe("markReimbursementBatchReconciled", () => {
    it("refuses to reconcile a batch that has not been paid", async () => {
      const { service } = createService();
      const batch = await createApprovedBatch(service);

      await expect(
        service.markReimbursementBatchReconciled(
          batch.batchId,
          { reason: "bank statement matched" },
          financeIdentity(),
        ),
      ).rejects.toMatchObject({
        status: 409,
        code: "REIMBURSEMENT_BATCH_NOT_PAID_FOR_RECONCILIATION",
      });
    });

    async function payBatch(
      service: BillingSettlementService,
      batchId: string,
    ) {
      const driverId = service.getReimbursementBatch(batchId).driverId;
      const staged = await service.stageRemittanceProofContent(
        Buffer.from("remittance bytes"),
        "application/pdf",
      );
      const proof = await service.uploadRemittanceProof(
        {
          batchId,
          originalFilename: "remit.pdf",
          contentType: "application/pdf",
          sizeBytes: 17,
          stagedContentRef: staged.stagedContentRef,
        },
        driverIdentity(driverId),
      );
      await service.remittanceProofServiceForTest.attemptScan(proof.proofId);
      await service.markReimbursementPaidWithProof(
        batchId,
        { batchId, proofId: proof.proofId, idempotencyKey: "pay-reconcile-1" },
        financeIdentity(),
      );
    }

    it("rejects a blank reason on an otherwise-eligible paid batch", async () => {
      const { service } = createService();
      const batch = await createApprovedBatch(service);
      await payBatch(service, batch.batchId);

      await expect(
        service.markReimbursementBatchReconciled(
          batch.batchId,
          { reason: "   " },
          financeIdentity(),
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: "REIMBURSEMENT_BATCH_RECONCILIATION_REASON_REQUIRED",
      });
    });

    it("persists actor/time/reason/evidence and an authoritative readback, without disturbing DriverPayoutStatus", async () => {
      const { service } = createService();
      const batch = await createApprovedBatch(service);
      await payBatch(service, batch.batchId);

      const receipt = await service.markReimbursementBatchReconciled(
        batch.batchId,
        {
          reason: "Matched against bank statement line 42",
          evidenceRef: "stmt-2026-03-042",
        },
        financeIdentity("pa-finance-reconcile"),
        "reconcile-req-1",
      );

      expect(receipt.reconciledByActorId).toBe("pa-finance-reconcile");
      expect(receipt.reason).toBe("Matched against bank statement line 42");
      expect(receipt.evidenceRef).toBe("stmt-2026-03-042");

      const readback = service.getReimbursementBatch(batch.batchId);
      expect(readback.status).toBe("paid");
      expect(readback.workflowState).toBe("reconciled");
      expect(readback.reconciledAt).toBe(receipt.reconciledAt);
      expect(readback.reconciledByActorId).toBe("pa-finance-reconcile");
      expect(readback.reconciliationReason).toBe(
        "Matched against bank statement line 42",
      );
      expect(readback.reconciliationReceiptId).toBe(receipt.receiptId);
    });

    it("is idempotent by batch: a repeat call with a different reason returns the original receipt unchanged", async () => {
      const { service } = createService();
      const batch = await createApprovedBatch(service);
      await payBatch(service, batch.batchId);

      const first = await service.markReimbursementBatchReconciled(
        batch.batchId,
        { reason: "first reason" },
        financeIdentity("actor-a"),
      );
      const second = await service.markReimbursementBatchReconciled(
        batch.batchId,
        { reason: "conflicting second reason" },
        financeIdentity("actor-b"),
      );

      expect(second.receiptId).toBe(first.receiptId);
      expect(second.reason).toBe("first reason");
      expect(second.reconciledByActorId).toBe("actor-a");
    });

    it("propagates a durable repository write failure before publishing the in-memory reconciliation", async () => {
      const { repository, setFailReimbursementBatchWrite } =
        createFakeDatabase();
      const { service } = createService(repository);
      const batch = await createApprovedBatch(service);
      await payBatch(service, batch.batchId);

      setFailReimbursementBatchWrite(new Error("durable write failed"));
      await expect(
        service.markReimbursementBatchReconciled(
          batch.batchId,
          { reason: "should not land" },
          financeIdentity(),
        ),
      ).rejects.toThrow("durable write failed");

      setFailReimbursementBatchWrite(null);
      expect(
        service.getReimbursementBatch(batch.batchId).reconciledAt,
      ).toBeNull();
    });

    it("survives a repository reload: a fresh service instance reading the same repository sees the export and reconciliation", async () => {
      const { repository } = createFakeDatabase();
      const { service: firstService } = createService(repository);
      await firstService.onModuleInit();
      const batch = await createApprovedBatch(firstService);
      const exportReceipt = await firstService.exportReimbursementBatch(
        batch.batchId,
        financeIdentity("pa-finance-export"),
      );
      await payBatch(firstService, batch.batchId);
      const reconcileReceipt =
        await firstService.markReimbursementBatchReconciled(
          batch.batchId,
          { reason: "reload regression reason", evidenceRef: "stmt-reload-1" },
          financeIdentity("pa-finance-reconcile"),
        );

      const { service: reloadedService } = createService(repository);
      await reloadedService.onModuleInit();
      const reloaded = reloadedService.getReimbursementBatch(batch.batchId);

      expect(reloaded.workflowState).toBe("reconciled");
      expect(reloaded.exportedAt).not.toBeNull();
      expect(reloaded.exportManifestHash).toBe(exportReceipt.manifestHash);
      expect(reloaded.exportReceiptId).toBe(exportReceipt.receiptId);
      expect(reloaded.reconciledAt).toBe(reconcileReceipt.reconciledAt);
      expect(reloaded.reconciledByActorId).toBe("pa-finance-reconcile");
      expect(reloaded.reconciliationReason).toBe("reload regression reason");
      expect(reloaded.reconciliationEvidenceRef).toBe("stmt-reload-1");
      expect(reloaded.reconciliationReceiptId).toBe(reconcileReceipt.receiptId);
      expect(reloaded.status).toBe("paid");
    });
  });

  describe("reimbursement-workflow-client (task-local UI adapter)", () => {
    it("calls the export route with the supplied idempotency key", async () => {
      const post = vi.fn().mockResolvedValue({ receiptId: "r-1" });
      const client = { post } as unknown as { post: typeof post };

      await exportReimbursementBatch(client as any, "batch-123", {
        idempotencyKey: "idem-export-1",
      });

      expect(post).toHaveBeenCalledWith(
        "/api/reimbursements/batch-123/export",
        { idempotencyKey: "idem-export-1" },
      );
    });

    it("calls the reconcile route with the command body and idempotency key", async () => {
      const post = vi.fn().mockResolvedValue({ receiptId: "r-2" });
      const client = { post } as unknown as { post: typeof post };

      await markReimbursementBatchReconciled(
        client as any,
        "batch-456",
        { reason: "bank statement matched" },
        { idempotencyKey: "idem-reconcile-1" },
      );

      expect(post).toHaveBeenCalledWith(
        "/api/reimbursements/batch-456/reconcile",
        {
          body: { reason: "bank statement matched" },
          idempotencyKey: "idem-reconcile-1",
        },
      );
    });
  });
});
