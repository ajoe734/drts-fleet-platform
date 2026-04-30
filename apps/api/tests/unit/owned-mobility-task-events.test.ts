import { EventEmitter2 } from "@nestjs/event-emitter";
import { firstValueFrom, take, timeout, toArray } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveRouteAuthPolicy } from "../../src/common/auth";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";

function createOwnedMobilityService(options?: {
  candidates?: Array<{
    driverId: string;
    vehicleId: string;
    etaMinutes: number;
    operatingArea: string;
    serviceBuckets: string[];
  }>;
}) {
  const regulatoryRegistryService = {
    getEligibleCandidates: vi.fn(
      () =>
        options?.candidates ?? [
          {
            driverId: "driver-001",
            vehicleId: "vehicle-001",
            etaMinutes: 4,
            operatingArea: "taipei",
            serviceBuckets: ["standard_taxi"],
          },
        ],
    ),
    getVehicleDispatchability: vi.fn(() => true),
    getDriverAvailability: vi.fn(() => true),
  };
  const auditNotificationService = {
    recordNotification: vi.fn(),
    recordAuditLog: vi.fn(),
  };
  const callcenterService = {
    registerRecordingAttachmentListener: vi.fn(),
    registerRecordingStateChangeListener: vi.fn(),
  };
  const taskEventsService = new OwnedMobilityTaskEventsService(
    new EventEmitter2(),
  );
  const opsDispatchEventsService = new OpsDispatchEventsService(
    new EventEmitter2(),
  );

  const service = new OwnedMobilityService(
    regulatoryRegistryService as never,
    auditNotificationService as never,
    callcenterService as never,
    taskEventsService,
    opsDispatchEventsService,
    undefined,
    undefined,
  );

  return {
    service,
    taskEventsService,
    opsDispatchEventsService,
  };
}

describe("owned mobility task events", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("protects driver task event streams with the driver auth policy", () => {
    expect(resolveRouteAuthPolicy("GET", "/api/driver/task-events")).toEqual({
      routeKey: "driver:tasks:GET",
      requiredScopes: ["driver:read"],
      allowedRealms: ["system", "ops", "driver"],
      description: "Driver task access",
    });
  });

  it("emits task_assigned events to the scoped driver stream", async () => {
    const { service } = createOwnedMobilityService();
    const streamPromise = firstValueFrom(
      service
        .streamDriverTaskEvents("driver-001")
        .pipe(take(1), timeout(1_000)),
    );

    const order = service.createPassengerOrder({
      pickup: { address: "Pickup" },
      dropoff: { address: "Dropoff" },
      passenger: { name: "Rider One", phone: "0912000000" },
    });
    const dispatchJob = service.dispatchOrder(order.orderId, { mode: "auto" });

    service.assignDispatch({
      dispatchJobId: dispatchJob.dispatchJobId,
      driverId: "driver-001",
      vehicleId: "vehicle-001",
    });

    const event = await streamPromise;

    expect(event.type).toBe("task_assigned");
    expect(event.retry).toBe(10_000);
    expect(event.data).toMatchObject({
      eventType: "task_assigned",
      subjectId: expect.any(String),
      data: {
        task: {
          driverId: "driver-001",
          status: "pending_acceptance",
          vehicleId: "vehicle-001",
        },
      },
    });
  });

  it("protects ops dispatch event streams with the ops auth policy", () => {
    expect(resolveRouteAuthPolicy("GET", "/api/ops/dispatch-events")).toEqual({
      routeKey: "ops:dispatch-events:GET",
      requiredScopes: ["dispatch:read"],
      allowedRealms: ["system", "ops"],
      description: "Ops dispatch event access",
    });
  });

  it("emits order and dispatch job updates to the ops dispatch stream", async () => {
    const { service } = createOwnedMobilityService();
    const streamPromise = firstValueFrom(
      service
        .streamOpsDispatchEvents()
        .pipe(take(2), toArray(), timeout(1_000)),
    );

    const order = service.createPassengerOrder({
      pickup: { address: "Pickup" },
      dropoff: { address: "Dropoff" },
      passenger: { name: "Rider One", phone: "0912000000" },
    });

    service.dispatchOrder(order.orderId, { mode: "auto" });

    const events = await streamPromise;

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "order_created",
      retry: 10_000,
      data: {
        eventType: "order_created",
        data: {
          order: {
            orderId: order.orderId,
            status: "ready_for_dispatch",
          },
        },
      },
    });
    expect(events[1]).toMatchObject({
      type: "dispatch_job_updated",
      data: {
        eventType: "dispatch_job_updated",
        data: {
          orderId: order.orderId,
          dispatchJob: {
            orderId: order.orderId,
            status: "matching",
          },
        },
      },
    });
  });

  it("emits order_updated when manual fare override changes a fixed-price order", async () => {
    const { service } = createOwnedMobilityService();
    const streamPromise = firstValueFrom(
      service
        .streamOpsDispatchEvents()
        .pipe(take(2), toArray(), timeout(1_000)),
    );

    const booking = service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-04-29T14:00:00.000Z",
        reservationWindowEnd: "2026-04-29T15:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Rider One", phone: "0912000000" },
      },
      "tenant-demo-001",
    );

    service.applyManualFareOverride(
      booking.orderId,
      {
        fare: {
          currency: "NTD",
          amountMinor: 188000,
        },
        reason: "Airport surge approval",
        traceId: "trace-fare-override-001",
      },
      {
        actorType: "ops_user",
        actorId: "ops-007",
      } as never,
    );

    const events = await streamPromise;

    expect(events[1]).toMatchObject({
      type: "order_updated",
      data: {
        eventType: "order_updated",
        data: {
          order: {
            orderId: booking.orderId,
            quotedFareSource: "ops_manual_override",
            quotedFare: {
              currency: "NTD",
              amountMinor: 188000,
            },
          },
        },
      },
    });
  });

  it("emits order_updated when exception hold is released to dispatch", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
    const { service } = createOwnedMobilityService({
      candidates: [],
    });
    const streamPromise = firstValueFrom(
      service
        .streamOpsDispatchEvents()
        .pipe(take(3), toArray(), timeout(1_000)),
    );

    const booking = service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-04-29T12:20:00.000Z",
        reservationWindowEnd: "2026-04-29T13:00:00.000Z",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        passenger: { name: "Rider One", phone: "0912000000" },
      },
      "tenant-demo-001",
    );

    service.dispatchOrder(booking.orderId, { mode: "auto" });
    service.resolveExceptionHold(
      booking.orderId,
      {
        resolution: "release_to_dispatch",
        operatorId: "ops-user-001",
        reason: "Supply confirmed manually",
        traceId: "trace-exception-release-stream-001",
      },
      {
        actorType: "ops_user",
        actorId: "ops-user-001",
      } as never,
    );

    const events = await streamPromise;

    expect(events[2]).toMatchObject({
      type: "order_updated",
      data: {
        eventType: "order_updated",
        data: {
          order: {
            orderId: booking.orderId,
            status: "ready_for_dispatch",
            reservationHoldStatus: "requested",
          },
        },
      },
    });
  });

  it("passes pickup coordinates into candidate lookup and stores the live ETA snapshot", () => {
    const regulatoryRegistryService = {
      getEligibleCandidates: vi.fn(() => [
        {
          driverId: "driver-001",
          vehicleId: "vehicle-001",
          etaMinutes: 2,
          operatingArea: "taipei",
          serviceBuckets: ["standard_taxi"],
        },
      ]),
      getVehicleDispatchability: vi.fn(() => true),
      getDriverAvailability: vi.fn(() => true),
    };
    const auditNotificationService = {
      recordNotification: vi.fn(),
      recordAuditLog: vi.fn(),
    };
    const callcenterService = {
      registerRecordingAttachmentListener: vi.fn(),
      registerRecordingStateChangeListener: vi.fn(),
    };
    const taskEventsService = new OwnedMobilityTaskEventsService(
      new EventEmitter2(),
    );
    const opsDispatchEventsService = new OpsDispatchEventsService(
      new EventEmitter2(),
    );
    const service = new OwnedMobilityService(
      regulatoryRegistryService as never,
      auditNotificationService as never,
      callcenterService as never,
      taskEventsService,
      opsDispatchEventsService,
      undefined,
      undefined,
    );

    const order = service.createPassengerOrder({
      pickup: { address: "Pickup", lat: 25.04776, lng: 121.51706 },
      dropoff: { address: "Dropoff" },
      passenger: { name: "Rider One", phone: "0912000000" },
    });
    const dispatchJob = service.dispatchOrder(order.orderId, { mode: "auto" });
    const candidates = service.listDispatchCandidates(
      dispatchJob.dispatchJobId,
    );
    const storedDispatchJob = service.listDispatchJobs()[0];

    expect(
      regulatoryRegistryService.getEligibleCandidates,
    ).toHaveBeenNthCalledWith(1, "standard_taxi", {
      lat: 25.04776,
      lng: 121.51706,
    });
    expect(
      regulatoryRegistryService.getEligibleCandidates,
    ).toHaveBeenNthCalledWith(2, "standard_taxi", {
      lat: 25.04776,
      lng: 121.51706,
    });
    expect(storedDispatchJob?.latestEtaMinutes).toBe(2);
    expect(candidates).toEqual([
      expect.objectContaining({
        driverId: "driver-001",
        vehicleId: "vehicle-001",
        etaMinutes: 2,
      }),
    ]);
  });

  it("recomputes dispatch job ETA snapshots when the board reloads", () => {
    const regulatoryRegistryService = {
      getEligibleCandidates: vi
        .fn()
        .mockReturnValueOnce([
          {
            driverId: "driver-001",
            vehicleId: "vehicle-001",
            etaMinutes: 4,
            operatingArea: "taipei",
            serviceBuckets: ["standard_taxi"],
          },
        ])
        .mockReturnValue([
          {
            driverId: "driver-001",
            vehicleId: "vehicle-001",
            etaMinutes: 2,
            operatingArea: "taipei",
            serviceBuckets: ["standard_taxi"],
          },
        ]),
      getVehicleDispatchability: vi.fn(() => true),
      getDriverAvailability: vi.fn(() => true),
    };
    const auditNotificationService = {
      recordNotification: vi.fn(),
      recordAuditLog: vi.fn(),
    };
    const callcenterService = {
      registerRecordingAttachmentListener: vi.fn(),
      registerRecordingStateChangeListener: vi.fn(),
    };
    const taskEventsService = new OwnedMobilityTaskEventsService(
      new EventEmitter2(),
    );
    const opsDispatchEventsService = new OpsDispatchEventsService(
      new EventEmitter2(),
    );
    const service = new OwnedMobilityService(
      regulatoryRegistryService as never,
      auditNotificationService as never,
      callcenterService as never,
      taskEventsService,
      opsDispatchEventsService,
      undefined,
      undefined,
    );

    const order = service.createPassengerOrder({
      pickup: { address: "Pickup", lat: 25.04776, lng: 121.51706 },
      dropoff: { address: "Dropoff" },
      passenger: { name: "Rider One", phone: "0912000000" },
    });

    service.dispatchOrder(order.orderId, { mode: "auto" });

    expect(service.listDispatchJobs()).toEqual([
      expect.objectContaining({
        orderId: order.orderId,
        latestEtaMinutes: 2,
      }),
    ]);
    expect(
      regulatoryRegistryService.getEligibleCandidates,
    ).toHaveBeenNthCalledWith(2, "standard_taxi", {
      lat: 25.04776,
      lng: 121.51706,
    });
  });
});
