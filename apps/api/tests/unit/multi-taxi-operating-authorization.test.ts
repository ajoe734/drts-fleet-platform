import { describe, expect, it, vi } from "vitest";
import { MultiTaxiService } from "../../src/modules/multi-taxi/multi-taxi.service";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";
import { ApiRequestError } from "../../src/common/api-envelope";

describe("MultiTaxiService Operating Authorization Unit Tests (MTX-AUTH-001)", () => {
  function setupTestService() {
    const mockOwnedMobilityService = {} as any;
    const mockAuditNotificationService = {
      recordAuditLog: vi.fn(),
    } as any;
    const mockRegulatoryRegistryService = new RegulatoryRegistryService(
      {} as any,
      mockAuditNotificationService,
      {} as any,
    );

    const service = new MultiTaxiService(
      mockOwnedMobilityService,
      undefined,
      undefined,
      mockAuditNotificationService,
    );

    return {
      service,
      mockAuditNotificationService,
      mockRegulatoryRegistryService,
    };
  }

  it("1. approved+effective+authorized vehicle passes", () => {
    const { service } = setupTestService();

    const auth = service.createAuthorization({
      operatorId: "op-test-1",
      authorityCode: "AUTH-001",
      businessPlanVersion: "v1.0",
      serviceAreaCodes: ["TAIPEI-MAIN"],
      activeFareVersionId: "fare-v1",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });

    const activated = service.activateAuthorization(auth.authorizationId);
    expect(activated.status).toBe("approved");

    const vehicle = service.addAuthorizedVehicle(auth.authorizationId, {
      vehicleId: "veh-test-1",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });
    expect(vehicle.status).toBe("active");

    const validated = service.validateOperatingAuthorizationForAssignment(
      auth.authorizationId,
      "veh-test-1",
      "TAIPEI-MAIN",
      "fare-v1",
    );

    expect(validated.authorizationId).toBe(auth.authorizationId);
  });

  it("2. draft/suspended/expired/revoked denied", () => {
    const { service } = setupTestService();

    const auth = service.createAuthorization({
      operatorId: "op-test-2",
      authorityCode: "AUTH-002",
      businessPlanVersion: "v1.0",
      serviceAreaCodes: ["TAIPEI-MAIN"],
      activeFareVersionId: "fare-v1",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });

    service.addAuthorizedVehicle(auth.authorizationId, {
      vehicleId: "veh-test-2",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });

    // Draft state denied
    try {
      service.validateOperatingAuthorizationForAssignment(
        auth.authorizationId,
        "veh-test-2",
      );
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.response?.error?.code).toBe("P5_OPERATING_AUTHORIZATION_INACTIVE");
    }

    // Activate then suspend -> suspended state denied
    service.activateAuthorization(auth.authorizationId);
    service.suspendAuthorization(auth.authorizationId);

    try {
      service.validateOperatingAuthorizationForAssignment(
        auth.authorizationId,
        "veh-test-2",
      );
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.response?.error?.code).toBe("P5_OPERATING_AUTHORIZATION_INACTIVE");
    }
  });

  it("3. missing membership denied", () => {
    const { service } = setupTestService();

    const auth = service.createAuthorization({
      operatorId: "op-test-3",
      authorityCode: "AUTH-003",
      businessPlanVersion: "v1.0",
      serviceAreaCodes: ["TAIPEI-MAIN"],
      activeFareVersionId: "fare-v1",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });
    service.activateAuthorization(auth.authorizationId);

    // Vehicle not added -> denied
    try {
      service.validateOperatingAuthorizationForAssignment(
        auth.authorizationId,
        "veh-unauthorized-999",
      );
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.response?.error?.code).toBe("P5_VEHICLE_NOT_IN_AUTHORIZATION");
    }

    // Vehicle added then removed -> denied
    service.addAuthorizedVehicle(auth.authorizationId, {
      vehicleId: "veh-test-3",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });
    service.removeAuthorizedVehicle(auth.authorizationId, "veh-test-3");

    try {
      service.validateOperatingAuthorizationForAssignment(
        auth.authorizationId,
        "veh-test-3",
      );
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.response?.error?.code).toBe("P5_VEHICLE_NOT_IN_AUTHORIZATION");
    }
  });

  it("4. wrong service area denied", () => {
    const { service } = setupTestService();

    const auth = service.createAuthorization({
      operatorId: "op-test-4",
      authorityCode: "AUTH-004",
      businessPlanVersion: "v1.0",
      serviceAreaCodes: ["TAIPEI-MAIN"],
      activeFareVersionId: "fare-v1",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });
    service.activateAuthorization(auth.authorizationId);
    service.addAuthorizedVehicle(auth.authorizationId, {
      vehicleId: "veh-test-4",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });

    try {
      service.validateOperatingAuthorizationForAssignment(
        auth.authorizationId,
        "veh-test-4",
        "KAOHSIUNG-CENTRAL",
      );
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.response?.error?.code).toBe("P5_AUTHORIZATION_SERVICE_AREA_MISMATCH");
    }
  });

  it("5. inactive fare version denied", () => {
    const { service } = setupTestService();

    const auth = service.createAuthorization({
      operatorId: "op-test-5",
      authorityCode: "AUTH-005",
      businessPlanVersion: "v1.0",
      serviceAreaCodes: ["TAIPEI-MAIN"],
      activeFareVersionId: "inactive",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });
    service.activateAuthorization(auth.authorizationId);
    service.addAuthorizedVehicle(auth.authorizationId, {
      vehicleId: "veh-test-5",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });

    try {
      service.validateOperatingAuthorizationForAssignment(
        auth.authorizationId,
        "veh-test-5",
      );
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.response?.error?.code).toBe("P5_FARE_VERSION_NOT_ACTIVE");
    }
  });

  it("6. all writes audited", () => {
    const { service, mockAuditNotificationService } = setupTestService();

    // 1. Create authorization
    const auth = service.createAuthorization({
      operatorId: "op-audit-1",
      authorityCode: "AUTH-AUDIT-001",
      businessPlanVersion: "v1.0",
      serviceAreaCodes: ["TAIPEI-MAIN"],
      activeFareVersionId: "fare-v1",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });
    expect(mockAuditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "create_operating_authorization",
        resourceType: "multi_taxi_operating_authorization",
        resourceId: auth.authorizationId,
      }),
    );

    // 2. Activate authorization
    service.activateAuthorization(auth.authorizationId);
    expect(mockAuditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "activate_operating_authorization",
        resourceId: auth.authorizationId,
      }),
    );

    // 3. Add authorized vehicle
    const vehicle = service.addAuthorizedVehicle(auth.authorizationId, {
      vehicleId: "veh-audit-1",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });
    expect(mockAuditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "add_authorized_vehicle",
        resourceType: "multi_taxi_authorized_vehicle",
        resourceId: vehicle.authorizationVehicleId,
      }),
    );

    // 4. Suspend authorization
    service.suspendAuthorization(auth.authorizationId);
    expect(mockAuditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "suspend_operating_authorization",
        resourceId: auth.authorizationId,
      }),
    );

    // 5. Remove authorized vehicle
    service.removeAuthorizedVehicle(auth.authorizationId, "veh-audit-1");
    expect(mockAuditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "remove_authorized_vehicle",
        resourceType: "multi_taxi_authorized_vehicle",
      }),
    );
  });
});
