import { afterEach, describe, expect, it, vi } from "vitest";

import { EventEmitter2 } from "@nestjs/event-emitter";

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
    {
      driverId: "drv-demo-002",
      name: "Driver Ineligible",
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
      licenseType: "multi_purpose_taxi",
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
          evaluatedAt: "2026-06-20T00:00:00.000Z",
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
    {
      vehicleId: "veh-demo-002",
      plateNo: "ABC-1002",
      licenseType: "taxi",
      operatingArea: "taipei",
      supportedServiceBuckets: ["business_dispatch"],
      dispatchableFlag: true,
      exclusivityApproved: true,
      insuranceStatus: "valid",
      updatedAt: "2026-06-20T00:00:00.000Z",
      supplyLifecycle: {
        contract: {
          contractId: "contract-002",
          lifecycleStatus: "active",
          startAt: "2026-06-01T00:00:00.000Z",
          endAt: null,
          updatedAt: "2026-06-20T00:00:00.000Z",
        },
        insurance: {
          policyId: "policy-002",
          lifecycleStatus: "active",
          startAt: "2026-06-01T00:00:00.000Z",
          endAt: null,
          updatedAt: "2026-06-20T00:00:00.000Z",
        },
        exclusivity: {
          lifecycleStatus: "approved",
          declarationStatus: "submitted",
          declarationFileId: "decl-002",
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
          evaluatedAt: "2026-06-20T00:00:00.000Z",
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

  return {
    getEligibleCandidates: vi.fn(() => [
      {
        driverId: "drv-demo-001",
        vehicleId: "veh-demo-001",
        etaMinutes: 4,
        operatingArea: "taipei",
        serviceBuckets: ["business_dispatch"],
        currentLocation: {
          driverId: "drv-demo-001",
          lat: 25.033,
          lng: 121.5654,
          accuracyM: 20,
          recordedAt: "2026-06-20T11:58:00.000Z",
          updatedAt: "2026-06-20T11:58:00.000Z",
        },
      },
      {
        driverId: "drv-demo-002",
        vehicleId: "veh-demo-002",
        etaMinutes: 7,
        operatingArea: "taipei",
        serviceBuckets: ["business_dispatch"],
        currentLocation: {
          driverId: "drv-demo-002",
          lat: 25.0478,
          lng: 121.5319,
          accuracyM: 15,
          recordedAt: "2026-06-20T11:59:45.000Z",
          updatedAt: "2026-06-20T11:59:45.000Z",
        },
      },
    ]),
    getVehicleDispatchability: vi.fn(() => true),
    getDriverAvailability: vi.fn(() => true),
    getVehicleLicenseType: vi.fn(
      (vehicleId: string) =>
        vehicles.find((vehicle) => vehicle.vehicleId === vehicleId)?.licenseType ??
        null,
    ),
    listDrivers: vi.fn(() => drivers),
    listVehicles: vi.fn(() => vehicles),
    listLatestDriverLocations: vi.fn(() => [
      {
        driverId: "drv-demo-001",
        lat: 25.033,
        lng: 121.5654,
        accuracyM: 20,
        recordedAt: "2026-06-20T11:58:00.000Z",
        updatedAt: "2026-06-20T11:58:00.000Z",
      },
      {
        driverId: "drv-demo-002",
        lat: 25.0478,
        lng: 121.5319,
        accuracyM: 15,
        recordedAt: "2026-06-20T11:59:45.000Z",
        updatedAt: "2026-06-20T11:59:45.000Z",
      },
    ]),
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
    ownedMobilityService,
    cleanup: async () => {
      await ownedMobilityTaskEventsService.onModuleDestroy();
      await opsDispatchEventsService.onModuleDestroy();
    },
  };
}

describe("INT-ELIG-001 candidate query uses exact product", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    vi.useRealTimers();
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("decorates decisions and includes ineligible rows on demand", async () => {
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
          name: "Rider One",
          phone: "0912000000",
        },
      },
      "tenant-int-elig-001",
    );
    const dispatchJob = ownedMobilityService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });

    const defaultCandidates = await ownedMobilityService.listDispatchCandidates(
      dispatchJob.dispatchJobId,
    );
    const allCandidates = await ownedMobilityService.listDispatchCandidates(
      dispatchJob.dispatchJobId,
      true,
    );

    expect(defaultCandidates).toEqual([
      expect.objectContaining({
        driverId: "drv-demo-001",
        vehicleId: "veh-demo-001",
        eligibilityDecision: "conditionally_eligible",
        softReasonCodes: ["STALE_LOCATION"],
        hardReasonCodes: [],
        locationState: "stale",
        serviceProductContext: expect.objectContaining({
          serviceProductCode: "enterprise_dispatch",
        }),
      }),
    ]);
    expect(allCandidates).toEqual([
      expect.objectContaining({
        driverId: "drv-demo-001",
        eligibilityDecision: "conditionally_eligible",
      }),
      expect.objectContaining({
        driverId: "drv-demo-002",
        vehicleId: "veh-demo-002",
        eligibilityDecision: "ineligible",
        hardReasonCodes: expect.arrayContaining([
          "VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT",
          "BUSINESS_DISPATCH_ELIGIBILITY_REQUIRED",
          "FIXED_FARE_NOT_ALLOWED",
        ]),
        serviceProductContext: expect.objectContaining({
          serviceProductCode: "enterprise_dispatch",
        }),
      }),
    ]);
  });
});
