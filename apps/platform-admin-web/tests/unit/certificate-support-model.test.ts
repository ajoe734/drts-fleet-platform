import { describe, expect, it } from "vitest";

import {
  CERTIFICATE_SUPPORT_STATES,
  classifyCertificateSupportError,
  displayValue,
  formatDistance,
  formatDuration,
  formatMoney,
  hasCertificateReadScope,
  hasCertificateWriteScope,
  parseCertificateRegenerationResult,
  parseCertificateSupportList,
  parseCertificateSupportView,
} from "../../app/multi-taxi-certificates/certificate-support-model";
import {
  certificateStateCopy,
  certificateSupportCopy,
  displayCertificateValue,
} from "../../app/multi-taxi-certificates/translations";

const baseView = {
  certificateId: "receipt-001",
  certificateNo: "RC-2607-0186",
  orderId: "order-001",
  tripId: "trip-001",
  state: "available",
  certificateVersion: "v2",
  issuedAt: "2026-07-20T07:08:00.000Z",
  plateNo: "BKR-2208",
  pickupAt: "2026-07-20T06:32:00.000Z",
  dropoffAt: "2026-07-20T07:07:00.000Z",
  travelDurationSeconds: 2100,
  routeSummary: "松仁路 → 南京東路二段",
  distanceMeters: 6420,
  fareMinor: 35500,
  tollMinor: 0,
  currency: "NTD",
  consumerServicePhone: "0800-090-000",
  authorityComplaintPhone: "1999",
  htmlUrl: "/certificates/receipt-001.html",
  pdfUrl: "/certificates/receipt-001.pdf",
  supersededByCertificateId: null,
  regeneration: {
    enabled: true,
    reasonCode: null,
  },
};

describe("certificate support model", () => {
  it.each(CERTIFICATE_SUPPORT_STATES)(
    "parses the canonical %s state",
    (state) => {
      expect(parseCertificateSupportView({ ...baseView, state }).state).toBe(
        state,
      );
    },
  );

  it("parses the list only when total and items agree", () => {
    expect(
      parseCertificateSupportList({
        items: [baseView],
        total: 1,
        query: "RC-2607",
      }),
    ).toMatchObject({ total: 1, query: "RC-2607" });
    expect(() =>
      parseCertificateSupportList({
        items: [baseView],
        total: 2,
        query: null,
      }),
    ).toThrow("CERTIFICATE_SUPPORT_TOTAL_INVALID");
  });

  it("accepts only a consistent server-authorized regeneration action", () => {
    expect(parseCertificateSupportView(baseView).regeneration.enabled).toBe(
      true,
    );
    expect(() =>
      parseCertificateSupportView({
        ...baseView,
        regeneration: {
          enabled: true,
          reasonCode: "certificate_writer_unavailable",
        },
      }),
    ).toThrow("CERTIFICATE_SUPPORT_VIEW_INVALID");
  });

  it("parses an audited regeneration result", () => {
    expect(
      parseCertificateRegenerationResult({
        certificate: baseView,
        actionReceipt: {
          actionId: "idem-001",
          auditId: "audit-001",
          resourceType: "multi_taxi_electronic_receipt",
          resourceId: "receipt-002",
          status: "completed",
          message: "regenerated",
        },
      }).actionReceipt.auditId,
    ).toBe("audit-001");
  });

  it("keeps missing display values explicit instead of formatting zero", () => {
    expect(displayValue(null)).toBe("未取得");
    expect(formatMoney(null)).toBe("未取得");
    expect(formatDuration(null)).toBe("未取得");
    expect(formatDistance(null)).toBe("未取得");
    expect(formatMoney(0)).not.toBe("未取得");
  });

  it("classifies permission and source failures", () => {
    expect(classifyCertificateSupportError(new Error("HTTP 403"))).toBe(
      "access_denied",
    );
    expect(
      classifyCertificateSupportError(new Error("CERTIFICATE_NOT_FOUND")),
    ).toBe("not_found");
    expect(classifyCertificateSupportError(new Error("HTTP 500"))).toBe(
      "failed",
    );
  });

  it("uses the existing platform read authority", () => {
    expect(hasCertificateReadScope(["foundation:read"])).toBe(true);
    expect(hasCertificateWriteScope(["foundation:write"])).toBe(true);
    expect(hasCertificateReadScope(["billing:read"])).toBe(false);
    expect(certificateSupportCopy("zh", "retryRead")).toBe("重新讀取");
    expect(certificateSupportCopy("en", "retryRead")).toBe("Retry read");
    expect(certificateStateCopy("en", "superseded").label).toBe("Superseded");
    expect(displayCertificateValue("en", null)).toBe("Unavailable");
  });
});
