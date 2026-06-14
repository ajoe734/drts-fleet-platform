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
});
