import { describe, expect, it, vi } from "vitest";
import { MultiTaxiController } from "../../src/modules/multi-taxi/multi-taxi.controller";
import { MultiTaxiService } from "../../src/modules/multi-taxi/multi-taxi.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";

describe("MTX-AUTH-001 Operating Authorization Controller & Service Integration", () => {
  function setupIntegrationHarness() {
    const auditNotificationService = new AuditNotificationService();
    const regulatoryRegistryService = new RegulatoryRegistryService(
      {} as any,
      auditNotificationService,
      {} as any,
    );

    const mockOwnedMobilityService = {} as any;
    const multiTaxiService = new MultiTaxiService(
      mockOwnedMobilityService,
      undefined,
      undefined,
      auditNotificationService,
      regulatoryRegistryService,
    );

    const controller = new MultiTaxiController(multiTaxiService);

    return {
      controller,
      multiTaxiService,
      auditNotificationService,
      regulatoryRegistryService,
    };
  }

  it("Full Admin Lifecycle via MultiTaxiController: create -> get -> update -> activate -> addVehicle -> listVehicles -> deleteVehicle -> suspend", () => {
    const { controller, auditNotificationService } = setupIntegrationHarness();
    const requestId = "req-test-auth-001";

    // 1. POST create authorization
    const createRes = controller.createAuthorization(
      {
        operatorId: "op-integ-001",
        authorityCode: "AUTH-INTEG-001",
        businessPlanVersion: "v1.0",
        serviceAreaCodes: ["TAIPEI-MAIN"],
        activeFareVersionId: "fare-v1",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
      },
      requestId,
    );

    expect(createRes.meta.requestId).toBe(requestId);
    const authId = createRes.data.authorizationId;
    expect(authId).toBeDefined();
    expect(createRes.data.status).toBe("draft");

    // 2. GET list authorizations
    const listRes = controller.listAuthorizations(requestId);
    expect(listRes.data.items).toHaveLength(1);

    // 3. GET authorization detail
    const getRes = controller.getAuthorization(authId, requestId);
    expect(getRes.data.authorityCode).toBe("AUTH-INTEG-001");

    // 4. PUT update authorization
    const updateRes = controller.updateAuthorization(
      authId,
      { authorityCode: "AUTH-INTEG-001-UPDATED" },
      requestId,
    );
    expect(updateRes.data.authorityCode).toBe("AUTH-INTEG-001-UPDATED");

    // 5. POST activate authorization
    const activateRes = controller.activateAuthorization(authId, requestId);
    expect(activateRes.data.status).toBe("approved");

    // 6. POST add authorized vehicle
    const addVehRes = controller.addAuthorizedVehicle(
      authId,
      {
        vehicleId: "veh-integ-001",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
      },
      requestId,
    );
    expect(addVehRes.data.status).toBe("active");

    // 7. GET list authorized vehicles
    const listVehRes = controller.listAuthorizedVehicles(authId, requestId);
    expect(listVehRes.data.items).toHaveLength(1);
    expect(listVehRes.data.items[0].vehicleId).toBe("veh-integ-001");

    // 8. DELETE remove authorized vehicle
    const removeVehRes = controller.removeAuthorizedVehicle(
      authId,
      "veh-integ-001",
      requestId,
    );
    expect(removeVehRes.data.status).toBe("removed");

    // 9. POST suspend authorization
    const suspendRes = controller.suspendAuthorization(authId, requestId);
    expect(suspendRes.data.status).toBe("suspended");

    // Verify all audit logs recorded in auditNotificationService
    const auditLogs = auditNotificationService.getAuditLogsSnapshot();
    const actionNames = auditLogs.map((l) => l.actionName);
    expect(actionNames).toContain("create_operating_authorization");
    expect(actionNames).toContain("update_operating_authorization");
    expect(actionNames).toContain("activate_operating_authorization");
    expect(actionNames).toContain("add_authorized_vehicle");
    expect(actionNames).toContain("remove_authorized_vehicle");
    expect(actionNames).toContain("suspend_operating_authorization");
  });

  it("Hard Gate validation on RegulatoryRegistryService reads live state from MultiTaxiService", () => {
    const { controller, regulatoryRegistryService } = setupIntegrationHarness();

    // Default demo authorization passes
    const validatedDemo =
      regulatoryRegistryService.validateMultiTaxiOperatingAuthorizationForAssignment(
        "auth-demo-001",
        "veh-demo-001",
        "TAIPEI-MAIN",
        "fare-v1",
      );
    expect(validatedDemo.authorizationId).toBe("auth-demo-001");

    // Missing authorization ID throws P5_OPERATING_AUTHORIZATION_MISSING
    expect(() =>
      regulatoryRegistryService.validateMultiTaxiOperatingAuthorizationForAssignment(
        null,
        "veh-demo-001",
      ),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "P5_OPERATING_AUTHORIZATION_MISSING",
          }),
        }),
      }),
    );

    // 1. Create a new draft authorization via MultiTaxiController
    const createRes = controller.createAuthorization({
      operatorId: "op-live-001",
      authorityCode: "AUTH-LIVE-001",
      businessPlanVersion: "v1.0",
      serviceAreaCodes: ["TAIPEI-NORTH"],
      activeFareVersionId: "fare-live-v1",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });
    const authId = createRes.data.authorizationId;

    // Validation fails because authorization is still in draft state
    expect(() =>
      regulatoryRegistryService.validateMultiTaxiOperatingAuthorizationForAssignment(
        authId,
        "veh-live-001",
        "TAIPEI-NORTH",
        "fare-live-v1",
      ),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "P5_OPERATING_AUTHORIZATION_INACTIVE",
          }),
        }),
      }),
    );

    // 2. Activate authorization
    controller.activateAuthorization(authId);

    // Validation fails because vehicle membership has not been added yet
    expect(() =>
      regulatoryRegistryService.validateMultiTaxiOperatingAuthorizationForAssignment(
        authId,
        "veh-live-001",
        "TAIPEI-NORTH",
        "fare-live-v1",
      ),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "P5_VEHICLE_NOT_IN_AUTHORIZATION",
          }),
        }),
      }),
    );

    // 3. Add vehicle membership
    controller.addAuthorizedVehicle(authId, {
      vehicleId: "veh-live-001",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });

    // Validation now PASSES for newly created & activated authorization + vehicle!
    const validatedNew =
      regulatoryRegistryService.validateMultiTaxiOperatingAuthorizationForAssignment(
        authId,
        "veh-live-001",
        "TAIPEI-NORTH",
        "fare-live-v1",
      );
    expect(validatedNew.authorizationId).toBe(authId);

    // 4. Mismatched service area throws P5_AUTHORIZATION_SERVICE_AREA_MISMATCH
    expect(() =>
      regulatoryRegistryService.validateMultiTaxiOperatingAuthorizationForAssignment(
        authId,
        "veh-live-001",
        "TAIPEI-SOUTH",
        "fare-live-v1",
      ),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "P5_AUTHORIZATION_SERVICE_AREA_MISMATCH",
          }),
        }),
      }),
    );

    // 5. Inactive/mismatched fare version throws P5_FARE_VERSION_NOT_ACTIVE
    expect(() =>
      regulatoryRegistryService.validateMultiTaxiOperatingAuthorizationForAssignment(
        authId,
        "veh-live-001",
        "TAIPEI-NORTH",
        "fare-wrong",
      ),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "P5_FARE_VERSION_NOT_ACTIVE",
          }),
        }),
      }),
    );

    // 6. Removing authorized vehicle causes validation to fail with P5_VEHICLE_NOT_IN_AUTHORIZATION
    controller.removeAuthorizedVehicle(authId, "veh-live-001");
    expect(() =>
      regulatoryRegistryService.validateMultiTaxiOperatingAuthorizationForAssignment(
        authId,
        "veh-live-001",
        "TAIPEI-NORTH",
        "fare-live-v1",
      ),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "P5_VEHICLE_NOT_IN_AUTHORIZATION",
          }),
        }),
      }),
    );

    // 7. Suspending authorization causes validation to fail with P5_OPERATING_AUTHORIZATION_INACTIVE
    controller.addAuthorizedVehicle(authId, {
      vehicleId: "veh-live-001",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });
    controller.suspendAuthorization(authId);
    expect(() =>
      regulatoryRegistryService.validateMultiTaxiOperatingAuthorizationForAssignment(
        authId,
        "veh-live-001",
        "TAIPEI-NORTH",
        "fare-live-v1",
      ),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "P5_OPERATING_AUTHORIZATION_INACTIVE",
          }),
        }),
      }),
    );
  });
});
