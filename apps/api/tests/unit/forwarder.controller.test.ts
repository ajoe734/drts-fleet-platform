import { describe, expect, it, vi } from "vitest";

import { ForwarderController } from "../../src/modules/forwarder/forwarder.controller";

describe("ForwarderController", () => {
  it("wraps Grab Taiwan webhook ingestion in the standard success envelope", () => {
    const forwarderService = {
      ingestGrabTaiwanWebhook: vi.fn(() => ({
        mirrorOrderId: "FWD-001",
        status: "received",
      })),
    };
    const controller = new ForwarderController(forwarderService as never);

    const response = controller.ingestGrabTaiwanWebhook(
      { orderId: "grab-order-001" },
      "req-grab-ctl-001",
    );

    expect(forwarderService.ingestGrabTaiwanWebhook).toHaveBeenCalledWith(
      { orderId: "grab-order-001" },
      "req-grab-ctl-001",
    );
    expect(response).toEqual({
      data: {
        mirrorOrderId: "FWD-001",
        status: "received",
      },
      meta: {
        requestId: "req-grab-ctl-001",
        timestamp: expect.any(String),
      },
    });
  });
});
