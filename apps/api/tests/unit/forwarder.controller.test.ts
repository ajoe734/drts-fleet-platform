import { describe, expect, it, vi } from "vitest";

import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { ForwarderController } from "../../src/modules/forwarder/forwarder.controller";

function driverIdentity(driverId: string): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "driver_user",
    actorId: driverId,
    realm: "driver",
    tenantId: null,
    roleFamilies: ["driver"],
    roles: ["driver"],
    scopes: [],
    requestId: null,
  };
}

function opsIdentity(): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "ops_user",
    actorId: "ops-user-001",
    realm: "ops",
    tenantId: null,
    roleFamilies: ["ops"],
    roles: ["ops"],
    scopes: [],
    requestId: null,
  };
}

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

  it("scopes the unified driver task view list to the bootstrap driver identity", () => {
    const forwarderService = {
      listDriverTaskViews: vi.fn(() => [
        {
          taskId: "task-001",
          orderId: "task-001",
          orderDomain: "forwarded",
        },
      ]),
    };
    const controller = new ForwarderController(forwarderService as never);

    const response = controller.listDriverTaskViews(
      driverIdentity("driver-001"),
      undefined,
      "req-driver-task-views-001",
    );

    expect(forwarderService.listDriverTaskViews).toHaveBeenCalledWith(
      "driver-001",
    );
    expect(response).toEqual({
      data: {
        items: [
          {
            taskId: "task-001",
            orderId: "task-001",
            orderDomain: "forwarded",
          },
        ],
      },
      meta: {
        requestId: "req-driver-task-views-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("falls back to the driverId query param when the caller is not a driver bootstrap identity", () => {
    const forwarderService = {
      listDriverTaskViews: vi.fn(() => []),
    };
    const controller = new ForwarderController(forwarderService as never);

    controller.listDriverTaskViews(
      opsIdentity(),
      "driver-supervised-002",
      "req-ops-list-001",
    );

    expect(forwarderService.listDriverTaskViews).toHaveBeenCalledWith(
      "driver-supervised-002",
    );
  });

  it("rejects unauthenticated calls with no driverId query", () => {
    const forwarderService = {
      listDriverTaskViews: vi.fn(),
    };
    const controller = new ForwarderController(forwarderService as never);

    expect(() =>
      controller.listDriverTaskViews(null, undefined, "req-anon-001"),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "DRIVER_ID_REQUIRED",
          }),
        }),
      }),
    );
    expect(forwarderService.listDriverTaskViews).not.toHaveBeenCalled();
  });

  it("scopes detail lookups to the bootstrap driver identity", () => {
    const forwarderService = {
      getDriverTaskView: vi.fn(() => ({
        taskId: "FWD-detail-001",
        orderDomain: "forwarded",
      })),
    };
    const controller = new ForwarderController(forwarderService as never);

    controller.getDriverTaskView(
      "FWD-detail-001",
      driverIdentity("driver-detail-001"),
      undefined,
      "req-driver-detail-001",
    );

    expect(forwarderService.getDriverTaskView).toHaveBeenCalledWith(
      "driver-detail-001",
      "FWD-detail-001",
    );
  });

  it("rejects detail lookups when no driver identity or query is supplied", () => {
    const forwarderService = {
      getDriverTaskView: vi.fn(),
    };
    const controller = new ForwarderController(forwarderService as never);

    expect(() =>
      controller.getDriverTaskView(
        "FWD-detail-002",
        null,
        undefined,
        "req-anon-detail-001",
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "DRIVER_ID_REQUIRED",
          }),
        }),
      }),
    );
    expect(forwarderService.getDriverTaskView).not.toHaveBeenCalled();
  });
});
