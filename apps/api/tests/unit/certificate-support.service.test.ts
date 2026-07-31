import { describe, expect, it, vi } from "vitest";

import {
  AUTH_ALLOWED_REALMS_KEY,
  AUTH_REQUIRED_SCOPES_KEY,
} from "../../src/common/auth";
import { CertificateSupportController } from "../../src/modules/certificate-support/certificate-support.controller";
import { CertificateSupportService } from "../../src/modules/certificate-support/certificate-support.service";
import type { CertificateSupportRow } from "../../src/modules/certificate-support/certificate-support.types";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";

const baseRow: CertificateSupportRow = {
  receiptId: "receipt-001",
  orderId: "order-001",
  receiptNo: "RC-2607-0186",
  receiptVersion: 2,
  isCurrent: true,
  supersedesReceiptId: null,
  regenerationIdempotencyKey: null,
  regeneratedByActorId: null,
  regenerationReason: null,
  regenerationAuditId: null,
  amountMinor: 35500,
  currency: "NTD",
  issuedAt: "2026-07-20T07:08:00.000Z",
  record: {
    tripId: "trip-001",
    plateNo: "BKR-2208",
    pickupAt: "2026-07-20T06:32:00.000Z",
    dropoffAt: "2026-07-20T07:07:00.000Z",
    travelDurationSeconds: 2100,
    routeSummary: "松仁路 → 南京東路二段",
    distanceMeters: 6420,
    tollMinor: 0,
    consumerServicePhone: "0800-090-000",
    authorityComplaintPhone: "1999",
    certificateVersion: "v2",
    htmlUrl: "/certificates/receipt-001.html",
    pdfUrl: "/certificates/receipt-001.pdf",
  },
};

function createService(rows: CertificateSupportRow[] = [baseRow]) {
  const repository = {
    isEnabled: vi.fn(() => true),
    list: vi.fn(async () => rows),
    findById: vi.fn(
      async (id: string) =>
        rows.find((row) => row.receiptId === id || row.receiptNo === id) ??
        null,
    ),
  };
  return {
    repository,
    service: new CertificateSupportService(repository as never),
  };
}

describe("CertificateSupportService", () => {
  it("maps the existing receipt and all legal fields without enabling regeneration", async () => {
    const { service } = createService();

    await expect(service.get("receipt-001")).resolves.toEqual({
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
      htmlUrl:
        "/control-plane-proxy/platform-admin/multi-taxi/certificates/receipt-001/artifacts/html",
      pdfUrl:
        "/control-plane-proxy/platform-admin/multi-taxi/certificates/receipt-001/artifacts/pdf",
      supersededByCertificateId: null,
      regeneration: {
        enabled: false,
        reasonCode: "certificate_writer_unavailable",
      },
    });
  });

  it.each([
    "available",
    "generating",
    "unavailable",
    "failed",
    "access_denied",
    "superseded",
  ] as const)("preserves the canonical %s state", async (state) => {
    const { service } = createService([
      {
        ...baseRow,
        receiptId: `receipt-${state}`,
        record: { ...baseRow.record, certificateState: state },
      },
    ]);

    const result = await service.list({ state });
    expect(result).toHaveLength(1);
    expect(result[0]?.state).toBe(state);
  });

  it("derives superseded only from an existing replacement reference", async () => {
    const { service } = createService([
      {
        ...baseRow,
        record: {
          ...baseRow.record,
          certificateState: "available",
          supersededByReceiptId: "receipt-002",
        },
      },
    ]);

    await expect(service.get("receipt-001")).resolves.toMatchObject({
      state: "superseded",
      supersededByCertificateId: "receipt-002",
    });
  });

  it("returns null for absent legal fields instead of inventing values", async () => {
    const { service } = createService([{ ...baseRow, record: {} }]);

    await expect(service.get("receipt-001")).resolves.toMatchObject({
      tripId: null,
      plateNo: null,
      pickupAt: null,
      dropoffAt: null,
      travelDurationSeconds: null,
      routeSummary: null,
      distanceMeters: null,
      tollMinor: null,
      consumerServicePhone: null,
      authorityComplaintPhone: null,
      htmlUrl: null,
      pdfUrl: null,
    });
  });

  it("rejects unknown states and missing certificates", async () => {
    const { service } = createService([]);

    await expect(service.list({ state: "ready" })).rejects.toMatchObject({
      response: { error: { code: "CERTIFICATE_STATE_INVALID" } },
    });
    await expect(service.get("missing")).rejects.toMatchObject({
      response: { error: { code: "CERTIFICATE_NOT_FOUND" } },
    });
  });

  it("renders authenticated HTML and PDF artifacts from the persisted row", async () => {
    const { service } = createService();
    const html = await service.getArtifact("receipt-001", "html");
    const pdf = await service.getArtifact("receipt-001", "pdf");

    expect(html.contentType).toBe("text/html; charset=utf-8");
    expect(html.buffer.toString("utf8")).toContain("松仁路 → 南京東路二段");
    expect(pdf.contentType).toBe("application/pdf");
    expect(pdf.buffer.subarray(0, 8).toString("binary")).toBe("%PDF-1.7");
    expect(pdf.buffer.toString("utf8")).toContain("/UniCNS-UTF16-H");
  });

  it("idempotently persists a complete multi-taxi completion event", async () => {
    const persistInitial = vi.fn(async () => baseRow);
    const service = new CertificateSupportService({
      isEnabled: () => true,
      persistInitial,
    } as never);

    await service.writeCompletedTrip({
      runtimeProfileCode: "multi_taxi_direct",
      orderId: "order-001",
      tripId: "task-001",
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
      completedAt: "2026-07-20T07:07:00.000Z",
    });

    expect(persistInitial).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptId: "receipt-order-001",
        orderId: "order-001",
        amountMinor: 35500,
        record: expect.objectContaining({
          certificateVersion: "v1",
          generatedFrom: "owned_mobility_completion",
        }),
      }),
    );
  });

  it("requires reason and idempotency then returns an audited new version", async () => {
    const regeneratedRow: CertificateSupportRow = {
      ...baseRow,
      receiptId: "receipt-002",
      receiptNo: "RC-2607-0186-R3",
      receiptVersion: 3,
      supersedesReceiptId: "receipt-001",
      regenerationIdempotencyKey: "idem-001",
      regeneratedByActorId: "platform-admin-001",
      regenerationReason: "customer correction",
      record: {
        ...baseRow.record,
        certificateVersion: "v3",
      },
    };
    const attachRegenerationAudit = vi.fn(async () => undefined);
    const repository = {
      isEnabled: () => true,
      findById: vi.fn(async () => baseRow),
      regenerate: vi.fn(async () => ({
        row: regeneratedRow,
        replayed: false,
      })),
      attachRegenerationAudit,
    };
    const service = new CertificateSupportService(
      repository as never,
      new AuditNotificationService(),
    );

    await expect(
      service.regenerate("receipt-001", {
        actorId: "platform-admin-001",
        idempotencyKey: "idem-001",
      }),
    ).rejects.toMatchObject({
      response: {
        error: { code: "CERTIFICATE_REGENERATION_REASON_REQUIRED" },
      },
    });

    const result = await service.regenerate("receipt-001", {
      actorId: "platform-admin-001",
      idempotencyKey: "idem-001",
      reason: "customer correction",
      requestId: "request-001",
    });
    expect(result.certificate).toMatchObject({
      certificateId: "receipt-002",
      certificateVersion: "v3",
      regeneration: { enabled: true, reasonCode: null },
    });
    expect(result.actionReceipt).toMatchObject({
      actionId: "idem-001",
      resourceId: "receipt-002",
      status: "completed",
    });
    expect(attachRegenerationAudit).toHaveBeenCalledWith(
      "receipt-002",
      "idem-001",
      result.actionReceipt.auditId,
    );
  });

  it("fails closed when the certificate database writer is unavailable", async () => {
    const service = new CertificateSupportService({
      isEnabled: () => false,
    } as never);

    await expect(service.list({})).rejects.toMatchObject({
      response: { error: { code: "CERTIFICATE_WRITER_UNAVAILABLE" } },
    });
  });
});

describe("CertificateSupportController authorization", () => {
  it("requires platform foundation read authority", () => {
    expect(
      Reflect.getMetadata(
        AUTH_ALLOWED_REALMS_KEY,
        CertificateSupportController,
      ),
    ).toEqual(["platform"]);
    expect(
      Reflect.getMetadata(
        AUTH_REQUIRED_SCOPES_KEY,
        CertificateSupportController,
      ),
    ).toEqual(["foundation:read"]);
    expect(
      Reflect.getMetadata(
        AUTH_REQUIRED_SCOPES_KEY,
        CertificateSupportController.prototype.regenerate,
      ),
    ).toEqual(["foundation:write"]);
  });
});
