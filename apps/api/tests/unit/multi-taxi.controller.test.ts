import { describe, expect, it, vi } from "vitest";

import { MultiTaxiController } from "../../src/modules/multi-taxi/multi-taxi.controller";
import type { MultiTaxiService } from "../../src/modules/multi-taxi/multi-taxi.service";

describe("MultiTaxiController ride intake", () => {
  it("awaits passenger ride creation before wrapping the API envelope", async () => {
    const result = {
      ride: { orderId: "order-001", orderNo: "MTX-001" },
      passengerAccess: {
        tokenId: "token-001",
        accessToken: "opaque-access-token",
      },
    };
    const service = {
      createRide: vi.fn().mockResolvedValue(result),
    } as unknown as MultiTaxiService;
    const controller = new MultiTaxiController(service);

    const response = await controller.createRide(
      {} as never,
      null,
      "req-create-001",
    );

    expect(response.data).toEqual(result);
    expect(response.data).not.toBeInstanceOf(Promise);
    expect(service.createRide).toHaveBeenCalledWith({}, null, "req-create-001");
  });

  it("awaits call-center ride creation before wrapping the API envelope", async () => {
    const result = {
      ride: { orderId: "order-002", orderNo: "MTX-002" },
      passengerAccess: {
        tokenId: "token-002",
        accessToken: "opaque-call-center-token",
      },
    };
    const service = {
      createCallCenterRide: vi.fn().mockResolvedValue(result),
    } as unknown as MultiTaxiService;
    const controller = new MultiTaxiController(service);

    const response = await controller.createCallCenterRide(
      {} as never,
      "req-create-002",
    );

    expect(response.data).toEqual(result);
    expect(response.data).not.toBeInstanceOf(Promise);
    expect(service.createCallCenterRide).toHaveBeenCalledWith(
      {},
      "req-create-002",
    );
  });
});
