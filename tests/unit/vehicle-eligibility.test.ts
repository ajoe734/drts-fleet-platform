import type { VehicleEligibilityMatrixRecord } from "@drts/contracts";
import { describe, expect, it } from "vitest";
import { ApiRequestError } from "../../apps/api/src/common/api-envelope";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { VehicleEligibilityRepository } from "../../apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.repository";
import { VehicleEligibilityService } from "../../apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.service";

function createService() {
  const regulatoryRegistryService = {
    getEligibleCandidates: () => [],
    getVehicleDispatchability: () => true,
    getDriverAvailability: () => true,
  };
  const auditService = new AuditNotificationService();
  const repository = new VehicleEligibilityRepository();
  const service = new VehicleEligibilityService(
    regulatoryRegistryService as never,
    auditService,
    repository,
  );

  return { auditService, repository, service };
}

const BASE_ITEM: VehicleEligibilityMatrixRecord = {
  capabilityId: "matrix-taxi-standard",
  licenseType: "taxi",
  supportedProducts: ["taxi_realtime", "taxi_reservation"],
  seatCount: 4,
  luggageCapacity: 2,
  airportPermit: false,
  businessDispatchEligible: false,
  taxiMeterRequired: true,
  fixedFareAllowed: false,
  platformForwardingAllowed: false,
  active: true,
  effectiveFrom: "2026-06-01T00:00:00.000Z",
  effectiveUntil: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

describe("vehicle eligibility service", () => {
  it("returns the effective default matrix by default", () => {
    const { service } = createService();

    expect(service.listMatrix()).not.toEqual([]);
    expect(
      service
        .listMatrix()
        .some((item) => item.licenseType === "multi_purpose_taxi"),
    ).toBe(true);
  });

  it("replaces the matrix and records audit evidence", () => {
    const { auditService, service } = createService();

    const items = service.updateMatrix(
      {
        items: [
          BASE_ITEM,
          {
            ...BASE_ITEM,
            capabilityId: "matrix-airport-transfer",
            licenseType: "airport_transfer_vehicle",
            supportedProducts: ["credit_card_airport_transfer"],
            airportPermit: true,
            businessDispatchEligible: true,
            taxiMeterRequired: false,
            fixedFareAllowed: true,
            platformForwardingAllowed: true,
            seatCount: 6,
            luggageCapacity: 4,
          },
        ],
      },
      {
        actorId: "admin-001",
        actorType: "platform_admin",
        tenantId: null,
      },
      "req-vehicle-eligibility-001",
    );

    expect(items).toHaveLength(2);
    expect(items[0]?.updatedAt).toBeDefined();
    const auditEntry = auditService
      .listAuditLogs()
      .find(
        (entry) => entry.actionName === "vehicle_eligibility_matrix.updated",
      );
    expect(auditEntry?.actionName).toBe("vehicle_eligibility_matrix.updated");
    expect(auditEntry?.actorId).toBe("admin-001");
  });

  it("rejects duplicate capability ids", () => {
    const { service } = createService();

    try {
      service.updateMatrix(
        {
          items: [
            BASE_ITEM,
            {
              ...BASE_ITEM,
              licenseType: "multi_purpose_taxi",
            },
          ],
        },
        {
          actorId: "admin-001",
          actorType: "platform_admin",
          tenantId: null,
        },
      );
      throw new Error("expected duplicate capability rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "DUPLICATE_VEHICLE_ELIGIBILITY_CAPABILITY",
        },
      });
    }
  });

  it("rejects unsupported product types", () => {
    const { service } = createService();

    try {
      service.updateMatrix(
        {
          items: [
            {
              ...BASE_ITEM,
              supportedProducts: ["not_a_real_product" as never],
            },
          ],
        },
        {
          actorId: "admin-001",
          actorType: "platform_admin",
          tenantId: null,
        },
      );
      throw new Error("expected invalid product rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "INVALID_SERVICE_PRODUCT_TYPE",
        },
      });
    }
  });
});
