import { describe, expect, it } from "vitest";

import type { IdentityContext } from "@drts/contracts";

import { NotificationService } from "../../src/modules/notification/notification.service";

const PLATFORM_IDENTITY: IdentityContext = {
  actorType: "platform_admin",
  actorId: "platform-admin-001",
  realm: "platform",
  scopes: ["notifications:read", "notifications:write"],
  tenantId: null,
};

const OPS_IDENTITY: IdentityContext = {
  actorType: "ops_user",
  actorId: "ops-user-001",
  realm: "ops",
  scopes: ["notifications:read", "notifications:write"],
  tenantId: null,
};

const TENANT_IDENTITY: IdentityContext = {
  actorType: "tenant_admin",
  actorId: "tenant-user-demo-001",
  realm: "tenant",
  scopes: ["notifications:read", "notifications:write"],
  tenantId: "tenant-demo-001",
};

const DRIVER_IDENTITY: IdentityContext = {
  actorType: "driver_user",
  actorId: "driver-user-demo-001",
  realm: "driver",
  scopes: ["notifications:read", "notifications:write"],
  tenantId: "tenant-demo-001",
};

describe("NotificationService", () => {
  it("filters inbox items by recipient realm and tenant scope", () => {
    const service = new NotificationService();

    expect(
      service
        .listNotifications(PLATFORM_IDENTITY)
        .map((item) => item.eventType),
    ).toEqual(["tenant.rollout_gate.ready"]);
    expect(
      service.listNotifications(OPS_IDENTITY).map((item) => item.eventType),
    ).toEqual(["incident.critical.created"]);
    expect(
      service.listNotifications(TENANT_IDENTITY).map((item) => item.eventType),
    ).toEqual(["booking.confirmed"]);
    expect(
      service.listNotifications(DRIVER_IDENTITY).map((item) => item.eventType),
    ).toEqual(["driver.shift.end_reminder"]);
  });

  it("marks only accessible notifications as read via single and bulk endpoints", () => {
    const service = new NotificationService();

    service.emit({
      recipientActorId: "tenant-user-demo-001",
      recipientRealm: "tenant",
      tenantId: "tenant-demo-001",
      severity: "warning",
      eventType: "quota.threshold_warning",
      title: "Quota threshold warning",
      message: "Tenant quota usage is over 90%.",
      createdAt: "2026-05-25T01:00:00.000Z",
    });

    service.emit({
      recipientActorId: "tenant-user-other-001",
      recipientRealm: "tenant",
      tenantId: "tenant-other-001",
      severity: "info",
      eventType: "booking.created",
      title: "Other tenant booking",
      message: "This should stay hidden.",
      createdAt: "2026-05-25T01:01:00.000Z",
    });

    const visibleIds = service
      .listNotifications(TENANT_IDENTITY)
      .map((item) => item.notificationId);

    expect(
      service.markNotificationRead(visibleIds[0]!, TENANT_IDENTITY),
    ).toEqual({
      updated: 1,
    });
    expect(
      service.markNotificationsRead(visibleIds.slice(1), TENANT_IDENTITY),
    ).toEqual({
      updated: 1,
    });

    const unreadVisible = service
      .listNotifications(TENANT_IDENTITY)
      .filter((item) => item.readAt === null);
    expect(unreadVisible).toHaveLength(0);
    expect(
      service.getSnapshot().find((item) => item.tenantId === "tenant-other-001")
        ?.readAt,
    ).toBeNull();
  });
});
