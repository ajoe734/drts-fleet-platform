import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementController } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.controller";
import { BillingSettlementService } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.service";

function createHarness() {
  const auditService = new AuditNotificationService();
  const service = new BillingSettlementService(auditService);
  const controller = new BillingSettlementController(service);
  return { auditService, service, controller };
}

async function setupBatch(service: BillingSettlementService) {
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
  return { batchId };
}

describe("SR-PROOF-001: Remittance Proof Lifecycle, MIME & Checksum Verification", () => {
  it("accepts supported MIME types (pdf, png, jpeg, webp) and records accurate SHA-256", async () => {
    const { service } = createHarness();
    const { batchId } = await setupBatch(service);

    const testCases = [
      {
        fileName: "slip.pdf",
        mimeType: "application/pdf",
        content: "PDF_PAYMENT_PROOF_CONTENT",
      },
      {
        fileName: "slip.png",
        mimeType: "image/png",
        content: "PNG_PAYMENT_PROOF_IMAGE_BINARY",
      },
      {
        fileName: "slip.jpeg",
        mimeType: "image/jpeg",
        content: "JPEG_PAYMENT_PROOF_IMAGE_BINARY",
      },
      {
        fileName: "slip.webp",
        mimeType: "image/webp",
        content: "WEBP_PAYMENT_PROOF_IMAGE_BINARY",
      },
    ];

    for (const tc of testCases) {
      const buffer = Buffer.from(tc.content);
      const expectedSha256 = createHash("sha256").update(buffer).digest("hex");

      const proof = await service.uploadRemittanceProof(batchId, {
        fileName: tc.fileName,
        mimeType: tc.mimeType,
        contentBase64: buffer.toString("base64"),
        autoScan: true,
      });

      expect(proof.batchId).toBe(batchId);
      expect(proof.fileName).toBe(tc.fileName);
      expect(proof.mimeType).toBe(tc.mimeType);
      expect(proof.fileSize).toBe(buffer.length);
      expect(proof.sha256).toBe(expectedSha256);
      expect(proof.scanStatus).toBe("clean");
      expect(proof.uploadedAt).toBeDefined();
    }
  });

  it("rejects unsupported MIME types with 400 VALIDATION_ERROR", async () => {
    const { service } = createHarness();
    const { batchId } = await setupBatch(service);

    const unsupportedMimes = [
      "text/plain",
      "application/zip",
      "application/x-msdownload",
      "text/javascript",
      "",
    ];

    for (const mime of unsupportedMimes) {
      await expect(
        service.uploadRemittanceProof(batchId, {
          fileName: "file.ext",
          mimeType: mime,
          contentBase64: Buffer.from("dummy content").toString("base64"),
        }),
      ).rejects.toThrowError(ApiRequestError);

      try {
        await service.uploadRemittanceProof(batchId, {
          fileName: "file.ext",
          mimeType: mime,
          contentBase64: Buffer.from("dummy content").toString("base64"),
        });
      } catch (err: any) {
        expect(err.getStatus()).toBe(400);
        expect(err.code).toBe("VALIDATION_ERROR");
      }
    }
  });

  it("rejects empty or corrupt content payload with 400 VALIDATION_ERROR", async () => {
    const { service } = createHarness();
    const { batchId } = await setupBatch(service);

    await expect(
      service.uploadRemittanceProof(batchId, {
        fileName: "empty.pdf",
        mimeType: "application/pdf",
        contentBase64: "",
      }),
    ).rejects.toThrowError(ApiRequestError);

    await expect(
      service.uploadRemittanceProof(batchId, {
        fileName: "blank.pdf",
        mimeType: "application/pdf",
        contentBase64: "   ",
      }),
    ).rejects.toThrowError(ApiRequestError);
  });

  it("handles manual scan transition from pending to clean", async () => {
    const { service } = createHarness();
    const { batchId } = await setupBatch(service);

    // 1. Upload proof without autoScan
    const proof = await service.uploadRemittanceProof(batchId, {
      fileName: "pending_slip.pdf",
      mimeType: "application/pdf",
      contentBase64: Buffer.from("CLEAN_DOCUMENT_PAYMENT").toString("base64"),
      autoScan: false,
    });
    expect(proof.scanStatus).toBe("pending");

    // 2. Perform explicit scan
    const scanned = await service.scanRemittanceProof(batchId, proof.proofId, {
      scanStatus: "clean",
    });
    expect(scanned.scanStatus).toBe("clean");
    expect(scanned.scannedAt).toBeDefined();

    // 3. Batch metadata now reflects clean proof
    const batch = service.getReimbursementBatch(batchId);
    expect(batch.remittanceProof?.scanStatus).toBe("clean");
  });

  it("handles scan marking file as infected and blocks markPaid", async () => {
    const { service } = createHarness();
    const { batchId } = await setupBatch(service);
    const pendingBatch = service.getReimbursementBatch(batchId);
    await service.approveReimbursementBatch(batchId, {
      statementId: pendingBatch.statementId,
    });

    // 1. Upload proof with autoScan: false
    const proof = await service.uploadRemittanceProof(batchId, {
      fileName: "suspicious_slip.pdf",
      mimeType: "application/pdf",
      contentBase64: Buffer.from("SUSPICIOUS_PAYLOAD").toString("base64"),
      autoScan: false,
    });
    expect(proof.scanStatus).toBe("pending");

    // 2. Scan marks as infected
    const scanned = await service.scanRemittanceProof(batchId, proof.proofId, {
      scanStatus: "infected",
      reason: "Suspicious payload detected",
    });
    expect(scanned.scanStatus).toBe("infected");

    // 3. Payment gate throws REMITTANCE_PROOF_NOT_SCANNED
    expect(() =>
      service.markReimbursementPaid(batchId, {
        remittanceProofId: proof.proofId,
      }),
    ).toThrowError(ApiRequestError);
  });

async function drain(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

  it("streams proof download through controller with appropriate headers", async () => {
    const { service, controller } = createHarness();
    const { batchId } = await setupBatch(service);

    const fileContent = "ATTACHED_OFFICIAL_BANK_RECORD_PDF";
    const uploadResult = await controller.uploadRemittanceProof(batchId, {
      fileName: "official_bank_record.pdf",
      mimeType: "application/pdf",
      contentBase64: Buffer.from(fileContent).toString("base64"),
      autoScan: true,
    });
    const proofId = uploadResult.data.proofId;

    // Download via controller
    const streamable = controller.downloadRemittanceProof(batchId, proofId);
    expect(streamable.options.type).toBe("application/pdf");
    expect(streamable.options.disposition).toContain("official_bank_record.pdf");
    const downloadedBuffer = await drain(streamable.getStream());
    expect(downloadedBuffer.toString()).toBe(fileContent);
  });
});
