import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
type StreamableFileLike = {
  getStream(): NodeJS.ReadableStream | Buffer;
  getHeaders(): { type?: string };
};

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import {
  createControlledDownloadMetadata,
} from "../../../../apps/api/src/common/controlled-download";
import { ControlledDownloadController } from "../../../../apps/api/src/modules/controlled-download/controlled-download.controller";
import { InMemoryDocumentArtifactStore } from "../../../../apps/api/src/common/document-artifacts";

describe("C097: 可列印車內牌貼下載、簽章驗證與版本一致性驗收", () => {
  it("成功發行車內牌貼簽章下載連結，並能自 DocumentArtifactStore 回讀完整列印檔案", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const controller = new ControlledDownloadController(store);

    const placardVersionId = "placard-v-202609-001";
    const samplePdfContent = Buffer.from(
      "%PDF-1.7\n1 0 obj\n<< /Title (DRTS 多元計程車車內牌貼 Q3) >>\nendobj\n%%EOF",
      "utf-8",
    );
    const manifestHash = createHash("sha256")
      .update(samplePdfContent)
      .digest("hex");

    // 1. 將真實列印檔置入 DocumentArtifactStore (kind: placard)
    store.put({
      kind: "placard",
      subjectId: placardVersionId,
      mimeType: "application/pdf",
      bytes: samplePdfContent,
    });

    // 2. 產製控管下載中繼資料（含 15 分鐘效期與 HMAC 簽章）
    const downloadMetadata = createControlledDownloadMetadata({
      kind: "placard",
      subjectId: placardVersionId,
      manifestHash,
      ttlMinutes: 15,
    });

    expect(downloadMetadata.downloadUrl).toContain("/downloads/placard/");
    expect(downloadMetadata.downloadUrl).toContain(`manifest_hash=${manifestHash}`);
    expect(downloadMetadata.downloadUrl).toContain("sig=");

    const url = new URL(`https://api.drts.local${downloadMetadata.downloadUrl}`);
    const params = url.searchParams;

    // 3. 透過 ControlledDownloadController 進行真實解析下載
    const response = controller.resolve(
      "placard",
      placardVersionId,
      params.get("signed_at") ?? undefined,
      params.get("expires_at") ?? undefined,
      params.get("key_id") ?? undefined,
      params.get("manifest_hash") ?? undefined,
      params.get("sig") ?? undefined,
      params.get("sig_v") ?? undefined,
    );

    const streamable = response as StreamableFileLike;
    expect(typeof streamable.getStream).toBe("function");
    const stream = streamable.getStream();
    const bytes = Buffer.isBuffer(stream)
      ? stream
      : await new Promise<Buffer>((resolve, reject) => {
          const chunks: Buffer[] = [];
          (stream as any).on("data", (chunk: any) => chunks.push(Buffer.from(chunk)));
          (stream as any).on("end", () => resolve(Buffer.concat(chunks)));
          (stream as any).on("error", reject);
        });
    expect(bytes.toString("utf-8")).toContain("DRTS 多元計程車車內牌貼 Q3");
  });

  it("過期連結防禦：超過效期之牌貼下載連結必須拒絕 (410 GONE / CONTROLLED_DOWNLOAD_EXPIRED)", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const controller = new ControlledDownloadController(store);

    const placardVersionId = "placard-v-expired-001";
    const content = Buffer.from("%PDF-1.7 placard content", "utf-8");
    const manifestHash = createHash("sha256").update(content).digest("hex");

    store.put({
      kind: "placard",
      subjectId: placardVersionId,
      mimeType: "application/pdf",
      bytes: content,
    });

    // 產製 2026-08-25 之過期簽章（符合審計缺口描述：本輪連結仍 8/25 到期）
    const expiredSignedAt = "2026-08-25T08:00:00.000Z";
    const downloadMetadata = createControlledDownloadMetadata({
      kind: "placard",
      subjectId: placardVersionId,
      manifestHash,
      createdAt: expiredSignedAt,
      ttlMinutes: 15, // 於 2026-08-25T08:15:00.000Z 到期
    });

    const url = new URL(`https://api.drts.local${downloadMetadata.downloadUrl}`);
    const params = url.searchParams;

    try {
      controller.resolve(
        "placard",
        placardVersionId,
        params.get("signed_at") ?? undefined,
        params.get("expires_at") ?? undefined,
        params.get("key_id") ?? undefined,
        params.get("manifest_hash") ?? undefined,
        params.get("sig") ?? undefined,
        params.get("sig_v") ?? undefined,
      );
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(410);
      expect(err.response?.error?.code).toBe("CONTROLLED_DOWNLOAD_EXPIRED");
    }
  });

  it("簽章安全防禦：竄改參數或偽造簽章時嚴格拒絕 (403 FORBIDDEN / CONTROLLED_DOWNLOAD_SIGNATURE_INVALID)", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const controller = new ControlledDownloadController(store);

    const placardVersionId = "placard-v-tamper-001";
    const content = Buffer.from("%PDF-1.7 placard", "utf-8");
    const manifestHash = createHash("sha256").update(content).digest("hex");

    const metadata = createControlledDownloadMetadata({
      kind: "placard",
      subjectId: placardVersionId,
      manifestHash,
      ttlMinutes: 30,
    });

    const url = new URL(`https://api.drts.local${metadata.downloadUrl}`);
    const params = url.searchParams;

    // 1. 竄改 subjectId 嘗試平行越權
    try {
      controller.resolve(
        "placard",
        "placard-v-other-tenant", // 竄改主體
        params.get("signed_at") ?? undefined,
        params.get("expires_at") ?? undefined,
        params.get("key_id") ?? undefined,
        params.get("manifest_hash") ?? undefined,
        params.get("sig") ?? undefined,
        params.get("sig_v") ?? undefined,
      );
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(403);
      expect(err.response?.error?.code).toBe("CONTROLLED_DOWNLOAD_SIGNATURE_INVALID");
    }

    // 2. 竄改簽章字串
    try {
      controller.resolve(
        "placard",
        placardVersionId,
        params.get("signed_at") ?? undefined,
        params.get("expires_at") ?? undefined,
        params.get("key_id") ?? undefined,
        params.get("manifest_hash") ?? undefined,
        "deadbeefbadc0ffee112233445566778899aabbccddeeff001122334455667788", // 偽造 HMAC
        params.get("sig_v") ?? undefined,
      );
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(403);
      expect(err.response?.error?.code).toBe("CONTROLLED_DOWNLOAD_SIGNATURE_INVALID");
    }
  });

  it("內容哈希不一致防禦：若牌貼檔案已被更換/內容與簽章不符，拋出 409 CONFLICT", async () => {
    const store = new InMemoryDocumentArtifactStore();
    const controller = new ControlledDownloadController(store);

    const placardVersionId = "placard-v-content-mismatch";
    const originalContent = Buffer.from("%PDF-1.7 version 1", "utf-8");
    const originalHash = createHash("sha256").update(originalContent).digest("hex");

    // 簽發基於 originalHash 之下載連結
    const metadata = createControlledDownloadMetadata({
      kind: "placard",
      subjectId: placardVersionId,
      manifestHash: originalHash,
      ttlMinutes: 15,
    });

    // 隨後 Store 儲存的是被更換之新檔案（不同 hash）
    const newContent = Buffer.from("%PDF-1.7 modified version 2", "utf-8");
    store.put({
      kind: "placard",
      subjectId: placardVersionId,
      mimeType: "application/pdf",
      bytes: newContent,
    });

    const url = new URL(`https://api.drts.local${metadata.downloadUrl}`);
    const params = url.searchParams;

    try {
      controller.resolve(
        "placard",
        placardVersionId,
        params.get("signed_at") ?? undefined,
        params.get("expires_at") ?? undefined,
        params.get("key_id") ?? undefined,
        params.get("manifest_hash") ?? undefined,
        params.get("sig") ?? undefined,
        params.get("sig_v") ?? undefined,
      );
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(409);
      expect(err.response?.error?.code).toBe("CONTROLLED_DOWNLOAD_CONTENT_MISMATCH");
    }
  });

  it("未落真檔誠實揭露：簽章有效但尚未產生實際檔案時，拋出 501 ARTIFACT_NOT_MATERIALISED", async () => {
    const emptyStore = new InMemoryDocumentArtifactStore();
    const controller = new ControlledDownloadController(emptyStore);

    const placardVersionId = "placard-v-unmaterialised";
    const manifestHash = createHash("sha256").update("unmaterialised").digest("hex");

    // 簽發有效連結，但 store 內無任何檔案
    const metadata = createControlledDownloadMetadata({
      kind: "placard",
      subjectId: placardVersionId,
      manifestHash,
      ttlMinutes: 15,
    });

    const url = new URL(`https://api.drts.local${metadata.downloadUrl}`);
    const params = url.searchParams;

    try {
      controller.resolve(
        "placard",
        placardVersionId,
        params.get("signed_at") ?? undefined,
        params.get("expires_at") ?? undefined,
        params.get("key_id") ?? undefined,
        params.get("manifest_hash") ?? undefined,
        params.get("sig") ?? undefined,
        params.get("sig_v") ?? undefined,
      );
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(501);
      expect(err.response?.error?.code).toBe("ARTIFACT_NOT_MATERIALISED");
      expect(err.response?.error?.message).toContain("No file is produced for \"placard\"");
    }
  });

  it("請求完整性防呆：缺少簽章檢查所需之必填欄位時拋出 400 BAD_REQUEST", async () => {
    const controller = new ControlledDownloadController();

    try {
      controller.resolve(
        "placard",
        "placard-001",
        undefined, // missing signed_at
        undefined, // missing expires_at
        undefined,
        undefined,
        undefined,
        undefined,
      );
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(400);
      expect(err.response?.error?.code).toBe("CONTROLLED_DOWNLOAD_LINK_INCOMPLETE");
      expect(err.response?.error?.details?.missing).toEqual([
        "signed_at",
        "expires_at",
        "key_id",
        "manifest_hash",
        "sig",
        "sig_v",
      ]);
    }
  });
});
