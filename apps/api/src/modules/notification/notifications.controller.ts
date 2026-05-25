import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

import type {
  IdentityContext,
  MarkNotificationsReadCommand,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
} from "../../common/auth";
import { NotificationService } from "./notification.service";

@Controller("notifications")
@RequireRealms("platform", "ops", "tenant", "driver")
export class NotificationsController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @RequireScopes("notifications:read")
  listNotifications(
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: this.notificationService.listNotifications(identity),
      },
      requestId,
    );
  }

  @Post(":notificationId/read")
  @RequireScopes("notifications:write")
  markNotificationRead(
    @Param("notificationId") notificationId: string,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.notificationService.markNotificationRead(notificationId, identity),
      requestId,
    );
  }

  @Post("read-bulk")
  @RequireScopes("notifications:write")
  markNotificationsReadBulk(
    @Body() command: MarkNotificationsReadCommand,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.notificationService.markNotificationsRead(
        command.notificationIds,
        identity,
      ),
      requestId,
    );
  }

  @Post("read")
  @RequireScopes("notifications:write")
  markNotificationsReadLegacy(
    @Body() command: MarkNotificationsReadCommand,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.notificationService.markNotificationsRead(
        command.notificationIds,
        identity,
      ),
      requestId,
    );
  }
}
