import { describe, expect, it, vi } from "vitest";

import {
  AUTH_ALLOWED_REALMS_KEY,
  AUTH_REQUIRED_SCOPES_KEY,
} from "../../src/common/auth";
import { CertificateSupportController } from "../../src/modules/certificate-support/certificate-support.controller";
import { CertificateSupportService } from "../../src/modules/certificate-support/certificate-support.service";
import type { CertificateSupportRow } from "../../src/modules/certificate-support/certificate-support.types";

const baseRow: CertificateSupportRow = {
  receiptId: "receipt-001",
  orderId: "order-001",
  receiptNo: "RC-2607-0186",
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
      htmlUrl: "/certificates/receipt-001.html",
      pdfUrl: "/certificates/receipt-001.pdf",
      supersededByCertificateId: null,
      regeneration: {
        enabled: false,
        reasonCode: "certificate_regeneration_command_pending",
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
  });
});
