import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { MultiTaxiService } from "../../src/modules/multi-taxi/multi-taxi.service";

function createService() {
  const ownedMobilityService = {
    createMultiTaxiRide: vi.fn((command, authorization) => ({
      command,
      authorization,
    })),
    queueCheckInMultiTaxi: vi.fn((command, authorization) => ({
      command,
      authorization,
    })),
    queueCheckOutMultiTaxi: vi.fn((command, authorization) => ({
      command,
      authorization,
    })),
  };
  return {
    service: new MultiTaxiService(ownedMobilityService as never),
    ownedMobilityService,
  };
}

function createAndActivateAuthorization(service: MultiTaxiService) {
  const authorization = service.createAuthorization({
    operatorId: "operator-001",
    authorityCode: "TPE-MTX-001",
    businessPlanVersion: "2026.1",
    serviceAreaCodes: ["TPE"],
    activeFareVersionId: "fare-001",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveUntil: "2027-01-01T00:00:00.000Z",
  });
  return service.activateAuthorization(authorization.authorizationId);
}

describe("MultiTaxiService operating authority", () => {
  it("denies ride intake until an approved effective authority exists", () => {
    const { service } = createService();
    expect(() =>
      service.createRide(
        {
          pickup: { address: "台北車站" },
          dropoff: { address: "松山機場" },
          passenger: { name: "測試乘客", phone: "0911222333" },
          requestedPickupAt: new Date().toISOString(),
          timingMode: "on_demand",
          paymentMethodTokenRef: null,
        },
        null,
      ),
    ).toThrowError(ApiRequestError);
  });

  it("resolves the runtime authority on the server and denies after suspension", () => {
    const { service, ownedMobilityService } = createService();
    const authorization = createAndActivateAuthorization(service);
    const command = {
      pickup: { address: "台北車站" },
      dropoff: { address: "松山機場" },
      passenger: { name: "測試乘客", phone: "0911222333" },
      requestedPickupAt: new Date().toISOString(),
      timingMode: "on_demand" as const,
      paymentMethodTokenRef: null,
    };

    service.createRide(command, null);
    expect(ownedMobilityService.createMultiTaxiRide).toHaveBeenCalledWith(
      command,
      expect.objectContaining({
        authorizationId: authorization.authorizationId,
        status: "approved",
      }),
      null,
      undefined,
    );

    service.suspendAuthorization(authorization.authorizationId);
    expect(() => service.createRide(command, null)).toThrowError(
      ApiRequestError,
    );
  });

  it("requires active vehicle membership before virtual queue entry", () => {
    const { service, ownedMobilityService } = createService();
    const authorization = createAndActivateAuthorization(service);
    const command = {
      vehicleId: "veh-demo-001",
      siteId: "virtual-tpe",
      queueMode: "virtual_matching" as const,
    };

    expect(() => service.queueCheckIn(command)).toThrowError(ApiRequestError);

    service.addAuthorizedVehicle(authorization.authorizationId, {
      vehicleId: "veh-demo-001",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveUntil: "2027-01-01T00:00:00.000Z",
    });
    service.queueCheckIn(command);
    expect(ownedMobilityService.queueCheckInMultiTaxi).toHaveBeenCalledWith(
      command,
      expect.objectContaining({
        authorizationId: authorization.authorizationId,
      }),
      undefined,
    );
  });
});
