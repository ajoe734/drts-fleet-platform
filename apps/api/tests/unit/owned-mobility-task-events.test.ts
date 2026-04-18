import { EventEmitter2 } from "@nestjs/event-emitter";
import { firstValueFrom, take, timeout } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { resolveRouteAuthPolicy } from "../../src/common/auth";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";

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

  const service = new OwnedMobilityService(
    regulatoryRegistryService as never,
    auditNotificationService as never,
    callcenterService as never,
    taskEventsService,
    undefined,
    undefined,
  );

  return {
    service,
    taskEventsService,
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
    const service = new OwnedMobilityService(
      regulatoryRegistryService as never,
      auditNotificationService as never,
      callcenterService as never,
      taskEventsService,
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
});
