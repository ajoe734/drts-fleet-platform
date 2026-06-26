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
import { SandboxDispatchGateService } from "../../src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.service";
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
  const sandboxDispatchGateService = {
    shouldEvaluateSandboxAssignment: () => true,
    buildAssignmentGateInput: ({
      orderId,
      dispatchJobId,
      vehicleId,
    }: {
      orderId: string;
      dispatchJobId: string;
      vehicleId: string;
    }) => ({
      orderId,
      dispatchJobId,
      vehicleId,
      sandboxProgramId: "phase2-tesla-fsd-sandbox-202606",
      policyVersion: "sandbox-dispatch-gate.v1",
    }),
    assertAssignmentEligible: () => {
      throw new ApiRequestError(
        409,
        "SANDBOX_REGULATORY_APPROVAL_MISSING",
        "Sandbox dispatch gate did not approve this assignment.",
      );
    },
  } as unknown as SandboxDispatchGateService;
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
    undefined,
    undefined,
    sandboxDispatchGateService,
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

describe("INT-P2-002 sandbox dispatch hook", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("fails closed before assignment when an AV candidate lacks sandbox evidence", async () => {
    const { ownedMobilityService, regulatoryRegistryService, cleanup } =
      createHarness();
    cleanups.push(cleanup);

    const booking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-06-26T14:00:00.000Z",
        reservationWindowEnd: "2026-06-26T15:00:00.000Z",
        pickup: { address: "Taipei 101", lat: 25.0338, lng: 121.5646 },
        dropoff: { address: "Taipei Main Station", lat: 25.0478, lng: 121.5170 },
        passenger: { name: "Rider One", phone: "0912000000" },
      },
      "tenant-demo-001",
    );
    const dispatchResult = ownedMobilityService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });

    expect(() =>
      ownedMobilityService.assignDispatch({
        dispatchJobId: dispatchResult.dispatchJobId,
        vehicleId: "veh-demo-001",
        driverId: "drv-demo-001",
      }),
    ).toThrowError(ApiRequestError);

    try {
      await ownedMobilityService.assignDispatch({
        dispatchJobId: dispatchResult.dispatchJobId,
        vehicleId: "veh-demo-001",
        driverId: "drv-demo-001",
      });
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "SANDBOX_REGULATORY_APPROVAL_MISSING",
        },
      });
    }
  });
});
