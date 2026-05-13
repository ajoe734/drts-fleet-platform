import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditController } from "./audit.controller";
import { AuditNotificationEmailAdapter } from "./audit-notification.email-adapter";
import { AuditLogRepository } from "./audit-log.repository";
import { AuditNotificationService } from "./audit-notification.service";
import { NotificationsController } from "./notifications.controller";

@Module({
  imports: [DatabaseModule],
  controllers: [AuditController, NotificationsController],
  providers: [
    AuditLogRepository,
    AuditNotificationEmailAdapter,
    AuditNotificationService,
  ],
  exports: [AuditNotificationService],
})
export class AuditNotificationModule {}
