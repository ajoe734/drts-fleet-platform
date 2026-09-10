// SR-DISPATCH-SCHEDULER-001
// Multi-platform presence dispatch exclusion acceptance regression tests.
// Verifies:
// 1. `listEligibleDispatchCandidates` checks platform presence and excludes:
//    - Drivers marked 'busy' on another platform
//    - Drivers marked 'offline' across all platforms
//    - Drivers with expired heartbeats
// 2. `assertAssignmentEligibilityRecheck` prevents double-dispatch / invalid assignment:
//    - Throws 409 ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT when driver becomes busy/offline/heartbeat-expired before assignment commit.
// 3. Normal online drivers with active heartbeats remain eligible.

import { describe, expect, it } from "vitest";
import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { PlatformPresenceService } from "../../../../apps/api/src/modules/platform-presence/platform-presence.service";
import {
  buildOwnedMobilityServiceForTest,
  createTestPassengerOrder,
} from "../sr-qa-dispatch-001/test-support";

describe("SR-DISPATCH-SCHEDULER-001 / C041: multi-platform presence dispatch exclusion", () => {
  it("Positive: driver online with fresh heartbeat is included in eligible dispatch candidates", async () => {
    const presenceService = new PlatformPresenceService();
    await presenceService.setOnline("driver-online", "uber" as never);

    const { service } = buildOwnedMobilityServiceForTest({
      candidates: [
        {
          driverId: "driver-online",
          vehicleId: "vehicle-online",
          etaMinutes: 5,
          operatingArea: "taipei",
          serviceBuckets: ["standard_taxi"],
        },
      ],
    });
    service.setDriverAvailabilityGateway(presenceService);

    const order = createTestPassengerOrder(service);
    service.dispatchOrder(order.orderId, { mode: "auto" });
    const job = service
      .listDispatchJobs()
      .find((j) => j.orderId === order.orderId)!;

    const candidates = await service.listDispatchCandidates(job.dispatchJobId);
    expect(candidates.some((c) => c.driverId === "driver-online")).toBe(true);
  });

  it("Negative: driver busy on another platform is excluded from eligible dispatch candidates", async () => {
    const presenceService = new PlatformPresenceService();
    await presenceService.setOnline("driver-busy", "line-taxi" as never);
    await presenceService.setBusy(
      "driver-busy",
      "uber" as never,
      "active_trip_on_uber",
    );

    const { service } = buildOwnedMobilityServiceForTest({
      candidates: [
        {
          driverId: "driver-busy",
          vehicleId: "vehicle-busy",
          etaMinutes: 3,
          operatingArea: "taipei",
          serviceBuckets: ["standard_taxi"],
        },
        {
          driverId: "driver-idle",
          vehicleId: "vehicle-idle",
          etaMinutes: 7,
          operatingArea: "taipei",
          serviceBuckets: ["standard_taxi"],
        },
      ],
    });
    service.setDriverAvailabilityGateway(presenceService);

    const order = createTestPassengerOrder(service);
    service.dispatchOrder(order.orderId, { mode: "auto" });
    const job = service
      .listDispatchJobs()
      .find((j) => j.orderId === order.orderId)!;

    const candidates = await service.listDispatchCandidates(job.dispatchJobId);
    expect(candidates.some((c) => c.driverId === "driver-busy")).toBe(false);
    expect(candidates.some((c) => c.driverId === "driver-idle")).toBe(true);
  });

  it("Negative: driver offline across all platforms is excluded from eligible dispatch candidates", async () => {
    const presenceService = new PlatformPresenceService();
    await presenceService.setOffline("driver-all-offline", "uber" as never);
    await presenceService.setOffline(
      "driver-all-offline",
      "line-taxi" as never,
    );

    const { service } = buildOwnedMobilityServiceForTest({
      candidates: [
        {
          driverId: "driver-all-offline",
          vehicleId: "vehicle-offline",
          etaMinutes: 4,
          operatingArea: "taipei",
          serviceBuckets: ["standard_taxi"],
        },
      ],
    });
    service.setDriverAvailabilityGateway(presenceService);

    const order = createTestPassengerOrder(service);
    service.dispatchOrder(order.orderId, { mode: "auto" });
    const job = service
      .listDispatchJobs()
      .find((j) => j.orderId === order.orderId)!;

    const candidates = await service.listDispatchCandidates(job.dispatchJobId);
    expect(candidates.some((c) => c.driverId === "driver-all-offline")).toBe(
      false,
    );
  });

  it("Negative: driver with expired heartbeat is excluded from eligible dispatch candidates", async () => {
    const presenceService = new PlatformPresenceService();
    // Recorded 10 minutes ago (> 5m threshold)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await presenceService.setOnline(
      "driver-stale-heartbeat",
      "uber" as never,
      null,
      tenMinutesAgo,
    );

    const { service } = buildOwnedMobilityServiceForTest({
      candidates: [
        {
          driverId: "driver-stale-heartbeat",
          vehicleId: "vehicle-stale",
          etaMinutes: 6,
          operatingArea: "taipei",
          serviceBuckets: ["standard_taxi"],
        },
      ],
    });
    service.setDriverAvailabilityGateway(presenceService);

    const order = createTestPassengerOrder(service);
    service.dispatchOrder(order.orderId, { mode: "auto" });
    const job = service
      .listDispatchJobs()
      .find((j) => j.orderId === order.orderId)!;

    const candidates = await service.listDispatchCandidates(job.dispatchJobId);
    expect(
      candidates.some((c) => c.driverId === "driver-stale-heartbeat"),
    ).toBe(false);

    // Refreshing heartbeat restores eligibility
    await presenceService.recordHeartbeat(
      "driver-stale-heartbeat",
      "uber" as never,
    );
    const refreshedCandidates = await service.listDispatchCandidates(
      job.dispatchJobId,
    );
    expect(
      refreshedCandidates.some((c) => c.driverId === "driver-stale-heartbeat"),
    ).toBe(true);
  });

  it("Negative / Fence: assertAssignmentEligibilityRecheck rejects assignment when driver became busy on another platform", async () => {
    const presenceService = new PlatformPresenceService();
    await presenceService.setOnline("driver-fence-busy", "uber" as never);

    const { service } = buildOwnedMobilityServiceForTest({
      candidates: [
        {
          driverId: "driver-fence-busy",
          vehicleId: "vehicle-fence-busy",
          etaMinutes: 5,
          operatingArea: "taipei",
          serviceBuckets: ["standard_taxi"],
        },
      ],
    });
    service.setDriverAvailabilityGateway(presenceService);

    const order = createTestPassengerOrder(service);
    service.dispatchOrder(order.orderId, { mode: "auto" });
    const job = service
      .listDispatchJobs()
      .find((j) => j.orderId === order.orderId)!;

    // Driver was eligible initially, but accepts an order on Line Taxi before assignment commits
    await presenceService.setBusy(
      "driver-fence-busy",
      "line-taxi" as never,
      "took_order_on_line",
    );

    let caught: unknown;
    try {
      await service.assignDispatch({
        dispatchJobId: job.dispatchJobId,
        vehicleId: "vehicle-fence-busy",
        driverId: "driver-fence-busy",
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiRequestError);
    const apiError = caught as ApiRequestError;
    expect(apiError.getStatus()).toBe(409);
    expect(apiError.code).toBe("ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT");
    const response = apiError.getResponse() as {
      error?: { details?: Record<string, unknown> };
    };
    expect(JSON.stringify(response.error?.details)).toContain(
      "DRIVER_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT",
    );
  });

  it("Negative / Fence: assertAssignmentEligibilityRecheck rejects assignment when driver went offline right before assign", async () => {
    const presenceService = new PlatformPresenceService();
    await presenceService.setOnline("driver-fence-offline", "uber" as never);

    const { service } = buildOwnedMobilityServiceForTest({
      candidates: [
        {
          driverId: "driver-fence-offline",
          vehicleId: "vehicle-fence-offline",
          etaMinutes: 5,
          operatingArea: "taipei",
          serviceBuckets: ["standard_taxi"],
        },
      ],
    });
    service.setDriverAvailabilityGateway(presenceService);

    const order = createTestPassengerOrder(service);
    service.dispatchOrder(order.orderId, { mode: "auto" });
    const job = service
      .listDispatchJobs()
      .find((j) => j.orderId === order.orderId)!;

    // Driver goes offline right before assignment
    await presenceService.setOffline("driver-fence-offline", "uber" as never);

    let caught: unknown;
    try {
      await service.assignDispatch({
        dispatchJobId: job.dispatchJobId,
        vehicleId: "vehicle-fence-offline",
        driverId: "driver-fence-offline",
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiRequestError);
    const apiError = caught as ApiRequestError;
    expect(apiError.getStatus()).toBe(409);
    expect(apiError.code).toBe("ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT");
  });

  it("Negative / Fence: assertAssignmentEligibilityRecheck rejects reassign to a busy driver", async () => {
    const presenceService = new PlatformPresenceService();
    await presenceService.setOnline("driver-initial", "uber" as never);
    await presenceService.setOnline("driver-busy-target", "uber" as never);
    await presenceService.setBusy("driver-busy-target", "line-taxi" as never);

    const { service } = buildOwnedMobilityServiceForTest({
      candidates: [
        {
          driverId: "driver-initial",
          vehicleId: "vehicle-initial",
          etaMinutes: 5,
          operatingArea: "taipei",
          serviceBuckets: ["standard_taxi"],
        },
        {
          driverId: "driver-busy-target",
          vehicleId: "vehicle-busy-target",
          etaMinutes: 3,
          operatingArea: "taipei",
          serviceBuckets: ["standard_taxi"],
        },
      ],
    });
    service.setDriverAvailabilityGateway(presenceService);

    const order = createTestPassengerOrder(service);
    service.dispatchOrder(order.orderId, { mode: "auto" });
    const job = service
      .listDispatchJobs()
      .find((j) => j.orderId === order.orderId)!;

    // Assign initial driver
    await service.assignDispatch({
      dispatchJobId: job.dispatchJobId,
      vehicleId: "vehicle-initial",
      driverId: "driver-initial",
    });

    // Reassigning to driver-busy-target must fail at eligibility check
    let caught: unknown;
    try {
      await service.reassignDispatch({
        dispatchJobId: job.dispatchJobId,
        vehicleId: "vehicle-busy-target",
        driverId: "driver-busy-target",
        reasonCode: "passenger_requested",
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiRequestError);
    const apiError = caught as ApiRequestError;
    expect(apiError.getStatus()).toBe(409);
    expect(apiError.code).toBe("ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT");
  });
});
