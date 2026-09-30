import { Module } from "@nestjs/common";

import { DatabaseModule, DatabaseService } from "../../common/db";
import { createNotificationDeliveryServiceFromEnv } from "../notification-delivery/notification-delivery.factory";
import { NotificationDeliveryService } from "../notification-delivery/notification-delivery.service";
import { AuditController } from "./audit.controller";
import { AuditNotificationEmailAdapter } from "./audit-notification.email-adapter";
import { AuditLogRepository } from "./audit-log.repository";
import { AuditNotificationService } from "./audit-notification.service";
import { NotificationsController } from "./notifications.controller";

/** Optional storage stays disabled; partial SMTP configuration always fails. */
export function createAuditNotificationDeliveryService(
  databaseService?: DatabaseService,
): NotificationDeliveryService | null {
  return createNotificationDeliveryServiceFromEnv(process.env, databaseService);
}

@Module({
  imports: [DatabaseModule],
  controllers: [AuditController, NotificationsController],
  providers: [
    AuditLogRepository,
    {
      provide: NotificationDeliveryService,
      useFactory: createAuditNotificationDeliveryService,
      inject: [DatabaseService],
    },
    AuditNotificationEmailAdapter,
    AuditNotificationService,
  ],
  exports: [AuditNotificationService],
})
export class AuditNotificationModule {}
