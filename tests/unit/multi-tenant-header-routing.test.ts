import { afterEach, describe, expect, it, vi } from "vitest";

import { BillingSettlementController } from "../../apps/api/src/modules/billing-settlement/billing-settlement.controller";
import { BillingSettlementService } from "../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { TenantPartnerController } from "../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";

afterEach(() => {
  vi.restoreAllMocks();
});

function getErrorCode(error: unknown) {
  return (
    (
      error as {
        getResponse?: () => {
          error?: {
            code?: string;
          };
        };
      }
    ).getResponse?.().error?.code ?? null
  );
}

describe("multi-tenant header controller routing", () => {
  it("requires x-tenant-id for tenant billing endpoints", () => {
    const billingSettlementService = {
      getTenantBillingProfile: vi.fn(),
    } as unknown as BillingSettlementService;
    const controller = new BillingSettlementController(
      billingSettlementService,
    );

    let thrown: unknown;
    try {
      controller.getTenantBillingProfile("   ", "req-billing-missing-tenant");
    } catch (error) {
      thrown = error;
    }

    expect(getErrorCode(thrown)).toBe("TENANT_ID_REQUIRED");
    expect(
      billingSettlementService.getTenantBillingProfile,
    ).not.toHaveBeenCalled();
  });

  it("forwards a trimmed x-tenant-id through tenant billing endpoints", async () => {
    const billingSettlementService = {
      getTenantBillingProfile: vi.fn(() => ({
        tenantId: "tenant-alpha",
        invoiceTitle: "Tenant Alpha",
      })),
      updateTenantBillingProfile: vi.fn(() => ({
        tenantId: "tenant-alpha",
        invoiceTitle: "Tenant Alpha",
      })),
      generateTenantInvoice: vi.fn(async () => ({
        invoiceId: "inv-tenant-alpha-001",
        tenantId: "tenant-alpha",
        status: "issued",
      })),
      listTenantInvoices: vi.fn(() => [
        {
          invoiceId: "inv-tenant-alpha-001",
          tenantId: "tenant-alpha",
        },
      ]),
      getTenantInvoice: vi.fn(() => ({
        invoiceId: "inv-tenant-alpha-001",
        tenantId: "tenant-alpha",
      })),
    } as unknown as BillingSettlementService;
    const controller = new BillingSettlementController(
      billingSettlementService,
    );
    const requestId = "req-billing-tenant-alpha";
    const headerTenantId = " tenant-alpha ";
    const profileCommand = {
      invoiceTitle: "Tenant Alpha",
      taxId: "12345678",
      address: "Alpha Road 1",
      contactName: "Alpha Owner",
      email: "billing@alpha.example.com",
    };
    const invoiceCommand = {
      tenantId: "tenant-alpha",
      periodStart: "2026-04-01T00:00:00Z",
      periodEnd: "2026-04-30T23:59:59Z",
    };

    const profileEnvelope = controller.getTenantBillingProfile(
      headerTenantId,
      requestId,
    );
    const updateEnvelope = controller.updateTenantBillingProfile(
      profileCommand,
      headerTenantId,
      requestId,
    );
    const generateEnvelope = await controller.generateTenantInvoice(
      invoiceCommand,
      headerTenantId,
      requestId,
    );
    const listEnvelope = controller.listTenantInvoices(
      headerTenantId,
      requestId,
    );
    const invoiceEnvelope = controller.getTenantInvoice(
      "inv-tenant-alpha-001",
      headerTenantId,
      requestId,
    );

    expect(
      billingSettlementService.getTenantBillingProfile,
    ).toHaveBeenCalledWith("tenant-alpha");
    expect(
      billingSettlementService.updateTenantBillingProfile,
    ).toHaveBeenCalledWith("tenant-alpha", profileCommand, requestId);
    expect(billingSettlementService.generateTenantInvoice).toHaveBeenCalledWith(
      "tenant-alpha",
      invoiceCommand,
      requestId,
    );
    expect(billingSettlementService.listTenantInvoices).toHaveBeenCalledWith(
      "tenant-alpha",
    );
    expect(billingSettlementService.getTenantInvoice).toHaveBeenCalledWith(
      "tenant-alpha",
      "inv-tenant-alpha-001",
    );
    expect(profileEnvelope.data).toMatchObject({ tenantId: "tenant-alpha" });
    expect(updateEnvelope.meta.requestId).toBe(requestId);
    expect(generateEnvelope.data).toMatchObject({
      invoiceId: "inv-tenant-alpha-001",
      tenantId: "tenant-alpha",
    });
    expect(listEnvelope.data.items).toEqual([
      expect.objectContaining({ tenantId: "tenant-alpha" }),
    ]);
    expect(invoiceEnvelope.data).toMatchObject({
      invoiceId: "inv-tenant-alpha-001",
      tenantId: "tenant-alpha",
    });
  });

  it("requires x-tenant-id for tenant partner endpoints", () => {
    const tenantPartnerService = {
      listPassengers: vi.fn(),
    } as unknown as TenantPartnerService;
    const controller = new TenantPartnerController(tenantPartnerService);

    let thrown: unknown;
    try {
      controller.listPassengers(undefined, "req-tenant-partner-missing-tenant");
    } catch (error) {
      thrown = error;
    }

    expect(getErrorCode(thrown)).toBe("TENANT_ID_REQUIRED");
    expect(tenantPartnerService.listPassengers).not.toHaveBeenCalled();
  });

  it("forwards a trimmed x-tenant-id through tenant partner endpoints", () => {
    const tenantPartnerService = {
      listPassengers: vi.fn(() => [
        {
          passengerId: "psg-tenant-alpha-001",
          tenantId: "tenant-alpha",
          fullName: "Tenant Alpha Passenger",
        },
      ]),
      updateNotificationPreferences: vi.fn(() => ({
        status: "updated",
        subscriptions: [
          {
            eventType: "tenant.sla.threshold_breached",
            channel: "email",
            enabled: true,
          },
        ],
      })),
      listWebhookDeliveries: vi.fn(() => [
        {
          deliveryId: "wd-tenant-alpha-001",
          tenantId: "tenant-alpha",
          status: "delivered",
        },
      ]),
    } as unknown as TenantPartnerService;
    const controller = new TenantPartnerController(tenantPartnerService);
    const requestId = "req-tenant-partner-alpha";
    const headerTenantId = " tenant-alpha ";
    const notificationCommand = {
      subscriptions: [
        {
          eventType: "tenant.sla.threshold_breached",
          channel: "email",
          enabled: true,
        },
      ],
    };

    const passengersEnvelope = controller.listPassengers(
      headerTenantId,
      requestId,
    );
    const notificationsEnvelope = controller.updateTenantNotifications(
      notificationCommand,
      headerTenantId,
      requestId,
    );
    const deliveriesEnvelope = controller.listWebhookDeliveries(
      headerTenantId,
      requestId,
    );

    expect(tenantPartnerService.listPassengers).toHaveBeenCalledWith(
      "tenant-alpha",
    );
    expect(
      tenantPartnerService.updateNotificationPreferences,
    ).toHaveBeenCalledWith("tenant-alpha", notificationCommand, requestId);
    expect(tenantPartnerService.listWebhookDeliveries).toHaveBeenCalledWith(
      "tenant-alpha",
    );
    expect(passengersEnvelope.data.items).toEqual([
      expect.objectContaining({ tenantId: "tenant-alpha" }),
    ]);
    expect(notificationsEnvelope.meta.requestId).toBe(requestId);
    expect(deliveriesEnvelope.data.items).toEqual([
      expect.objectContaining({ tenantId: "tenant-alpha" }),
    ]);
  });
});
