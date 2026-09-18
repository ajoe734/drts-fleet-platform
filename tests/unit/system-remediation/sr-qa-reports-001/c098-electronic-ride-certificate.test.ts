import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { CertificateSupportService } from "../../../../apps/api/src/modules/certificate-support/certificate-support.service";
import { renderCertificateArtifact } from "../../../../apps/api/src/modules/certificate-support/certificate-artifact.renderer";
import type {
  CertificateSupportRow,
  CertificateSupportView,
} from "../../../../apps/api/src/modules/certificate-support/certificate-support.types";

const mockCertificateView: CertificateSupportView = {
  certificateId: "cert-2026-001",
  orderId: "order-test-001",
  certificateNo: "RC-2026-0913-001",
  certificateVersion: "v2",
  state: "available",
  fareMinor: 45000,
  currency: "NTD",
  issuedAt: "2026-09-13T08:00:00.000Z",
  tripId: "trip-test-001",
  plateNo: "TDC-8899",
  pickupAt: "2026-09-13T07:15:00.000Z",
  dropoffAt: "2026-09-13T07:55:00.000Z",
  travelDurationSeconds: 2400,
  routeSummary: "臺北車站東三門 → 內湖科技園區瑞光路",
  distanceMeters: 11200,
  tollMinor: 0,
  consumerServicePhone: "0800-090-000",
  authorityComplaintPhone: "1999",
  htmlUrl: "/certificates/cert-2026-001.html",
  pdfUrl: "/certificates/cert-2026-001.pdf",
  supersededByCertificateId: null,
  artifactBlockers: [],
  regeneration: {
    enabled: false,
    reasonCode: null,
  },
};

const mockCertificateRow: CertificateSupportRow = {
  receiptId: "cert-2026-001",
  orderId: "order-test-001",
  receiptNo: "RC-2026-0913-001",
  receiptVersion: 2,
  isCurrent: true,
  supersedesReceiptId: null,
  regenerationIdempotencyKey: null,
  regeneratedByActorId: null,
  regenerationReason: null,
  regenerationAuditId: null,
  amountMinor: 45000,
  currency: "NTD",
  issuedAt: "2026-09-13T08:00:00.000Z",
  record: {
    tripId: "trip-test-001",
    plateNo: "TDC-8899",
    pickupAt: "2026-09-13T07:15:00.000Z",
    dropoffAt: "2026-09-13T07:55:00.000Z",
    travelDurationSeconds: 2400,
    routeSummary: "臺北車站東三門 → 內湖科技園區瑞光路",
    distanceMeters: 11200,
    tollMinor: 0,
    consumerServicePhone: "0800-090-000",
    authorityComplaintPhone: "1999",
    certificateVersion: "v2",
    htmlUrl: "/certificates/cert-2026-001.html",
    pdfUrl: "/certificates/cert-2026-001.pdf",
  },
};

function createCertificateService(rows: CertificateSupportRow[] = [mockCertificateRow]) {
  const repository = {
    isEnabled: vi.fn(() => true),
    list: vi.fn(async () => rows),
    findById: vi.fn(async (id: string) =>
      rows.find((r) => r.receiptId === id || r.receiptNo === id) ?? null,
    ),
  };
  return {
    repository,
    service: new CertificateSupportService(repository as never),
  };
}

describe("C098: 多元計程車電子證明 HTML/PDF 渲染與下載驗收", () => {
  it("專屬渲染器產製合法繁中 HTML 證明檔，具備完整路徑、車牌、金額與免責說明", () => {
    const artifact = renderCertificateArtifact(mockCertificateView, "html");

    expect(artifact.contentType).toBe("text/html; charset=utf-8");
    expect(artifact.fileName).toBe("RC-2026-0913-001.html");

    const html = artifact.buffer.toString("utf-8");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("RC-2026-0913-001 電子乘車證明");
    expect(html).toContain("TDC-8899");
    expect(html).toContain("臺北車站東三門 → 內湖科技園區瑞光路");
    expect(html).toContain("NTD 450");
    expect(html).toContain("0800-090-000");
    expect(html).toContain("1999");
    expect(html).toContain("本文件由已保存的 canonical 電子乘車證明紀錄產生。");
  });

  it("專屬渲染器產製真 PDF-1.7 格式證明檔，內含 MSung-Light CJK CIDFont 與 XMP 中繼資料", () => {
    const artifact = renderCertificateArtifact(mockCertificateView, "pdf");

    expect(artifact.contentType).toBe("application/pdf");
    expect(artifact.fileName).toBe("RC-2026-0913-001.pdf");

    const pdfBuffer = artifact.buffer;
    const pdfHeader = pdfBuffer.subarray(0, 8).toString("utf-8");
    expect(pdfHeader).toContain("%PDF-1.7");

    const pdfString = pdfBuffer.toString("binary");
    // 驗證內嵌 CJK CIDFont 定義
    expect(pdfString).toContain("/BaseFont /MSung-Light");
    expect(pdfString).toContain("/Encoding /UniCNS-UTF16-H");
    expect(pdfString).toContain("/CIDFontType0");
    expect(pdfString).toContain("/Registry (Adobe) /Ordering (CNS1)");

    // 驗證 XMP 元數據區塊
    expect(pdfString).toContain("<x:xmpmeta xmlns:x=\"adobe:ns:meta/\">");
    expect(pdfString).toContain("drts:certificateId=\"cert-2026-001\"");
    expect(pdfString).toContain("drts:orderId=\"order-test-001\"");
    expect(pdfString).toContain("drts:tripId=\"trip-test-001\"");
    expect(pdfString).toContain("%%EOF");
  });

  it("透過 CertificateSupportService 下載有效證明檔案 (available / superseded)", async () => {
    const { service } = createCertificateService();

    // 1. 下載 HTML 證明
    const htmlArtifact = await service.getArtifact("cert-2026-001", "html");
    expect(htmlArtifact.contentType).toBe("text/html; charset=utf-8");
    expect(htmlArtifact.fileName).toBe("RC-2026-0913-001.html");

    // 2. 下載 PDF 證明
    const pdfArtifact = await service.getArtifact("cert-2026-001", "pdf");
    expect(pdfArtifact.contentType).toBe("application/pdf");
    expect(pdfArtifact.fileName).toBe("RC-2026-0913-001.pdf");
    expect(pdfArtifact.buffer.subarray(0, 8).toString("utf-8")).toContain("%PDF-1.7");
  });

  it("負向狀態防禦：未備妥或無效狀態之證明檔請求時拋出 409 CONFLICT", async () => {
    const unreadyRow: CertificateSupportRow = {
      ...mockCertificateRow,
      receiptId: "cert-unready-001",
      record: {
        ...mockCertificateRow.record,
        certificateState: "generating",
      },
    };
    const { service } = createCertificateService([unreadyRow]);

    try {
      await service.getArtifact("cert-unready-001", "pdf");
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(409);
      expect(err.response?.error?.code).toBe("CERTIFICATE_ARTIFACT_NOT_AVAILABLE");
    }
  });

  it("不存在之證明防呆：查詢無效 ID 時拋出 404 NOT_FOUND", async () => {
    const { service } = createCertificateService([]);

    try {
      await service.getArtifact("non-existent-cert", "pdf");
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(404);
      expect(err.response?.error?.code).toBe("CERTIFICATE_NOT_FOUND");
    }
  });
});
