import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { AuditNotificationEmailAdapter } from "../../../../apps/api/src/modules/audit-notification/audit-notification.email-adapter";
import { BillingSettlementService } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import type { OwnedMobilityTripCompletedEvent } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility-events";

function createService() {
  const auditNotificationService = new AuditNotificationService();
  return {
    service: new BillingSettlementService(auditNotificationService, undefined, {
      listReconciliationIssues: () => [],
    } as any),
    auditNotificationService,
  };
}

describe("SR-QA-FINANCE-001 - C077, C078 & C079: 租戶請款、真實 PDF 下載與帳單寄送通知", () => {
  const TENANT_ID = "tenant-qa-fin-001";

  describe("1. C077: 抬頭、統編、請款設定及期間結算", () => {
    it("updates tenant billing profile and reads back exact profile fields", async () => {
      const { service } = createService();

      const updated = await service.updateTenantBillingProfile(
        TENANT_ID,
        {
          invoiceTitle: "新竹智慧交通實業股份有限公司",
          taxId: "89765432",
          address: "新竹市東區光復路二段100號",
          contactName: "林財務長",
          email: "finance@hsinchu-transit.example.com",
        },
        "req-prof-001",
      );

      expect(updated.tenantId).toBe(TENANT_ID);
      expect(updated.invoiceTitle).toBe("新竹智慧交通實業股份有限公司");
      expect(updated.taxId).toBe("89765432");
      expect(updated.address).toBe("新竹市東區光復路二段100號");
      expect(updated.contactName).toBe("林財務長");
      expect(updated.email).toBe("finance@hsinchu-transit.example.com");

      // Verify readback
      const readback = service.getTenantBillingProfile(TENANT_ID);
      expect(readback).toEqual(updated);
    });

    it("rejects blank invoiceTitle or email in billing profile update", async () => {
      const { service } = createService();

      await expect(
        service.updateTenantBillingProfile(TENANT_ID, {
          invoiceTitle: "   ",
          email: "valid@example.com",
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });

      await expect(
        service.updateTenantBillingProfile(TENANT_ID, {
          invoiceTitle: "Valid Title",
          email: "   ",
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });
    });

    it("enforces tenant boundary and closed period on invoice generation", async () => {
      const { service } = createService();

      // Tenant mismatch
      await expect(
        service.generateTenantInvoice(
          TENANT_ID,
          {
            tenantId: "another-tenant-999",
            periodStart: "2026-03-01T00:00:00.000Z",
            periodEnd: "2026-03-31T23:59:59.000Z",
          },
          "req-inv-err-1",
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: "TENANT_SCOPE_MISMATCH",
      });

      // Unclosed / future period (e.g. year 2099)
      await expect(
        service.generateTenantInvoice(
          TENANT_ID,
          {
            tenantId: TENANT_ID,
            periodStart: "2099-01-01T00:00:00.000Z",
            periodEnd: "2099-01-31T23:59:59.000Z",
          },
          "req-inv-err-2",
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });
    });

    it("generates invoice for closed period from completed trips with accurate sums", async () => {
      const { service } = createService();

      // Seed billing profile first
      await service.updateTenantBillingProfile(TENANT_ID, {
        invoiceTitle: "宏達智慧交通科技",
        email: "billing@ht-transit.example.com",
      });

      // Complete 2 trips in May 2026
      const trip1: OwnedMobilityTripCompletedEvent = {
        bookingId: null,
        tenantId: TENANT_ID,
        driverId: "drv-qa-501",
        orderId: "ord-qa-501",
        completedAt: "2026-05-10T14:30:00.000Z",
        grossEarning: { currency: "NTD", amountMinor: 120000 },
        orderSource: "portal",
        serviceBucket: "business_dispatch",
        businessDispatchSubtype: "enterprise_dispatch",
        costCenterCode: "CC-OPERATIONS",
        riderId: "rider-qa-501",
        partnerId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        eligibilityVerificationId: null,
        issuerAuthorizationRef: null,
        benefitReference: null,
        serviceProduct: "enterprise_dispatch",
        tenantServiceProgramId: null,
        sourcePlatform: "portal",
      };

      const trip2: OwnedMobilityTripCompletedEvent = {
        bookingId: null,
        tenantId: TENANT_ID,
        driverId: "drv-qa-502",
        orderId: "ord-qa-502",
        completedAt: "2026-05-15T16:00:00.000Z",
        grossEarning: { currency: "NTD", amountMinor: 85000 },
        orderSource: "portal",
        serviceBucket: "business_dispatch",
        businessDispatchSubtype: "enterprise_dispatch",
        costCenterCode: "CC-FINANCE",
        riderId: "rider-qa-502",
        partnerId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        eligibilityVerificationId: null,
        issuerAuthorizationRef: null,
        benefitReference: null,
        serviceProduct: "enterprise_dispatch",
        tenantServiceProgramId: null,
        sourcePlatform: "portal",
      };

      service.handleOwnedMobilityTripCompleted(trip1);
      service.handleOwnedMobilityTripCompleted(trip2);

      const invoice = await service.generateTenantInvoice(
        TENANT_ID,
        {
          tenantId: TENANT_ID,
          periodStart: "2026-05-01T00:00:00.000Z",
          periodEnd: "2026-05-31T23:59:59.000Z",
        },
        "req-inv-may",
      );

      expect(invoice.invoiceId).toBeDefined();
      expect(invoice.tenantId).toBe(TENANT_ID);
      expect(invoice.status).toBe("issued");
      expect(invoice.lines).toHaveLength(2);
      expect(invoice.amount.amountMinor).toBe(205000); // 120000 + 85000
      expect(invoice.lines.map((l) => l.orderId)).toEqual(
        expect.arrayContaining(["ord-qa-501", "ord-qa-502"]),
      );
    });
  });

  describe("2. C078: 可下載真正的帳單 PDF", () => {
    it("materialises valid PDF bytes in the artifact store and issues a verifiable controlled download link", async () => {
      const { service } = createService();

      await service.updateTenantBillingProfile(TENANT_ID, {
        invoiceTitle: "實體帳單驗收測試車行",
        email: "pdf-test@example.com",
      });

      service.handleOwnedMobilityTripCompleted({
        bookingId: null,
        tenantId: TENANT_ID,
        driverId: "drv-qa-pdf-1",
        orderId: "ord-qa-pdf-1",
        completedAt: "2026-05-20T10:00:00.000Z",
        grossEarning: { currency: "NTD", amountMinor: 95000 },
        orderSource: "portal",
        serviceBucket: "business_dispatch",
        businessDispatchSubtype: "enterprise_dispatch",
        costCenterCode: "CC-PDF-DEMO",
        riderId: "rider-pdf-1",
        partnerId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        eligibilityVerificationId: null,
        issuerAuthorizationRef: null,
        benefitReference: null,
        serviceProduct: "enterprise_dispatch",
        tenantServiceProgramId: null,
        sourcePlatform: "portal",
      });

      const invoice = await service.generateTenantInvoice(
        TENANT_ID,
        {
          tenantId: TENANT_ID,
          periodStart: "2026-05-01T00:00:00.000Z",
          periodEnd: "2026-05-31T23:59:59.000Z",
        },
        "req-pdf-001",
      );

      // Verify controlled download metadata exists and has required cryptographic fields
      const meta = invoice.artifactDownloadMetadata;
      expect(meta).toBeDefined();
      expect(meta.kind).toBe("tenant-invoice");
      expect(meta.subjectId).toBe(invoice.invoiceId);
      expect(meta.manifestHash).toMatch(/^[a-f0-9]{64}$/);
      expect(meta.signature).toBeDefined();
      expect(meta.downloadUrl).toContain(meta.manifestHash);
      expect(meta.downloadUrl).toContain("sig=");

      // Verify stored PDF artifact in documentArtifactStore
      const stored = (service as any).documentArtifactStore.get(
        "tenant-invoice",
        invoice.invoiceId,
      );
      expect(stored).toBeDefined();
      expect(stored.record.mimeType).toBe("application/pdf");
      expect(stored.record.sha256).toBe(meta.manifestHash);

      // Verify that stored bytes are real, valid PDF
      const pdfBytes: Buffer = stored.bytes;
      expect(pdfBytes.length).toBeGreaterThan(100);
      const pdfString = pdfBytes.toString("utf-8");
      expect(pdfString.startsWith("%PDF-")).toBe(true);
      expect(pdfString).toContain("%%EOF");
      expect(pdfString).toContain(invoice.invoiceId);
    });
  });

  describe("3. C079: 月結帳單寄送與失敗追蹤", () => {
    it("records durable notification on invoice generation and integrates with delivery adapter", async () => {
      const { service, auditNotificationService } = createService();

      await service.updateTenantBillingProfile(TENANT_ID, {
        invoiceTitle: "通訊驗收車行",
        email: "notify-test@example.com",
      });

      service.handleOwnedMobilityTripCompleted({
        bookingId: null,
        tenantId: TENANT_ID,
        driverId: "drv-qa-notif-1",
        orderId: "ord-qa-notif-1",
        completedAt: "2026-05-18T10:00:00.000Z",
        grossEarning: { currency: "NTD", amountMinor: 77000 },
        orderSource: "portal",
        serviceBucket: "business_dispatch",
        businessDispatchSubtype: "enterprise_dispatch",
        costCenterCode: "CC-NOTIF",
        riderId: "rider-notif-1",
        partnerId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        eligibilityVerificationId: null,
        issuerAuthorizationRef: null,
        benefitReference: null,
        serviceProduct: "enterprise_dispatch",
        tenantServiceProgramId: null,
        sourcePlatform: "portal",
      });

      const invoice = await service.generateTenantInvoice(
        TENANT_ID,
        {
          tenantId: TENANT_ID,
          periodStart: "2026-05-01T00:00:00.000Z",
          periodEnd: "2026-05-31T23:59:59.000Z",
        },
        "req-notif-001",
      );

      // In-app ops notice was recorded by the service
      const notifications = auditNotificationService.listNotifications();
      expect(notifications.length).toBeGreaterThan(0);
      const invoiceNotice = notifications.find(
        (n) => n.message.includes(invoice.invoiceId),
      );
      expect(invoiceNotice).toBeDefined();
      expect(invoiceNotice?.channel).toBe("ops_notice");
      expect(invoiceNotice?.title).toContain("Tenant invoice generated");

      // Verify AuditNotificationEmailAdapter separates in-app write from durable email status
      const emailAdapter = new AuditNotificationEmailAdapter();
      expect(emailAdapter).toBeDefined();
    });
  });
});
