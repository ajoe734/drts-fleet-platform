import { EventEmitter2 } from "@nestjs/event-emitter";
import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { MultiTaxiService } from "../../src/modules/multi-taxi/multi-taxi.service";
import { ServiceProductService } from "../../src/modules/service-product/service-product.service";

function createHarness() {
  const eventEmitter = new EventEmitter2();
  const auditNotificationService = {
    recordAuditLog: vi.fn(),
    recordNotification: vi.fn(),
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
  });
  serviceProductService.upsertRuntimeProfilePolicy({
    runtimeProfileCode: "multi_taxi_direct",
    serviceProductCode: "taxi_reservation",
    active: true,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveUntil: "2027-01-01T00:00:00.000Z",
  });

  const ownedState = {
    orders: [] as Array<Record<string, unknown>>,
    dispatchJobs: [] as Array<Record<string, unknown>>,
    dispatchAttempts: [] as Array<Record<string, unknown>>,
    dispatchAssignments: [] as Array<Record<string, unknown>>,
    driverTasks: [] as Array<Record<string, unknown>>,
    dispatchTraceLogs: [] as Array<Record<string, unknown>>,
    passengerDisclosureSnapshots: [] as Array<Record<string, unknown>>,
    consumerNotificationOutbox: [] as Array<Record<string, unknown>>,
  };
  const accessTokensByDigest = new Map<string, Record<string, unknown>>();
  const multiTaxiState = {
    authorizations: [] as Array<Record<string, unknown>>,
    vehicles: [] as Array<Record<string, unknown>>,
  };

  const ownedRepository = {
    loadState: vi.fn(async () => ({
      orders: ownedState.orders.map((order) => structuredClone(order)),
      dispatchJobs: ownedState.dispatchJobs.map((job) => structuredClone(job)),
      dispatchAttempts: ownedState.dispatchAttempts.map((attempt) =>
        structuredClone(attempt),
      ),
      dispatchAssignments: ownedState.dispatchAssignments.map((assignment) =>
        structuredClone(assignment),
      ),
      driverTasks: ownedState.driverTasks.map((task) => structuredClone(task)),
      dispatchTraceLogs: ownedState.dispatchTraceLogs.map((traceLog) =>
        structuredClone(traceLog),
      ),
      passengerDisclosureSnapshots: ownedState.passengerDisclosureSnapshots.map(
        (snapshot) => structuredClone(snapshot),
      ),
      consumerNotificationOutbox: ownedState.consumerNotificationOutbox.map(
        (outbox) => structuredClone(outbox),
      ),
    })),
    persistChanges: vi.fn(async (payload: Record<string, unknown[]>) => {
      if (payload.orders) {
        ownedState.orders = [
          ...payload.orders.map((order) => structuredClone(order)),
          ...ownedState.orders.filter(
            (existing) =>
              !payload.orders!.some(
                (candidate) => candidate.orderId === existing.orderId,
              ),
          ),
        ];
      }
      if (payload.dispatchTraceLogs) {
        ownedState.dispatchTraceLogs = [
          ...payload.dispatchTraceLogs.map((traceLog) =>
            structuredClone(traceLog),
          ),
          ...ownedState.dispatchTraceLogs,
        ];
      }
    }),
    reportPersistenceFailure: vi.fn(),
  };

  const multiTaxiRepository = {
    loadState: vi.fn(async () => ({
      authorizations: multiTaxiState.authorizations.map((record) =>
        structuredClone(record),
      ),
      vehicles: multiTaxiState.vehicles.map((record) => structuredClone(record)),
    })),
    persistAuthorization: vi.fn(async (authorization: Record<string, unknown>) => {
      multiTaxiState.authorizations = [
        structuredClone(authorization),
        ...multiTaxiState.authorizations.filter(
          (existing) =>
            existing.authorizationId !== authorization.authorizationId,
        ),
      ];
    }),
    persistVehicle: vi.fn(async (vehicle: Record<string, unknown>) => {
      multiTaxiState.vehicles = [
        structuredClone(vehicle),
        ...multiTaxiState.vehicles.filter(
          (existing) =>
            !(
              existing.authorizationId === vehicle.authorizationId &&
              existing.vehicleId === vehicle.vehicleId
            ),
        ),
      ];
    }),
    persistRideAccessToken: vi.fn(async (token: Record<string, unknown>, digest: string) => {
      const { accessToken: _accessToken, ...persisted } = token;
      accessTokensByDigest.set(digest, structuredClone(persisted));
    }),
    findRideAccessTokenByDigest: vi.fn(async (digest: string) => {
      const token = accessTokensByDigest.get(digest);
      return token ? structuredClone(token) : null;
    }),
    findPassengerRating: vi.fn(async () => null),
    findPassengerPayment: vi.fn(async () => null),
    findElectronicReceipt: vi.fn(async () => null),
    reportPersistenceFailure: vi.fn(),
    isEnabled: () => true,
  };

  const registry = {
    getEligibleCandidates: vi.fn(() => []),
    getVehicleDispatchability: vi.fn(() => true),
    getDriverAvailability: vi.fn(() => true),
    getVehicleLicenseType: vi.fn(() => "multi_purpose_taxi"),
    getVehiclePassengerDisclosureProfile: vi.fn(() => null),
    getDriverPublicRegistrationCredential: vi.fn(() => null),
    listVehicles: vi.fn(() => [{ vehicleId: "veh-demo-001", plateNo: "TAXI-001" }]),
    listDrivers: vi.fn(() => [{ driverId: "drv-demo-001", name: "Driver One" }]),
  };
  const callcenterService = {
    registerRecordingAttachmentListener: vi.fn(),
    registerRecordingStateChangeListener: vi.fn(),
    linkOrderToCallSession: vi.fn(),
  };

  const createServices = async () => {
    const ownedMobilityService = new OwnedMobilityService(
      registry as never,
      auditNotificationService as never,
      callcenterService as never,
      new OwnedMobilityTaskEventsService(eventEmitter),
      new OpsDispatchEventsService(eventEmitter),
      ownedRepository as never,
      undefined,
      undefined,
      serviceProductService,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    await ownedMobilityService.onModuleInit();

    const multiTaxiService = new MultiTaxiService(
      ownedMobilityService,
      multiTaxiRepository as never,
      serviceProductService,
    );
    await multiTaxiService.onModuleInit();

    return { ownedMobilityService, multiTaxiService };
  };

  return {
    createServices,
    multiTaxiRepository,
  };
}

describe("MTX-CORE-001 runtime authority integration", () => {
  it("passes canonical platform-reserved intake and persisted readback after restart", async () => {
    const harness = createHarness();
    const first = await harness.createServices();
    const authorization = first.multiTaxiService.activateAuthorization(
      first.multiTaxiService.createAuthorization({
        operatorId: "operator-001",
        authorityCode: "TPE-MTX-001",
        businessPlanVersion: "2026.1",
        serviceAreaCodes: ["TPE"],
        activeFareVersionId: "fare-001",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveUntil: "2027-01-01T00:00:00.000Z",
      }).authorizationId,
    );
    first.multiTaxiService.addAuthorizedVehicle(authorization.authorizationId, {
      vehicleId: "veh-demo-001",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveUntil: "2027-01-01T00:00:00.000Z",
    });

    const onDemand = await first.multiTaxiService.createRide(
      {
        pickup: { address: "台北車站" },
        dropoff: { address: "松山機場" },
        passenger: {
          passengerId: "passenger-001",
          name: "測試乘客",
          phone: "0911222333",
        },
        requestedPickupAt: new Date().toISOString(),
        timingMode: "on_demand",
        paymentMethodTokenRef: null,
      },
      null,
    );
    const scheduled = await first.multiTaxiService.createRide(
      {
        pickup: { address: "台北車站" },
        dropoff: { address: "桃園機場" },
        passenger: {
          passengerId: "passenger-002",
          name: "預約乘客",
          phone: "0911333444",
        },
        requestedPickupAt: "2026-12-01T10:00:00.000Z",
        timingMode: "scheduled",
        paymentMethodTokenRef: null,
      },
      null,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    const restarted = await harness.createServices();
    const readback = await restarted.multiTaxiService.getPassengerRide(
      onDemand.passengerAccess.accessToken,
    );

    expect(onDemand.ride).toMatchObject({
      runtimeProfileCode: "multi_taxi_direct",
      serviceProductCode: "taxi_reservation",
      acquisitionMode: "platform_reserved",
      timingMode: "on_demand",
      queueMode: "virtual_matching",
    });
    expect(scheduled.ride).toMatchObject({
      runtimeProfileCode: "multi_taxi_direct",
      serviceProductCode: "taxi_reservation",
      acquisitionMode: "platform_reserved",
      timingMode: "scheduled",
      dispatchSemantics: "reservation",
    });
    expect(readback).toMatchObject({
      order: {
        orderId: onDemand.ride.orderId,
        status: "ready_for_dispatch",
        timingMode: "on_demand",
      },
      assignment: null,
      receipt: null,
      actions: {
        canCancel: true,
        canRate: false,
        canReadReceipt: true,
      },
    });
    expect(
      harness.multiTaxiRepository.findRideAccessTokenByDigest,
    ).toHaveBeenCalledTimes(1);
  });

  it("denies spoofed street-hail and physical-rank multi-taxi attempts", async () => {
    const harness = createHarness();
    const { multiTaxiService } = await harness.createServices();
    const authorization = multiTaxiService.activateAuthorization(
      multiTaxiService.createAuthorization({
        operatorId: "operator-001",
        authorityCode: "TPE-MTX-001",
        businessPlanVersion: "2026.1",
        serviceAreaCodes: ["TPE"],
        activeFareVersionId: "fare-001",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveUntil: "2027-01-01T00:00:00.000Z",
      }).authorizationId,
    );
    multiTaxiService.addAuthorizedVehicle(authorization.authorizationId, {
      vehicleId: "veh-demo-001",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveUntil: "2027-01-01T00:00:00.000Z",
    });

    await expect(
      multiTaxiService.createRide(
        {
          pickup: { address: "台北車站" },
          dropoff: { address: "松山機場" },
          passenger: { name: "測試乘客", phone: "0911222333" },
          requestedPickupAt: new Date().toISOString(),
          timingMode: "on_demand",
          paymentMethodTokenRef: null,
          acquisitionMode: "street_hail",
        } as never,
        null,
      ),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "MULTI_TAXI_CANONICAL_CONTEXT_OVERRIDE_FORBIDDEN",
          details: { field: "acquisitionMode" },
        },
      },
    });

    expect(() =>
      multiTaxiService.queueCheckIn({
        vehicleId: "veh-demo-001",
        siteId: "physical-rank-demo",
        queueMode: "physical_rank",
      }),
    ).toThrowError(ApiRequestError);

    try {
      multiTaxiService.queueCheckIn({
        vehicleId: "veh-demo-001",
        siteId: "physical-rank-demo",
        queueMode: "physical_rank",
      });
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "MULTI_TAXI_QUEUE_MODE_FORBIDDEN",
        },
      });
    }
  });
});
