import { describe, expect, it, vi } from "vitest";

import { NotificationsController } from "../../src/modules/audit-notification/notifications.controller";

describe("NotificationsController", () => {
  it("wraps archive responses in the standard success envelope", () => {
    const auditNotificationService = {
      archiveNotifications: vi.fn(() => ({ updated: 2 })),
      getNotificationSummary: vi.fn(),
      listNotifications: vi.fn(),
      markNotificationsRead: vi.fn(),
    };
    const controller = new NotificationsController(
      auditNotificationService as never,
    );

    const response = controller.archiveNotifications(
      { ids: ["notif-001", "notif-002"] },
      "req-notif-archive-001",
    );

    expect(auditNotificationService.archiveNotifications).toHaveBeenCalledWith(
      { ids: ["notif-001", "notif-002"] },
      "req-notif-archive-001",
    );
    expect(response).toEqual({
      data: {
        updated: 2,
      },
      meta: {
        requestId: "req-notif-archive-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("wraps notification summary responses in the standard success envelope", () => {
    const auditNotificationService = {
      archiveNotifications: vi.fn(),
      getNotificationSummary: vi.fn(() => ({
        unreadTotal: 3,
        unreadBySeverity: {
          info: 1,
          warning: 1,
          critical: 1,
        },
        unreadByChannel: {
          ops_notice: 1,
          tenant_sla: 1,
          platform_admin: 1,
        },
      })),
      listNotifications: vi.fn(),
      markNotificationsRead: vi.fn(),
    };
    const controller = new NotificationsController(
      auditNotificationService as never,
    );

    const response = controller.getNotificationSummary("req-notif-summary-001");

    expect(auditNotificationService.getNotificationSummary).toHaveBeenCalled();
    expect(response).toEqual({
      data: {
        unreadTotal: 3,
        unreadBySeverity: {
          info: 1,
          warning: 1,
          critical: 1,
        },
        unreadByChannel: {
          ops_notice: 1,
          tenant_sla: 1,
          platform_admin: 1,
        },
      },
      meta: {
        requestId: "req-notif-summary-001",
        timestamp: expect.any(String),
      },
    });
  });
});
