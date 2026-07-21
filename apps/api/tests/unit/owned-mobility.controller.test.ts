import { describe, expect, it, vi } from "vitest";

import { OwnedMobilityController } from "../../src/modules/owned-mobility/owned-mobility.controller";
import type { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";

describe("OwnedMobilityController tenant booking routes", () => {
  it("awaits tenant booking creation before wrapping the API envelope", async () => {
    const service = {
      createTenantBooking: vi.fn().mockResolvedValue({
        orderId: "order-e2e-001",
        bookingId: "booking-e2e-001",
        serviceBucket: "business_dispatch",
        businessDispatchSubtype: "enterprise_dispatch",
        dispatchSemantics: "reservation",
        status: "created",
      }),
    } as unknown as OwnedMobilityService;
    const controller = new OwnedMobilityController(service);

    const response = await controller.createTenantBooking(
      {} as never,
      null,
      "tenant-e2e-001",
      "req-e2e-create",
    );

    expect(response.data).toMatchObject({
      orderId: "order-e2e-001",
      bookingId: "booking-e2e-001",
      status: "created",
    });
    expect(service.createTenantBooking).toHaveBeenCalledWith(
      {},
      "tenant-e2e-001",
      null,
      "req-e2e-create",
      undefined,
    );
  });

  it("awaits tenant booking updates before wrapping the API envelope", async () => {
    const service = {
      updateTenantBooking: vi.fn().mockResolvedValue({
        orderId: "order-e2e-001",
        bookingId: "booking-e2e-001",
        status: "approval_required",
      }),
    } as unknown as OwnedMobilityService;
    const controller = new OwnedMobilityController(service);

    const response = await controller.updateTenantBooking(
      "booking-e2e-001",
      {} as never,
      null,
      "tenant-e2e-001",
      "req-e2e-update",
    );

    expect(response.data).toMatchObject({
      orderId: "order-e2e-001",
      bookingId: "booking-e2e-001",
      status: "approval_required",
    });
    expect(service.updateTenantBooking).toHaveBeenCalledWith(
      "tenant-e2e-001",
      "booking-e2e-001",
      {},
      null,
      "req-e2e-update",
    );
  });

  it("passes includeIneligible through candidate queries before wrapping the API envelope", async () => {
    const service = {
      listDispatchCandidates: vi.fn().mockResolvedValue([
        {
          driverId: "drv-demo-001",
          vehicleId: "veh-demo-001",
          etaMinutes: 5,
          operatingArea: "taipei",
          serviceBuckets: ["business_dispatch"],
          eligibilityDecision: "ineligible",
        },
      ]),
    } as unknown as OwnedMobilityService;
    const controller = new OwnedMobilityController(service);

    const response = await controller.listDispatchCandidates(
      "job-e2e-001",
      "true",
      "req-e2e-candidates",
    );

    expect(response.data.items).toEqual([
      expect.objectContaining({
        driverId: "drv-demo-001",
        eligibilityDecision: "ineligible",
      }),
    ]);
    expect(service.listDispatchCandidates).toHaveBeenCalledWith(
      "job-e2e-001",
      true,
    );
  });

  it("awaits dispatch assignment before wrapping the API envelope", async () => {
    const service = {
      assignDispatch: vi.fn().mockResolvedValue({
        assignmentId: "assignment-e2e-001",
        status: "assigned",
        taskId: "task-e2e-001",
      }),
    } as unknown as OwnedMobilityService;
    const controller = new OwnedMobilityController(service);

    const response = await controller.assignDispatch(
      {} as never,
      "req-e2e-assign",
    );

    expect(response.data).toMatchObject({
      assignmentId: "assignment-e2e-001",
      status: "assigned",
      taskId: "task-e2e-001",
    });
    expect(service.assignDispatch).toHaveBeenCalledWith(
      {},
      "req-e2e-assign",
    );
  });

  it("awaits dispatch reassignment before wrapping the API envelope", async () => {
    const service = {
      reassignDispatch: vi.fn().mockResolvedValue({
        assignmentId: "assignment-e2e-002",
        status: "assigned",
        taskId: "task-e2e-002",
      }),
    } as unknown as OwnedMobilityService;
    const controller = new OwnedMobilityController(service);

    const response = await controller.reassignDispatch(
      {} as never,
      "req-e2e-reassign",
    );

    expect(response.data).toMatchObject({
      assignmentId: "assignment-e2e-002",
      status: "assigned",
      taskId: "task-e2e-002",
    });
    expect(service.reassignDispatch).toHaveBeenCalledWith(
      {},
      "req-e2e-reassign",
    );
  });
});
