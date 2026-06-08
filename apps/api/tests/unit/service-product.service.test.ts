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
  it("exposes runtime defaults and lets persisted records override them", () => {
    const { service } = createService();

    expect(
      service.getRuntimeServiceProductByType("credit_card_airport_transfer"),
    ).toMatchObject({
      serviceProductType: "credit_card_airport_transfer",
      active: true,
      timing: "reservation",
      allowedLicenseTypes: [
        "multi_purpose_taxi",
        "rental_car",
        "business_vehicle",
        "airport_transfer_vehicle",
      ],
      meterRequired: false,
      fixedFareAllowed: true,
      defaultProofRequirements: ["photo", "signoff"],
    });

    service.createServiceProduct({
      serviceProductType: "credit_card_airport_transfer",
      displayName: "Airport Transfer Override",
      timing: "reservation",
      active: false,
      allowedLicenseTypes: ["business_vehicle"],
      meterRequired: true,
      fixedFareAllowed: false,
      defaultBillingMode: "fixed_fare",
      defaultProofRequirements: ["photo"],
    });

    expect(
      service.getRuntimeServiceProductByType("credit_card_airport_transfer"),
    ).toMatchObject({
      displayName: "Airport Transfer Override",
      active: false,
      allowedLicenseTypes: ["business_vehicle"],
      meterRequired: true,
      fixedFareAllowed: false,
      defaultProofRequirements: ["photo"],
    });
  });

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
          meterRequired: "true",
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
          meterRequired: "true",
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
          allowedLicenseTypes: ["taxi", 12],
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
          allowedLicenseTypes: ["taxi", 12],
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
        allowedLicenseTypes: [
          "rental_car",
          "business_vehicle",
          "business_vehicle",
        ],
        meterRequired: false,
        fixedFareAllowed: true,
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
    expect(created.allowedLicenseTypes).toEqual([
      "rental_car",
      "business_vehicle",
    ]);
    expect(created.meterRequired).toBe(false);
    expect(created.fixedFareAllowed).toBe(true);
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
        allowedLicenseTypes: ["taxi", "multi_purpose_taxi"],
        meterRequired: true,
        fixedFareAllowed: false,
        defaultProofRequirements: [" signed_slip ", " proof_of_service "],
      },
      "req-update-valid",
    );

    expect(updated.displayName).toBe("Enterprise Dispatch v2");
    expect(updated.description).toBeNull();
    expect(updated.active).toBe(true);
    expect(updated.allowedLicenseTypes).toEqual(["taxi", "multi_purpose_taxi"]);
    expect(updated.meterRequired).toBe(true);
    expect(updated.fixedFareAllowed).toBe(false);
    expect(updated.defaultProofRequirements).toEqual([
      "signed_slip",
      "proof_of_service",
    ]);
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledTimes(2);
  });

  it("rejects unsupported allowed license types", () => {
    const { service } = createService();

    expect(() =>
      service.createServiceProduct(
        {
          serviceProductType: "taxi_reservation",
          displayName: "Taxi Reservation Override",
          timing: "reservation",
          defaultBillingMode: "meter",
          allowedLicenseTypes: ["hovercraft"] as never,
        },
        "req-create-invalid-license-type",
      ),
    ).toThrowError(ApiRequestError);
  });
});
