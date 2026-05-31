import { randomUUID } from "node:crypto";

import { Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  CrossAppResourceLink,
  IdentityContext,
  UiActorRealm,
  UiSeverity,
  UserNotificationRecord,
} from "@drts/contracts";
import { NotificationRepository } from "./notification.repository";

const BROADCAST_RECIPIENT_ACTOR_ID = "*";

type NotificationIdentity = Pick<
  IdentityContext,
  "actorId" | "realm" | "tenantId"
>;

export type EmitUserNotificationInput = {
  recipientActorId?: string | null;
  recipientRealm: UiActorRealm;
  tenantId?: string | null;
  severity: UiSeverity;
  eventType: string;
  title: string;
  message: string;
  resourceLink?: CrossAppResourceLink | null;
  createdAt?: string;
};

function cloneNotification(
  notification: UserNotificationRecord,
): UserNotificationRecord {
  return {
    ...notification,
    tenantId: notification.tenantId ?? null,
    resourceLink: notification.resourceLink
      ? { ...notification.resourceLink }
      : null,
  };
}

@Injectable()
export class NotificationService implements OnModuleInit {
  private notifications: UserNotificationRecord[] = [
    {
      notificationId: "user-notif-platform-001",
      recipientActorId: BROADCAST_RECIPIENT_ACTOR_ID,
      recipientRealm: "platform",
      tenantId: null,
      severity: "info",
      eventType: "tenant.rollout_gate.ready",
      title: "Tenant rollout gate ready",
      message: "Tenant demo rollout checks are complete and ready for review.",
      resourceLink: null,
      readAt: null,
      createdAt: "2026-05-25T00:00:00.000Z",
    },
    {
      notificationId: "user-notif-ops-001",
      recipientActorId: BROADCAST_RECIPIENT_ACTOR_ID,
      recipientRealm: "ops",
      tenantId: null,
      severity: "critical",
      eventType: "incident.critical.created",
      title: "Critical incident created",
      message: "A critical incident requires ops triage.",
      resourceLink: null,
      readAt: null,
      createdAt: "2026-05-25T00:01:00.000Z",
    },
    {
      notificationId: "user-notif-tenant-001",
      recipientActorId: "tenant-user-demo-001",
      recipientRealm: "tenant",
      tenantId: "tenant-demo-001",
      severity: "info",
      eventType: "booking.confirmed",
      title: "Booking confirmed",
      message: "Booking booking-demo-001 has been confirmed.",
      resourceLink: null,
      readAt: null,
      createdAt: "2026-05-25T00:02:00.000Z",
    },
    {
      notificationId: "user-notif-driver-001",
      recipientActorId: "driver-user-demo-001",
      recipientRealm: "driver",
      tenantId: "tenant-demo-001",
      severity: "warning",
      eventType: "driver.shift.end_reminder",
      title: "Shift ending soon",
      message: "Your shift ends in 30 minutes.",
      resourceLink: null,
      readAt: null,
      createdAt: "2026-05-25T00:03:00.000Z",
    },
  ];

  constructor(
    @Optional()
    private readonly notificationRepository?: NotificationRepository,
  ) {}

  async onModuleInit() {
    if (!this.notificationRepository) {
      return;
    }

    try {
      const persistedState = await this.notificationRepository.loadState();
      if (persistedState.notifications.length === 0) {
        this.persistChanges(this.notifications, "module init bootstrap");
        return;
      }

      this.notifications = persistedState.notifications.map((notification) =>
        cloneNotification(notification),
      );
    } catch (error) {
      this.notificationRepository.reportPersistenceFailure(
        error,
        "module init",
      );
    }
  }

  listNotifications(identity: NotificationIdentity | null | undefined) {
    if (!identity || !this.isUserRealm(identity.realm)) {
      return [];
    }

    return this.notifications
      .filter((notification) =>
        this.canAccessNotification(notification, identity),
      )
      .map((notification) => cloneNotification(notification));
  }

  emit(input: EmitUserNotificationInput) {
    const notification: UserNotificationRecord = {
      notificationId: `user-notif-${randomUUID()}`,
      recipientActorId:
        input.recipientActorId?.trim() || BROADCAST_RECIPIENT_ACTOR_ID,
      recipientRealm: input.recipientRealm,
      tenantId: input.tenantId ?? null,
      severity: input.severity,
      eventType: input.eventType,
      title: input.title,
      message: input.message,
      resourceLink: input.resourceLink ?? null,
      readAt: null,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    this.notifications = [notification, ...this.notifications];
    this.persistChanges([notification], "emit");
    return cloneNotification(notification);
  }

  markNotificationRead(
    notificationId: string,
    identity: NotificationIdentity | null | undefined,
  ) {
    return this.markNotificationsRead([notificationId], identity);
  }

  markNotificationsRead(
    notificationIds: readonly string[],
    identity: NotificationIdentity | null | undefined,
  ) {
    if (!identity || !this.isUserRealm(identity.realm)) {
      return { updated: 0 };
    }

    const requestedIds = new Set(notificationIds);
    const readAt = new Date().toISOString();
    let updated = 0;

    this.notifications = this.notifications.map((notification) => {
      if (!requestedIds.has(notification.notificationId)) {
        return notification;
      }
      if (!this.canAccessNotification(notification, identity)) {
        return notification;
      }
      if (notification.readAt !== null) {
        return notification;
      }

      updated += 1;
      return {
        ...notification,
        readAt,
      };
    });

    if (updated > 0) {
      this.persistChanges(
        this.notifications.filter(
          (notification) =>
            requestedIds.has(notification.notificationId) &&
            notification.readAt === readAt,
        ),
        "mark notifications read",
      );
    }

    return { updated };
  }

  getSnapshot() {
    return this.notifications.map((notification) =>
      cloneNotification(notification),
    );
  }

  private canAccessNotification(
    notification: UserNotificationRecord,
    identity: NotificationIdentity,
  ) {
    if (notification.recipientRealm !== identity.realm) {
      return false;
    }

    if (identity.realm === "tenant") {
      if (!identity.tenantId || notification.tenantId !== identity.tenantId) {
        return false;
      }
    }

    if (identity.realm === "driver") {
      if (
        identity.tenantId &&
        notification.tenantId &&
        notification.tenantId !== identity.tenantId
      ) {
        return false;
      }
    }

    return (
      notification.recipientActorId === BROADCAST_RECIPIENT_ACTOR_ID ||
      (!!identity.actorId && notification.recipientActorId === identity.actorId)
    );
  }

  private isUserRealm(realm: string): realm is UiActorRealm {
    return (
      realm === "platform" ||
      realm === "ops" ||
      realm === "tenant" ||
      realm === "driver"
    );
  }

  private persistChanges(
    notifications: readonly UserNotificationRecord[],
    context: string,
  ) {
    if (!this.notificationRepository || notifications.length === 0) {
      return;
    }

    void this.notificationRepository
      .persistChanges({ notifications })
      .catch((error: unknown) => {
        this.notificationRepository?.reportPersistenceFailure(error, context);
      });
  }
}
