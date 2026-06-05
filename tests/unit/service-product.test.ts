import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ServiceProductRepository } from "../../apps/api/src/modules/service-product/service-product.repository";
import { ServiceProductService } from "../../apps/api/src/modules/service-product/service-product.service";

function createService() {
  const auditService = new AuditNotificationService();
  const repository = new ServiceProductRepository();
  const service = new ServiceProductService(auditService, repository);

  return { auditService, service };
}

describe("service product service", () => {
  it("starts with an empty service product registry", () => {
    const { service } = createService();

    expect(service.listServiceProducts()).toEqual([]);
  });

  it("creates a new service product and records audit", () => {
    const { auditService, service } = createService();

    const created = service.createServiceProduct(
      {
        serviceProductType: "travel_agency_transfer",
        serviceProductId: "SVP-TRAVEL-001",
        displayName: "Travel Agency Premium Transfer",
        description: " Concierge transfers ",
        timing: "reservation",
        active: false,
        defaultBillingMode: "partner_settlement",
        defaultProofRequirements: ["guest_manifest", "guest_manifest"],
      },
      "req-service-product-create",
      { captureAudit: true },
    );

    expect(created.data.serviceProductId).toBe("SVP-TRAVEL-001");
    expect(created.data.displayName).toBe("Travel Agency Premium Transfer");
    expect(created.data.description).toBe("Concierge transfers");
    expect(created.data.active).toBe(false);
    expect(created.data.defaultProofRequirements).toEqual(["guest_manifest"]);
    expect(created.auditLog.requestId).toBe("req-service-product-create");
    expect(auditService.listAuditLogs()[0]?.actionName).toBe(
      "create_service_product",
    );
  });

  it("updates mutable service product fields and records audit", () => {
    const { auditService, service } = createService();

    const created = service.createServiceProduct({
      serviceProductType: "enterprise_dispatch",
      serviceProductId: "SVP-000003",
      displayName: "Enterprise Dispatch",
      timing: "reservation",
      defaultBillingMode: "tenant_invoice",
      defaultProofRequirements: ["signoff_required"],
    });

    const updated = service.updateServiceProduct(
      created.serviceProductId,
      {
        active: false,
        defaultBillingMode: "fixed_fare",
        defaultProofRequirements: ["signoff_required", "photo_required"],
      },
      "req-service-product-update",
      { captureAudit: true },
    );

    expect(updated.data.serviceProductType).toBe("enterprise_dispatch");
    expect(updated.data.active).toBe(false);
    expect(updated.data.defaultBillingMode).toBe("fixed_fare");
    expect(updated.data.defaultProofRequirements).toEqual([
      "signoff_required",
      "photo_required",
    ]);
    expect(updated.auditLog.resourceId).toBe("SVP-000003");
    expect(auditService.listAuditLogs()[0]?.actionName).toBe(
      "create_service_product",
    );
    expect(auditService.listAuditLogs()[1]?.actionName).toBe(
      "update_service_product",
    );
  });

  it("rejects duplicate service product types", () => {
    const { service } = createService();

    service.createServiceProduct({
      serviceProductType: "enterprise_dispatch",
      displayName: "Enterprise Dispatch",
      timing: "reservation",
      defaultBillingMode: "tenant_invoice",
    });

    expect(() =>
      service.createServiceProduct({
        serviceProductType: "enterprise_dispatch",
        displayName: "Enterprise Dispatch 2",
        timing: "reservation",
        defaultBillingMode: "tenant_invoice",
      }),
    ).toThrow(ApiRequestError);
  });

  it("rejects unknown service product ids on update", () => {
    const { service } = createService();

    expect(() =>
      service.updateServiceProduct("SVP-999999", {
        active: false,
      }),
    ).toThrow(ApiRequestError);
  });

  it("rejects invalid timing values", () => {
    const { service } = createService();

    expect(() =>
      service.createServiceProduct({
        serviceProductType: "travel_agency_transfer",
        displayName: "Travel Agency Transfer",
        timing: "scheduled_only" as any,
        defaultBillingMode: "partner_settlement",
      }),
    ).toThrow(ApiRequestError);
  });
});
