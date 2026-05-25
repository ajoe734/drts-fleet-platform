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
  it("wraps forwarded queue read models in the standard success envelope", () => {
    const forwarderService = {
      listOrdersReadModel: vi.fn(() => ({
        items: [
          {
            mirrorOrderId: "FWD-queue-001",
            availableActions: [
              {
                action: "reconcile",
                enabled: true,
                riskLevel: "medium",
              },
            ],
          },
        ],
        refresh: {
          generatedAt: "2026-05-25T11:20:00.000Z",
          staleAfterMs: 5000,
          dataFreshness: "fresh",
          source: "live",
        },
      })),
    };
    const controller = new ForwarderController(forwarderService as never);

    const response = controller.listForwardedOrders("req-forwarded-list-001");

    expect(forwarderService.listOrdersReadModel).toHaveBeenCalledWith();
    expect(response).toEqual({
      data: {
        items: [
          {
            mirrorOrderId: "FWD-queue-001",
            availableActions: [
              {
                action: "reconcile",
                enabled: true,
                riskLevel: "medium",
              },
            ],
          },
        ],
        refresh: {
          generatedAt: "2026-05-25T11:20:00.000Z",
          staleAfterMs: 5000,
          dataFreshness: "fresh",
          source: "live",
        },
      },
      meta: {
        requestId: "req-forwarded-list-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("wraps Grab Taiwan webhook ingestion in the standard success envelope", async () => {
    const forwarderService = {
      ingestGrabTaiwanWebhook: vi.fn(async () => ({
        mirrorOrderId: "FWD-001",
        status: "received",
      })),
    };
    const controller = new ForwarderController(forwarderService as never);

    const response = await controller.ingestGrabTaiwanWebhook(
      { orderId: "grab-order-001" },
      {
        "x-grab-signature": "stub-signature",
        "x-request-id": "req-grab-ctl-001",
      },
      "req-grab-ctl-001",
    );

    expect(forwarderService.ingestGrabTaiwanWebhook).toHaveBeenCalledWith(
      { orderId: "grab-order-001" },
      {
        "x-grab-signature": "stub-signature",
        "x-request-id": "req-grab-ctl-001",
      },
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

  it("wraps driver-safe forwarded accept responses and scopes them to the bootstrap driver identity", async () => {
    const forwarderService = {
      acceptForwardedOrder: vi.fn(async () => ({
        action: "accept",
        outcome: "accept_pending",
        driverMessage: "Waiting for platform confirmation.",
        taskView: {
          taskId: "FWD-accept-001",
          orderDomain: "forwarded",
          allowedActions: [],
        },
        managementCorrelationIds: {
          mirrorOrderId: "FWD-accept-001",
          reconciliationJobId: null,
        },
      })),
    };
    const controller = new ForwarderController(forwarderService as never);

    const response = await controller.acceptForwardedOrder(
      "FWD-accept-001",
      driverIdentity("driver-accept-001"),
      { driverId: "driver-spoofed-999" },
      "req-driver-accept-001",
    );

    expect(forwarderService.acceptForwardedOrder).toHaveBeenCalledWith(
      "FWD-accept-001",
      "driver-accept-001",
      "req-driver-accept-001",
    );
    expect(response).toEqual({
      data: {
        action: "accept",
        outcome: "accept_pending",
        driverMessage: "Waiting for platform confirmation.",
        taskView: {
          taskId: "FWD-accept-001",
          orderDomain: "forwarded",
          allowedActions: [],
        },
        managementCorrelationIds: {
          mirrorOrderId: "FWD-accept-001",
          reconciliationJobId: null,
        },
      },
      meta: {
        requestId: "req-driver-accept-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("wraps driver-safe forwarded reject responses using the explicit driverId for non-driver callers", () => {
    const forwarderService = {
      rejectForwardedOrder: vi.fn(() => ({
        action: "reject",
        outcome: "rejected",
        driverMessage: "Offer declined.",
        taskView: null,
        managementCorrelationIds: {
          mirrorOrderId: "FWD-reject-001",
          reconciliationJobId: null,
        },
      })),
    };
    const controller = new ForwarderController(forwarderService as never);

    const response = controller.rejectForwardedOrder(
      "FWD-reject-001",
      opsIdentity(),
      {
        driverId: "driver-reject-001",
        reason: "Too far away",
      },
      "req-driver-reject-001",
    );

    expect(forwarderService.rejectForwardedOrder).toHaveBeenCalledWith(
      "FWD-reject-001",
      "driver-reject-001",
      "Too far away",
      "req-driver-reject-001",
    );
    expect(response).toEqual({
      data: {
        action: "reject",
        outcome: "rejected",
        driverMessage: "Offer declined.",
        taskView: null,
        managementCorrelationIds: {
          mirrorOrderId: "FWD-reject-001",
          reconciliationJobId: null,
        },
      },
      meta: {
        requestId: "req-driver-reject-001",
        timestamp: expect.any(String),
      },
    });
  });
});
