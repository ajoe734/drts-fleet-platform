import {
  PHASE1_SERVICE_BUCKETS,
  SERVICE_BUCKETS,
} from "../../packages/contracts/src/index";
import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";

describe("phase1 foundation contracts", () => {
  it("keeps only two formal service buckets enabled in phase 1", () => {
    expect(PHASE1_SERVICE_BUCKETS).toEqual([
      "standard_taxi",
      "business_dispatch",
    ]);
    expect(SERVICE_BUCKETS).toContain("av_pilot");
    expect(PHASE1_SERVICE_BUCKETS).not.toContain("av_pilot");
  });
});

describe("audit notification foundation service", () => {
  it("marks notifications as read and appends a new audit log", () => {
    const service = new AuditNotificationService();
    const initialNotifications = service.listNotifications();
    const initialAuditLogs = service.listAuditLogs();
    const unreadNotification = initialNotifications.find(
      (notification) => notification.readAt === null,
    );

    expect(unreadNotification).toBeDefined();

    const result = service.markNotificationsRead(
      {
        notificationIds: [unreadNotification!.notificationId],
      },
      "test-request-id",
    );

    const updatedNotifications = service.listNotifications();
    const updatedAuditLogs = service.listAuditLogs();

    expect(result.updated).toBe(1);
    expect(
      updatedNotifications.find(
        (notification) =>
          notification.notificationId === unreadNotification!.notificationId,
      )?.readAt,
    ).not.toBeNull();
    expect(updatedAuditLogs).toHaveLength(initialAuditLogs.length + 1);
    expect(updatedAuditLogs[0]?.actionName).toBe("mark_notifications_read");
    expect(updatedAuditLogs[0]?.requestId).toBe("test-request-id");
  });

  it("does not mutate the audit log when no new notification is updated", () => {
    const service = new AuditNotificationService();
    const initialAuditLogs = service.listAuditLogs();

    const result = service.markNotificationsRead(
      {
        notificationIds: ["missing-notification-id"],
      },
      "test-request-id",
    );

    expect(result.updated).toBe(0);
    expect(service.listAuditLogs()).toHaveLength(initialAuditLogs.length);
  });
});
