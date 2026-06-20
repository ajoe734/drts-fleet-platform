import { afterEach, describe, expect, it, vi } from "vitest";

import { EventEmitter2 } from "@nestjs/event-emitter";

import { ApiRequestError } from "../../src/common/api-envelope";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../src/modules/callcenter/callcenter.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { ServiceProductService } from "../../src/modules/service-product/service-product.service";
import { EligibilityContextResolver } from "../../src/modules/vehicle-eligibility/eligibility-context-resolver.service";
import { RuntimeEligibilityEvaluator } from "../../src/modules/vehicle-eligibility/runtime-eligibility-evaluator.service";
import { VehicleEligibilityService } from "../../src/modules/vehicle-eligibility/vehicle-eligibility.service";

function createRegistryStub() {
  const drivers = [
    {
      driverId: "drv-demo-001",
      name: "Driver Eligible",
      supportedServiceBuckets: ["business_dispatch"],
      workState: "available",
      licensesValid: true,
      lifecycleStatus: "active",
      eligibilityBlockedReasons: [],
      dispatchEligible: true,
      createdAt: "2026-06-20T00:00:00.000Z",
      updatedAt: "2026-06-20T00:00:00.000Z",
      activatedAt: "2026-06-20T00:00:00.000Z",
      suspendedAt: null,
      retiredAt: null,
      profileUpdatedAt: "2026-06-20T00:00:00.000Z",
      deviceBindings: [],
    },
  ];

  const vehicles = [
    {
      vehicleId: "veh-demo-001",
      plateNo: "ABC-1001",
      operatingArea: "taipei",
      supportedServiceBuckets: ["business_dispatch"],
      dispatchableFlag: true,
      exclusivityApproved: true,
      insuranceStatus: "valid",
      updatedAt: "2026-06-20T00:00:00.000Z",
      supplyLifecycle: {
        contract: {
          contractId: "contract-001",
          lifecycleStatus: "active",
          startAt: "2026-06-01T00:00:00.000Z",
          endAt: null,
          updatedAt: "2026-06-20T00:00:00.000Z",
        },
        insurance: {
          policyId: "policy-001",
          lifecycleStatus: "active",
          startAt: "2026-06-01T00:00:00.000Z",
          endAt: null,
          updatedAt: "2026-06-20T00:00:00.000Z",
        },
        exclusivity: {
          lifecycleStatus: "approved",
          declarationStatus: "submitted",
          declarationFileId: "decl-001",
          reviewStatus: "approved",
          providerName: "DRTS",
          effectiveStart: "2026-06-01T00:00:00.000Z",
          effectiveEnd: null,
          reviewedAt: "2026-06-20T00:00:00.000Z",
          updatedAt: "2026-06-20T00:00:00.000Z",
        },
        dispatch: {
          eligible: true,
          blockedReasons: [],
          evaluatedAt: "2026-06-20T11:59:30.000Z",
        },
        offboarding: {
          status: "none",
          reason: null,
          requestedAt: null,
          effectiveAt: null,
          completedAt: null,
          requestedBy: null,
          debrandingRequired: false,
          debrandingStatus: "not_required",
          debrandingDueAt: null,
          debrandingCompletedAt: null,
          debrandingTicketId: null,
          notes: null,
        },
        lastTrace: null,
      },
    },
  ];

  const latestLocations = [
    {
      driverId: "drv-demo-001",
      lat: 25.033,
      lng: 121.5654,
      accuracyM: 12,
      recordedAt: "2026-06-20T11:59:45.000Z",
      updatedAt: "2026-06-20T11:59:45.000Z",
    },
  ];

  return {
    drivers,
    vehicles,
    getEligibleCandidates: vi.fn(() => [
      {
        driverId: "drv-demo-001",
        vehicleId: "veh-demo-001",
        etaMinutes: 4,
        operatingArea: "taipei",
        serviceBuckets: ["business_dispatch"],
        currentLocation: latestLocations[0],
      },
    ]),
    getVehicleDispatchability: vi.fn(() => true),
    getDriverAvailability: vi.fn(() => true),
    listDrivers: vi.fn(() => drivers),
    listVehicles: vi.fn(() => vehicles),
    listLatestDriverLocations: vi.fn(() => latestLocations),
  };
}

function createHarness() {
  const eventEmitter = new EventEmitter2();
  const auditNotificationService = new AuditNotificationService();
  const registry = createRegistryStub();
  const serviceProductService = new ServiceProductService(
    auditNotificationService,
    undefined,
  );
  const vehicleEligibilityService = new VehicleEligibilityService(
    registry as never,
    auditNotificationService,
    undefined,
    serviceProductService,
  );
  const contextResolver = new EligibilityContextResolver(
    registry as never,
    serviceProductService,
    vehicleEligibilityService,
  );
  const runtimeEligibilityEvaluator = new RuntimeEligibilityEvaluator(
    contextResolver,
    auditNotificationService,
    undefined,
  );
  const callcenterService = new CallcenterService(auditNotificationService);
  const ownedMobilityTaskEventsService = new OwnedMobilityTaskEventsService(
    eventEmitter,
  );
  const opsDispatchEventsService = new OpsDispatchEventsService(eventEmitter);
  const ownedMobilityService = new OwnedMobilityService(
    registry as never,
    auditNotificationService,
    callcenterService,
    ownedMobilityTaskEventsService,
    opsDispatchEventsService,
    undefined,
    undefined,
    vehicleEligibilityService,
    serviceProductService,
    undefined,
    runtimeEligibilityEvaluator,
  );

  return {
    registry,
    ownedMobilityService,
    cleanup: async () => {
      await ownedMobilityTaskEventsService.onModuleDestroy();
      await opsDispatchEventsService.onModuleDestroy();
    },
  };
}

describe("INT-ELIG-002 assignment rechecks", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    vi.useRealTimers();
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("returns 409 with latest reasons when eligibility changes before assignment", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T12:00:00.000Z"));

    const { registry, ownedMobilityService, cleanup } = createHarness();
    cleanups.push(cleanup);

    const booking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-06-20T13:00:00.000Z",
        reservationWindowEnd: "2026-06-20T14:00:00.000Z",
        pickup: {
          address: "Taipei 101",
          lat: 25.033,
          lng: 121.5654,
        },
        dropoff: {
          address: "Taoyuan Airport",
        },
        passenger: {
          name: "Rider Two",
          phone: "0912333444",
        },
      },
      "tenant-int-elig-002",
    );
    const dispatchJob = ownedMobilityService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });

    registry.vehicles[0].supplyLifecycle.dispatch.eligible = false;
    registry.vehicles[0].supplyLifecycle.dispatch.blockedReasons = [
      "airport_permit_revoked",
    ];

    expect(() =>
      ownedMobilityService.assignDispatch({
        dispatchJobId: dispatchJob.dispatchJobId,
        vehicleId: "veh-demo-001",
        driverId: "drv-demo-001",
      }),
    ).toThrowError(ApiRequestError);

    try {
      ownedMobilityService.assignDispatch({
        dispatchJobId: dispatchJob.dispatchJobId,
        vehicleId: "veh-demo-001",
        driverId: "drv-demo-001",
      });
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT",
          details: {
            dispatchJobId: dispatchJob.dispatchJobId,
            vehicleId: "veh-demo-001",
            driverId: "drv-demo-001",
            eligibilityDecision: "ineligible",
            hardReasonCodes: ["AIRPORT_PERMIT_REVOKED"],
            serviceProductContext: {
              serviceProductCode: "enterprise_dispatch",
            },
          },
        },
      });
    }

    expect(ownedMobilityService.listDriverTasks()).toEqual([]);
  });

  it("persists exact product context onto the driver task", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T12:00:00.000Z"));

    const { ownedMobilityService, cleanup } = createHarness();
    cleanups.push(cleanup);

    const booking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-06-20T13:00:00.000Z",
        reservationWindowEnd: "2026-06-20T14:00:00.000Z",
        pickup: {
          address: "Taipei 101",
          lat: 25.033,
          lng: 121.5654,
        },
        dropoff: {
          address: "Taoyuan Airport",
        },
        passenger: {
          name: "Rider Three",
          phone: "0912555666",
        },
      },
      "tenant-int-elig-002",
    );
    const dispatchJob = ownedMobilityService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });
    const assignment = ownedMobilityService.assignDispatch({
      dispatchJobId: dispatchJob.dispatchJobId,
      vehicleId: "veh-demo-001",
      driverId: "drv-demo-001",
    });

    const task = ownedMobilityService.getDriverTask(assignment.taskId);
    expect(task.serviceProductContext).toMatchObject({
      serviceProductId: "seed-enterprise-dispatch",
      serviceProductCode: "enterprise_dispatch",
      evaluatedAt: "2026-06-20T12:00:00.000Z",
    });
    expect(task.serviceProductContext?.policyVersion).toContain(
      "service:seed-enterprise-dispatch@",
    );
  });
});
