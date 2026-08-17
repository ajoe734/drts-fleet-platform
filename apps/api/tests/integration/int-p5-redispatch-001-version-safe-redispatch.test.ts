import { EventEmitter2 } from "@nestjs/event-emitter";
import { HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { OwnedMobilityController } from "../../src/modules/owned-mobility/owned-mobility.controller";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { FareAnomalyRepository } from "../../src/modules/product-rule/fare-anomaly.repository";
import { FareAnomalyService } from "../../src/modules/product-rule/fare-anomaly.service";
import { ServiceProductService } from "../../src/modules/service-product/service-product.service";

// P5-RATE-001 C6. The unit suite proves the staleness guard itself; this proves
// the guard is *reachable*. `expectedAssignmentVersion` is an optional field on
// a body-bound command, so a version of this feature where the field never
// survives the request would still pass every service-level test while doing
// nothing in production. Everything below therefore goes through the real
// controller with plain JSON bodies, exactly as the HTTP layer delivers them.

async function createHarness() {
  const auditNotificationService = {
    recordNotification: vi.fn(),
    recordAuditLog: vi.fn(),
  };
  const serviceProductService = new ServiceProductService(
    auditNotificationService as never,
    undefined,
  );
  serviceProductService.createServiceProduct({
    serviceProductType: "taxi_reservation",
    displayName: "Multi-taxi reservation",
    timing: "reservation",
    active: true,
    defaultBillingMode: "meter",
    defaultProofRequirements: [],
  } as never);

  const registry = {
    getEligibleCandidates: vi.fn(() => [
      {
        driverId: "drv-demo-001",
        vehicleId: "veh-demo-001",
        etaMinutes: 4,
        operatingArea: "TPE",
        serviceBuckets: ["standard_taxi"],
      },
    ]),
    getVehicleDispatchability: vi.fn(() => true),
    getDriverAvailability: vi.fn(() => true),
    getVehicleLicenseType: vi.fn(() => "multi_purpose_taxi"),
    getVehiclePassengerDisclosureProfile: vi.fn(() => ({
      vehicleId: "veh-demo-001",
      make: "Toyota",
      model: "Sienta",
      modelYear: 2024,
      doorCount: 5,
      color: "Silver",
      status: "complete",
      missingFieldCodes: [],
      version: 2,
    })),
    getDriverPublicRegistrationCredential: vi.fn(() => ({
      driverId: "drv-demo-001",
      effectiveUntil: "2027-01-01",
      status: "verified_active",
      maskedDisplay: "RE***01",
      version: 3,
    })),
    listVehicles: vi.fn(() => [
      { vehicleId: "veh-demo-001", plateNo: "TAXI-001", operatingArea: "TPE" },
    ]),
    listDrivers: vi.fn(() => [
      { driverId: "drv-demo-001", name: "Driver One" },
    ]),
    listSupplyPairs: vi.fn(() => [
      { vehicleId: "veh-demo-001", driverId: "drv-demo-001", etaMinutes: 8 },
    ]),
  };
  const callcenterService = {
    registerRecordingAttachmentListener: vi.fn(),
    registerRecordingStateChangeListener: vi.fn(),
    linkOrderToCallSession: vi.fn(),
  };

  const fareAnomalyService = new FareAnomalyService(
    new FareAnomalyRepository(undefined as never),
    { recordAuditLog: vi.fn() } as never,
    { isAvailable: vi.fn(() => false), recover: vi.fn() } as never,
  );
  await fareAnomalyService.onModuleInit();

  const eventEmitter = new EventEmitter2();
  const service = new OwnedMobilityService(
    registry as never,
    auditNotificationService as never,
    callcenterService as never,
    new OwnedMobilityTaskEventsService(eventEmitter),
    new OpsDispatchEventsService(eventEmitter),
    undefined,
    undefined,
    undefined,
    serviceProductService,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    fareAnomalyService,
  );

  return {
    service,
    controller: new OwnedMobilityController(service, {} as never),
  };
}

function createRide(service: OwnedMobilityService) {
  return service.createMultiTaxiRide(
    {
      pickup: { address: "台北車站", lat: 25.0478, lng: 121.517 },
      dropoff: { address: "松山機場", lat: 25.0697, lng: 121.5525 },
      passenger: {
        passengerId: "passenger-redispatch-001",
        name: "測試乘客",
        phone: "0911222333",
      },
      requestedPickupAt: new Date().toISOString(),
      timingMode: "on_demand",
      paymentMethodTokenRef: null,
    },
    {
      authorizationId: "auth-mtx-redispatch-001",
      operatorId: "operator-001",
      authorityCode: "TPE-MTX-001",
      businessPlanVersion: "2026.1",
      status: "approved",
      serviceAreaCodes: ["TPE"],
      activeFareVersionId: "fare-2026-001",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveUntil: "2027-01-01T00:00:00.000Z",
    } as never,
  );
}

describe("P5-RATE-001 version-safe redispatch over the dispatch API", () => {
  it("carries expectedAssignmentVersion from the request body into the staleness guard", async () => {
    const { service, controller } = await createHarness();
    const order = createRide(service);

    const dispatched = controller.dispatchOrder(
      order.orderId,
      { mode: "auto" } as never,
      "req-redispatch-dispatch-1",
    );
    await controller.assignDispatch(
      {
        dispatchJobId: dispatched.data.dispatchJobId,
        vehicleId: "veh-demo-001",
        driverId: "drv-demo-001",
      },
      "req-redispatch-assign-1",
    );

    // The version a client can actually observe is the one on the passenger
    // disclosure snapshot, so that is the value a real caller would echo back.
    const observedVersion = service.findPassengerAssignmentDisclosure(
      order.orderId,
    )!.assignmentVersion;
    expect(observedVersion).toBe(1);

    // Supersede it: redispatch, then assign again.
    controller.redispatchOrder(
      order.orderId,
      { reasonCode: "driver_unreachable" } as never,
      "req-redispatch-1",
    );
    const redispatched = controller.dispatchOrder(
      order.orderId,
      { mode: "auto" } as never,
      "req-redispatch-dispatch-2",
    );
    await controller.assignDispatch(
      {
        dispatchJobId: redispatched.data.dispatchJobId,
        vehicleId: "veh-demo-001",
        driverId: "drv-demo-001",
      },
      "req-redispatch-assign-2",
    );
    expect(
      service.findPassengerAssignmentDisclosure(order.orderId)!
        .assignmentVersion,
    ).toBe(2);

    const liveBefore = service
      .getReportingSnapshot()
      .dispatchAssignments.filter(
        (assignment) =>
          assignment.orderId === order.orderId &&
          ["assigned", "accepted"].includes(assignment.status),
      );
    expect(liveBefore).toHaveLength(1);

    // The stale v1 event now arrives over the wire. `expectedAssignmentVersion`
    // is carried as an ordinary body field, so if the field were dropped
    // anywhere between the request and the service this call would succeed and
    // silently cancel the v2 assignment.
    let caught: unknown;
    try {
      controller.redispatchOrder(
        order.orderId,
        {
          reasonCode: "driver_unreachable",
          expectedAssignmentVersion: observedVersion,
        } as never,
        "req-redispatch-stale",
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApiRequestError);
    expect((caught as ApiRequestError).getStatus()).toBe(HttpStatus.CONFLICT);
    expect((caught as ApiRequestError).getResponse()).toMatchObject({
      error: {
        code: "STALE_REDISPATCH_EVENT",
        details: {
          orderId: order.orderId,
          currentAssignmentVersion: 2,
          expectedAssignmentVersion: 1,
        },
      },
    });

    // The newer assignment is untouched.
    expect(service.getOrder(order.orderId).status).toBe("assigned");
    const liveAfter = service
      .getReportingSnapshot()
      .dispatchAssignments.filter(
        (assignment) =>
          assignment.orderId === order.orderId &&
          ["assigned", "accepted"].includes(assignment.status),
      );
    expect(liveAfter).toHaveLength(1);
    expect(liveAfter[0]!.assignmentId).toBe(liveBefore[0]!.assignmentId);
  });
});
