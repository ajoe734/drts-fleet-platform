import { describe, expect, it, vi } from "vitest";

import type { IdentityContext } from "@drts/contracts";

import { NotificationsController } from "../../src/modules/notification/notifications.controller";

const TENANT_IDENTITY: IdentityContext = {
  actorType: "tenant_admin",
  actorId: "tenant-user-demo-001",
  realm: "tenant",
  scopes: ["notifications:read", "notifications:write"],
  tenantId: "tenant-demo-001",
};

describe("NotificationsController", () => {
  it("wraps list responses in the standard success envelope", () => {
    const notificationService = {
      listNotifications: vi.fn(() => [
        {
          notificationId: "notif-001",
          eventType: "booking.confirmed",
        },
      ]),
    };
    const controller = new NotificationsController(
      notificationService as never,
    );

    const response = controller.listNotifications(
      TENANT_IDENTITY,
      "req-notif-list-001",
    );

    expect(notificationService.listNotifications).toHaveBeenCalledWith(
      TENANT_IDENTITY,
    );
    expect(response).toEqual({
      data: {
        items: [
          {
            notificationId: "notif-001",
            eventType: "booking.confirmed",
          },
        ],
      },
      meta: {
        requestId: "req-notif-list-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("passes single-record read requests through to the notification service", () => {
    const notificationService = {
      markNotificationRead: vi.fn(() => ({ updated: 1 })),
    };
    const controller = new NotificationsController(
      notificationService as never,
    );

    const response = controller.markNotificationRead(
      "notif-read-001",
      TENANT_IDENTITY,
      "req-notif-read-001",
    );

    expect(notificationService.markNotificationRead).toHaveBeenCalledWith(
      "notif-read-001",
      TENANT_IDENTITY,
    );
    expect(response).toEqual({
      data: { updated: 1 },
      meta: {
        requestId: "req-notif-read-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("passes bulk read requests through to the notification service", () => {
    const notificationService = {
      markNotificationsRead: vi.fn(() => ({ updated: 2 })),
    };
    const controller = new NotificationsController(
      notificationService as never,
    );

    const response = controller.markNotificationsReadBulk(
      { notificationIds: ["notif-001", "notif-002"] },
      TENANT_IDENTITY,
      "req-notif-bulk-001",
    );

    expect(notificationService.markNotificationsRead).toHaveBeenCalledWith(
      ["notif-001", "notif-002"],
      TENANT_IDENTITY,
    );
    expect(response).toEqual({
      data: { updated: 2 },
      meta: {
        requestId: "req-notif-bulk-001",
        timestamp: expect.any(String),
      },
    });
  });
});
