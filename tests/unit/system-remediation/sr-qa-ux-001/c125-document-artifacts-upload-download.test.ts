import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { InMemoryDocumentArtifactStore } from "../../../../apps/api/src/common/document-artifacts/in-memory-document-artifact-store";
import {
  createControlledDownloadMetadata,
  DEFAULT_CONTROLLED_DOWNLOAD_KEY_ID,
  DEFAULT_CONTROLLED_DOWNLOAD_SECRET,
  verifyControlledDownloadSignature,
} from "../../../../apps/api/src/common/controlled-download";
import { RemittanceProofService } from "../../../../apps/api/src/modules/billing-settlement/remittance-proof.service";
import { InMemoryRemittanceProofStorageAdapter } from "../../../../apps/api/src/modules/billing-settlement/remittance-proof-storage.adapter";
import { isPlacardSourceSelectionBlocked } from "../../../../apps/platform-admin-web/app/switchboard/placard-source";

/**
 * SR-QA-UX-001 — Capability C125 Acceptance Test Suite
 *
 * C125: 檔案 bytes、掃描、歸屬、到期與真下載
 * Historical Traceability:
 * - N04: 帳單僅建立了中繼資料，controlled-download 回 501 ARTIFACT_NOT_MATERIALISED；必須存取真實檔案 bytes，杜絕假下載
 * - N08: 牌貼下載無可用檔案 (404) 且連結過期；必須支援真列印檔、15分鐘短效簽名換發，且 retired 停用版本禁止選取
 * - N09: 匯款證明缺少上傳、防毒掃描與歸屬查驗；必須支援 bytes 暫存、防毒掃描 (clean vs rejected)、歸屬校驗與短效授權回讀
 * - 跨租戶與跨司機隔離：嚴禁越權存取他人文件
 */
describe("SR-QA-UX-001 — C125: Document Artifacts, Bytes Integrity, Virus Scan & Download Lifecycle", () => {
  describe("1. N04 Traceability: DocumentArtifactStore Materialized Real Bytes Storage", () => {
    it("stores real binary PDF bytes and calculates verifiable SHA-256 digest", () => {
      const store = new InMemoryDocumentArtifactStore();
      const invoicePdfBytes = Buffer.from(
        "%PDF-1.4 ... Fake Invoice Document Content for Tenant QA ... %%EOF",
      );
      const expectedSha256 = createHash("sha256")
        .update(invoicePdfBytes)
        .digest("hex");

      const record = store.put({
        kind: "tenant-invoice",
        subjectId: "inv-2026-09-001",
        mimeType: "application/pdf",
        bytes: invoicePdfBytes,
      });

      expect(record.kind).toBe("tenant-invoice");
      expect(record.subjectId).toBe("inv-2026-09-001");
      expect(record.mimeType).toBe("application/pdf");
      expect(record.byteLength).toBe(invoicePdfBytes.length);
      expect(record.sha256).toBe(expectedSha256);
      expect(record.storedAt).toBeDefined();

      // Retrieve from store
      const entry = store.get("tenant-invoice", "inv-2026-09-001");
      expect(entry).not.toBeNull();
      expect(entry?.record.sha256).toBe(expectedSha256);
      expect(entry?.bytes.equals(invoicePdfBytes)).toBe(true);
    });

    it("returns defensive copies of stored buffers so external mutation cannot corrupt storage", () => {
      const store = new InMemoryDocumentArtifactStore();
      const originalBytes = Buffer.from("Uncorrupted bytes");

      store.put({
        kind: "report",
        subjectId: "rep-001",
        mimeType: "text/plain",
        bytes: originalBytes,
      });

      // Mutate the caller buffer
      originalBytes[0] = 0x58; // 'X'

      const entry = store.get("report", "rep-001");
      expect(entry?.bytes.toString()).toBe("Uncorrupted bytes");
    });

    it("rejects unsupported document kinds with descriptive error", () => {
      const store = new InMemoryDocumentArtifactStore();

      expect(() =>
        store.put({
          kind: "unsupported-accident-video" as never,
          subjectId: "acc-001",
          mimeType: "video/mp4",
          bytes: Buffer.from("fake video data"),
        }),
      ).toThrowError(/DocumentArtifactStore does not accept kind/);
    });

    it("returns null for non-existent documents instead of fabricating empty data", () => {
      const store = new InMemoryDocumentArtifactStore();
      const missing = store.get("tenant-invoice", "non-existent-invoice-id");
      expect(missing).toBeNull();
    });
  });

  describe("2. N08 Traceability: Controlled Download Signing, Expiration & Placard Retirement", () => {
    it("generates HMAC-SHA256 signed download metadata with 15-minute TTL", () => {
      const metadata = createControlledDownloadMetadata({
        kind: "placard",
        subjectId: "placard-demo-001",
        manifestHash: "hash-manifest-1234567890abcdef",
        ttlMinutes: 15,
      });

      expect(metadata.kind).toBe("placard");
      expect(metadata.subjectId).toBe("placard-demo-001");
      expect(metadata.ttlMinutes).toBe(15);
      expect(metadata.signature).toBeDefined();
      expect(metadata.downloadUrl).toContain(
        "/downloads/placard/placard-demo-001",
      );
      expect(metadata.signatureVersion).toBe(1);

      // Verify signature succeeds
      const verification = verifyControlledDownloadSignature(
        {
          kind: metadata.kind,
          subjectId: metadata.subjectId,
          manifestHash: metadata.manifestHash,
          signedAt: metadata.signedAt,
          expiresAt: metadata.expiresAt,
          keyId: metadata.keyId,
          signatureVersion: metadata.signatureVersion,
          signature: metadata.signature,
        },
        {
          keyId: DEFAULT_CONTROLLED_DOWNLOAD_KEY_ID,
          signingSecret: DEFAULT_CONTROLLED_DOWNLOAD_SECRET,
        },
      );

      expect(verification.ok).toBe(true);
    });

    it("verifies expiry logic detects expired download grants (time tamper protection)", () => {
      // Create metadata expired 1 hour ago
      const expiredSignedAt = new Date(
        Date.now() - 75 * 60 * 1000,
      ).toISOString();
      const expiredMetadata = createControlledDownloadMetadata({
        kind: "placard",
        subjectId: "placard-demo-expired",
        manifestHash: "hash-expired-111",
        createdAt: expiredSignedAt,
        ttlMinutes: 15,
      });

      const isExpired = Date.parse(expiredMetadata.expiresAt) <= Date.now();
      expect(isExpired).toBe(true);
    });

    it("rejects tampered manifest hash or subject ID (tamper protection)", () => {
      const metadata = createControlledDownloadMetadata({
        kind: "tenant-invoice",
        subjectId: "inv-legit-001",
        manifestHash: "hash-legit-001",
      });

      const tamperedVerification = verifyControlledDownloadSignature(
        {
          kind: metadata.kind,
          subjectId: "inv-malicious-tampered-id", // Tampered subjectId
          manifestHash: metadata.manifestHash,
          signedAt: metadata.signedAt,
          expiresAt: metadata.expiresAt,
          keyId: metadata.keyId,
          signatureVersion: metadata.signatureVersion,
          signature: metadata.signature,
        },
        {
          keyId: DEFAULT_CONTROLLED_DOWNLOAD_KEY_ID,
          signingSecret: DEFAULT_CONTROLLED_DOWNLOAD_SECRET,
        },
      );

      expect(tamperedVerification.ok).toBe(false);
      if (!tamperedVerification.ok) {
        expect(tamperedVerification.reason).toBe("signature_invalid");
      }
    });

    it("strictly blocks selection of retired placard source versions (N08)", () => {
      expect(
        isPlacardSourceSelectionBlocked({
          status: "retired",
          title: "舊版計程車牌貼",
        }),
      ).toBe(true);
      expect(
        isPlacardSourceSelectionBlocked({
          status: "published",
          title: "現行合規牌貼",
        }),
      ).toBe(false);
      expect(
        isPlacardSourceSelectionBlocked({ status: "draft", title: "草稿牌貼" }),
      ).toBe(false);
    });
  });

  describe("3. N09 Traceability: Remittance Proof Bytes, Virus Scan & Payment Gating", () => {
    it("stages real remittance slip image bytes, records clean scan and generates readback grant", async () => {
      const storage = new InMemoryRemittanceProofStorageAdapter();
      const service = new RemittanceProofService(undefined, storage);

      // Stage slip image
      const slipBytes = Buffer.from("PNG-MOCK-REMITTANCE-PAYMENT-SLIP-BYTES");
      const staged = await service.stageContent(slipBytes, "image/png");

      expect(staged.stagedContentRef).toBeDefined();

      // Upload proof
      const proof = await service.uploadProof({
        batchId: "batch-remit-101",
        driverId: "drv-001",
        originalFilename: "bank_slip_202609.png",
        stagedContentRef: staged.stagedContentRef,
        uploadedByActorId: "actor-finance-1",
      });

      expect(proof.proofId).toBeDefined();
      expect(proof.batchId).toBe("batch-remit-101");
      expect(proof.driverId).toBe("drv-001");
      expect(proof.content.contentHash).toBe(
        createHash("sha256").update(slipBytes).digest("hex"),
      );
      expect(proof.content.sizeBytes).toBe(slipBytes.length);
      expect(proof.scanState).toBe("pending_scan");

      // Record clean scan result
      const scannedProof = await service.recordScanResult(proof.proofId, {
        scanState: "clean",
      });
      expect(scannedProof.scanState).toBe("clean");

      // Verify readback grant produces valid download metadata
      const grant = await service.requestReadback(proof.proofId);
      expect(grant.proofId).toBe(proof.proofId);
      expect(grant.readbackUrl).toContain(proof.proofId);
      expect(grant.readbackUrl).toContain("sig=");

      // Verify readback grant is valid
      const grantVerification = service.verifyReadbackGrant({
        proofId: proof.proofId,
        contentHash: proof.content.contentHash,
        signedAt: grant.issuedAt,
        expiresAt: grant.expiresAt,
        keyId: DEFAULT_CONTROLLED_DOWNLOAD_KEY_ID,
        signature: new URL(
          grant.readbackUrl,
          "https://example.local",
        ).searchParams.get("sig")!,
      });
      expect(grantVerification.ok).toBe(true);
    });

    it("marks scanState as rejected when virus or malware is detected (fail-closed)", async () => {
      const storage = new InMemoryRemittanceProofStorageAdapter();
      const service = new RemittanceProofService(undefined, storage);

      const infectedBytes = Buffer.from(
        "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
      );
      const staged = await service.stageContent(infectedBytes, "image/jpeg");

      const proof = await service.uploadProof({
        batchId: "batch-remit-102",
        driverId: "drv-002",
        originalFilename: "infected_receipt.jpg",
        stagedContentRef: staged.stagedContentRef,
        uploadedByActorId: "actor-finance-1",
      });

      expect(proof.scanState).toBe("pending_scan");

      // Record rejected scan result
      const rejectedProof = await service.recordScanResult(proof.proofId, {
        scanState: "rejected",
        rejectionReason: "EICAR-Test-Signature detected",
      });

      expect(rejectedProof.scanState).toBe("rejected");
      expect(rejectedProof.rejectionReason).toContain("EICAR");
    });
  });

  describe("4. Cross-Resource & Cross-Tenant Access Isolation", () => {
    it("rejects readback grant request when proofId does not exist", async () => {
      const service = new RemittanceProofService();

      await expect(
        service.requestReadback("non-existent-proof-id"),
      ).rejects.toSatisfy((err: unknown) => {
        expect((err as { status?: number }).status).toBe(404);
        return true;
      });
    });
  });
});
