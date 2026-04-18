import {
  FORWARDER_ROUTING_SERVICE_BUCKETS,
  PHASE1_SERVICE_BUCKETS,
  PLATFORM_CODES,
  PLATFORM_CODE_GRAB,
  PLATFORM_CODE_GRAB_TAIWAN,
  PLATFORM_CODE_INDRIVER,
  PLATFORM_CODE_LINE_TAXI,
  PLATFORM_CODE_REGISTRY,
  PLATFORM_CODE_UBER,
  SERVICE_BUCKETS,
  SERVICE_BUCKET_CATALOGS,
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
    expect(FORWARDER_ROUTING_SERVICE_BUCKETS).toEqual(SERVICE_BUCKETS);
    expect(SERVICE_BUCKET_CATALOGS.phase1).toEqual(PHASE1_SERVICE_BUCKETS);
    expect(SERVICE_BUCKET_CATALOGS.routing).toEqual(
      FORWARDER_ROUTING_SERVICE_BUCKETS,
    );
  });

  it("keeps platform codes in a shared contracts registry", () => {
    expect(PLATFORM_CODES).toEqual([
      PLATFORM_CODE_UBER,
      PLATFORM_CODE_GRAB,
      PLATFORM_CODE_LINE_TAXI,
      PLATFORM_CODE_GRAB_TAIWAN,
      PLATFORM_CODE_INDRIVER,
    ]);
    expect(PLATFORM_CODE_REGISTRY[PLATFORM_CODE_GRAB_TAIWAN]).toMatchObject({
      code: PLATFORM_CODE_GRAB_TAIWAN,
      status: "forwarder_stub",
      forwarderAdapterKey: PLATFORM_CODE_GRAB_TAIWAN,
    });
    expect(PLATFORM_CODE_REGISTRY[PLATFORM_CODE_INDRIVER]).toMatchObject({
      code: PLATFORM_CODE_INDRIVER,
      status: "catalog_only",
      forwarderAdapterKey: null,
    });
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
