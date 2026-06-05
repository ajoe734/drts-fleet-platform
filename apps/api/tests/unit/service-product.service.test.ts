import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { ServiceProductService } from "../../src/modules/service-product/service-product.service";

function createService() {
  const auditNotificationService = {
    recordAuditLog: vi.fn(),
  };
  const service = new ServiceProductService(
    auditNotificationService as never,
    undefined,
  );

  return {
    service,
    auditNotificationService,
  };
}

describe("ServiceProductService payload validation", () => {
  it("rejects create payloads when required string fields are missing", () => {
    const { service } = createService();

    expect(() =>
      service.createServiceProduct(
        {
          displayName: "Airport transfer",
          timing: "reservation",
          defaultBillingMode: "fixed_fare",
        } as never,
        "req-create-missing-type",
      ),
    ).toThrowError(ApiRequestError);

    try {
      service.createServiceProduct(
        {
          displayName: "Airport transfer",
          timing: "reservation",
          defaultBillingMode: "fixed_fare",
        } as never,
        "req-create-missing-type",
      );
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          message: "serviceProductType is required.",
          details: { field: "serviceProductType" },
        },
      });
    }
  });

  it("rejects create payloads with wrong field types instead of throwing 500", () => {
    const { service, auditNotificationService } = createService();

    expect(() =>
      service.createServiceProduct(
        {
          serviceProductType: "taxi_reservation",
          displayName: 123,
          timing: "reservation",
          active: "true",
          defaultBillingMode: "fixed_fare",
          defaultProofRequirements: ["driver_photo", 42],
        } as never,
        "req-create-bad-types",
      ),
    ).toThrowError(ApiRequestError);
    expect(auditNotificationService.recordAuditLog).not.toHaveBeenCalled();

    try {
      service.createServiceProduct(
        {
          serviceProductType: "taxi_reservation",
          displayName: 123,
          timing: "reservation",
          active: "true",
          defaultBillingMode: "fixed_fare",
          defaultProofRequirements: ["driver_photo", 42],
        } as never,
        "req-create-bad-types",
      );
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          message: "displayName must be string.",
          details: { field: "displayName", expected: "string" },
        },
      });
    }
  });

  it("rejects update payloads when optional fields have invalid types", () => {
    const { service, auditNotificationService } = createService();
    const created = service.createServiceProduct({
      serviceProductType: "taxi_realtime",
      displayName: "Realtime taxi",
      timing: "realtime",
      defaultBillingMode: "meter",
      defaultProofRequirements: ["vehicle_plate"],
    });

    expect(() =>
      service.updateServiceProduct(
        created.serviceProductId,
        {
          description: ["unexpected"],
          defaultProofRequirements: "receipt_required",
        } as never,
        "req-update-bad-types",
      ),
    ).toThrowError(ApiRequestError);
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledTimes(1);

    try {
      service.updateServiceProduct(
        created.serviceProductId,
        {
          description: ["unexpected"],
          defaultProofRequirements: "receipt_required",
        } as never,
        "req-update-bad-types",
      );
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          message: "description must be string or null.",
          details: { field: "description", expected: "string or null" },
        },
      });
    }
  });

  it("normalizes valid create and update payloads and records audits", () => {
    const { service, auditNotificationService } = createService();

    const created = service.createServiceProduct(
      {
        serviceProductType: "enterprise_dispatch",
        displayName: "  Enterprise Dispatch  ",
        description: "  Priority riders only  ",
        timing: "external_defined",
        active: false,
        defaultBillingMode: "tenant_invoice",
        defaultProofRequirements: [
          " manifest ",
          "manifest",
          " signed_slip ",
          " ",
        ],
      },
      "req-create-valid",
    );

    expect(created.displayName).toBe("Enterprise Dispatch");
    expect(created.description).toBe("Priority riders only");
    expect(created.defaultProofRequirements).toEqual([
      "manifest",
      "signed_slip",
    ]);

    const updated = service.updateServiceProduct(
      created.serviceProductId,
      {
        displayName: "  Enterprise Dispatch v2 ",
        description: null,
        active: true,
        defaultProofRequirements: [" signed_slip ", " proof_of_service "],
      },
      "req-update-valid",
    );

    expect(updated.displayName).toBe("Enterprise Dispatch v2");
    expect(updated.description).toBeNull();
    expect(updated.active).toBe(true);
    expect(updated.defaultProofRequirements).toEqual([
      "signed_slip",
      "proof_of_service",
    ]);
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledTimes(2);
  });
});
