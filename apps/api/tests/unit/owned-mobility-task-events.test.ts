import { EventEmitter } from "node:events";

import { EventEmitter2 } from "@nestjs/event-emitter";
import { firstValueFrom, take, timeout, toArray } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { resolveRouteAuthPolicy } from "../../src/common/auth";
import { DatabaseService } from "../../src/common/db";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";

class FakePgClient extends EventEmitter {
  readonly query = vi.fn(async () => ({ rows: [] }));
  readonly release = vi.fn();
}

function createOwnedMobilityService() {
  const regulatoryRegistryService = {
    getEligibleCandidates: vi.fn(() => [
      {
        driverId: "driver-001",
        vehicleId: "vehicle-001",
        etaMinutes: 4,
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

  it("bridges driver task events through the Postgres notification bus when enabled", async () => {
    const notificationClient = new FakePgClient();
    const databaseService = {
      isEnabled: vi.fn(() => true),
      connect: vi.fn(async () => notificationClient),
      query: vi.fn(async () => ({ rows: [] })),
    } as unknown as DatabaseService;
    const regulatoryRegistryService = {
      getEligibleCandidates: vi.fn(() => [
        {
          driverId: "driver-001",
          vehicleId: "vehicle-001",
          etaMinutes: 4,
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
    };
    const taskEventsService = new OwnedMobilityTaskEventsService(
      new EventEmitter2(),
      databaseService,
    );
    await taskEventsService.onModuleInit();
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

    const notifyCall = vi
      .mocked(databaseService.query)
      .mock.calls.find(([query]) => String(query).includes("pg_notify"));
    expect(notifyCall).toBeDefined();
    expect(vi.mocked(databaseService.connect)).toHaveBeenCalledTimes(1);
    expect(notificationClient.query).toHaveBeenCalledWith(
      "LISTEN owned_mobility_driver_task_events",
    );

    const payload = notifyCall?.[1]?.[1];
    notificationClient.emit("notification", {
      channel: "owned_mobility_driver_task_events",
      payload,
      processId: 1,
    });

    const event = await streamPromise;

    expect(event.type).toBe("task_assigned");
    expect(event.data).toMatchObject({
      eventType: "task_assigned",
      data: {
        task: {
          driverId: "driver-001",
          status: "pending_acceptance",
        },
      },
    });

    await taskEventsService.onModuleDestroy();

    expect(notificationClient.query).toHaveBeenCalledWith(
      "UNLISTEN owned_mobility_driver_task_events",
    );
    expect(notificationClient.release).toHaveBeenCalledTimes(1);
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
