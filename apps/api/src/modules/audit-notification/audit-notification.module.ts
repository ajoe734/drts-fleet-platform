import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { FileMailOutbox } from "../notification-delivery/file-mail-outbox";
import { NotificationDeliveryService } from "../notification-delivery/notification-delivery.service";
import { createMailpitSmtpTransportFromEnv } from "../notification-delivery/smtp-mail.transport";
import { AuditController } from "./audit.controller";
import { AuditNotificationEmailAdapter } from "./audit-notification.email-adapter";
import { AuditLogRepository } from "./audit-log.repository";
import { AuditNotificationService } from "./audit-notification.service";
import { NotificationsController } from "./notifications.controller";

/**
 * A missing NOTIFICATION_OUTBOX_DIRECTORY degrades to a disabled delivery
 * service (AuditNotificationEmailAdapter reports "unavailable" and never
 * fabricates a sent status) instead of failing module bootstrap. This
 * mirrors AuditLogRepository's optional-DatabaseService pattern.
 */
export function createAuditNotificationDeliveryService(): NotificationDeliveryService | null {
  const directory = process.env.NOTIFICATION_OUTBOX_DIRECTORY?.trim();
  if (!directory) {
    return null;
  }
  return new NotificationDeliveryService(
    new FileMailOutbox(directory),
    createMailpitSmtpTransportFromEnv(process.env),
  );
}

@Module({
  imports: [DatabaseModule],
  controllers: [AuditController, NotificationsController],
  providers: [
    AuditLogRepository,
    {
      provide: NotificationDeliveryService,
      useFactory: createAuditNotificationDeliveryService,
    },
    AuditNotificationEmailAdapter,
    AuditNotificationService,
  ],
  exports: [AuditNotificationService],
})
export class AuditNotificationModule {}
