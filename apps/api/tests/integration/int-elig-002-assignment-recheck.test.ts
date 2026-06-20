import { afterEach, describe, expect, it } from "vitest";

import { EventEmitter2 } from "@nestjs/event-emitter";

import { ApiRequestError } from "../../src/common/api-envelope";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../src/modules/callcenter/callcenter.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";
import { ServiceProductService } from "../../src/modules/service-product/service-product.service";
import { VehicleEligibilityService } from "../../src/modules/vehicle-eligibility/vehicle-eligibility.service";

function createHarness() {
  const eventEmitter = new EventEmitter2();
  const auditNotificationService = new AuditNotificationService();
  const opsDispatchEventsService = new OpsDispatchEventsService(eventEmitter);
  const driverProfileService = new DriverProfileService(auditNotificationService);
  const regulatoryRegistryRepository = {
    isEnabled: () => true,
    upsertDriverLocation: async () => true,
  };
  const regulatoryRegistryService = new RegulatoryRegistryService(
    opsDispatchEventsService,
    auditNotificationService,
    driverProfileService,
    regulatoryRegistryRepository as never,
  );
  const callcenterService = new CallcenterService(auditNotificationService);
  const taskEventsService = new OwnedMobilityTaskEventsService(eventEmitter);
  const serviceProductService = new ServiceProductService(
    auditNotificationService,
    undefined,
  );
  const vehicleEligibilityService = new VehicleEligibilityService(
    regulatoryRegistryService,
    auditNotificationService,
    undefined,
    serviceProductService,
  );
  const ownedMobilityService = new OwnedMobilityService(
    regulatoryRegistryService,
    auditNotificationService,
    callcenterService,
    taskEventsService,
    opsDispatchEventsService,
    undefined,
    undefined,
    vehicleEligibilityService,
    serviceProductService,
  );

  return {
    ownedMobilityService,
    regulatoryRegistryService,
    cleanup: async () => {
      await taskEventsService.onModuleDestroy();
      await opsDispatchEventsService.onModuleDestroy();
    },
  };
}

describe("INT-ELIG-002 assignment rechecks", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("409s when eligibility changes before assignment and preserves exact product on success", async () => {
    const { ownedMobilityService, regulatoryRegistryService, cleanup } =
      createHarness();
    cleanups.push(cleanup);

    const booking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "credit_card_airport_transfer",
        reservationWindowStart: "2026-06-20T14:00:00.000Z",
        reservationWindowEnd: "2026-06-20T15:00:00.000Z",
        pickup: { address: "Taoyuan Airport" },
        dropoff: { address: "Taipei Main Station" },
        passenger: { name: "Rider One", phone: "0912000000" },
      },
      "tenant-demo-001",
    );
    const dispatchResult = ownedMobilityService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });

    const originalDispatchability =
      regulatoryRegistryService.getVehicleDispatchability.bind(
        regulatoryRegistryService,
      );
    regulatoryRegistryService.getVehicleDispatchability = ((vehicleId, bucket) =>
      vehicleId === "veh-demo-001"
        ? false
        : originalDispatchability(vehicleId, bucket)) as never;

    expect(() =>
      ownedMobilityService.assignDispatch({
        dispatchJobId: dispatchResult.dispatchJobId,
        vehicleId: "veh-demo-001",
        driverId: "drv-demo-001",
      }),
    ).toThrowError(ApiRequestError);

    try {
      ownedMobilityService.assignDispatch({
        dispatchJobId: dispatchResult.dispatchJobId,
        vehicleId: "veh-demo-001",
        driverId: "drv-demo-001",
      });
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT",
          details: {
            dispatchJobId: dispatchResult.dispatchJobId,
            serviceProductCode: "credit_card_airport_transfer",
            reasonCodes: ["VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT"],
          },
        },
      });
    }

    regulatoryRegistryService.getVehicleDispatchability =
      originalDispatchability as never;
    const assignment = ownedMobilityService.assignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: "veh-demo-001",
      driverId: "drv-demo-001",
    });
    expect(ownedMobilityService.getDriverTask(assignment.taskId)).toMatchObject({
      taskId: assignment.taskId,
      serviceProductCode: "credit_card_airport_transfer",
    });
  });
});
