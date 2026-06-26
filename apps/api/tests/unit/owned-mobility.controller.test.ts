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

  it("returns tenant sandbox fulfillment projections via the tenant booking route", () => {
    const service = {
      getTenantSandboxFulfillment: vi.fn().mockReturnValue({
        bookingId: "booking-e2e-001",
        orderId: "order-e2e-001",
        audience: "tenant",
        fulfillmentMode: "tesla_av",
        state: "assigned",
        statusCode: "assigned",
        messages: [{ messageCode: "sandbox_fulfillment.tesla_av_active", category: "info" }],
        etaMinutes: 6,
        extraChargeDisclosed: false,
        providerBrandDisclosed: false,
        sandboxTripId: "assignment-e2e-001",
        updatedAt: "2026-06-26T06:00:00.000Z",
      }),
    } as unknown as OwnedMobilityService;
    const controller = new OwnedMobilityController(service);

    const response = controller.getTenantSandboxFulfillment(
      "booking-e2e-001",
      "tenant-e2e-001",
      "req-e2e-tenant-sfv",
    );

    expect(response.data).toMatchObject({
      bookingId: "booking-e2e-001",
      audience: "tenant",
      messages: [
        {
          messageCode: "sandbox_fulfillment.tesla_av_active",
        },
      ],
    });
    expect(service.getTenantSandboxFulfillment).toHaveBeenCalledWith(
      "tenant-e2e-001",
      "booking-e2e-001",
    );
  });

  it("returns partner sandbox fulfillment projections via the partner booking route", () => {
    const service = {
      getPartnerSandboxFulfillment: vi.fn().mockReturnValue({
        bookingId: "booking-e2e-002",
        orderId: "order-e2e-002",
        audience: "partner",
        fulfillmentMode: "human_fallback",
        state: "en_route_pickup",
        statusCode: "assigned",
        messages: [
          {
            messageCode: "sandbox_fulfillment.human_fallback_active",
            category: "warning",
          },
        ],
        etaMinutes: 9,
        extraChargeDisclosed: false,
        providerBrandDisclosed: true,
        sandboxTripId: "assignment-e2e-002",
        updatedAt: "2026-06-26T06:05:00.000Z",
      }),
    } as unknown as OwnedMobilityService;
    const controller = new OwnedMobilityController(service);

    const response = controller.getPartnerSandboxFulfillment(
      "booking-e2e-002",
      {
        partnerEntrySlug: "partner-entry-001",
      } as never,
      "req-e2e-partner-sfv",
    );

    expect(response.data).toMatchObject({
      bookingId: "booking-e2e-002",
      audience: "partner",
      providerBrandDisclosed: true,
    });
    expect(service.getPartnerSandboxFulfillment).toHaveBeenCalledWith(
      "partner-entry-001",
      "booking-e2e-002",
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
