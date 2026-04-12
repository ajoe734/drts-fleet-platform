import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditController } from "./audit.controller";
import { AuditLogRepository } from "./audit-log.repository";
import { AuditNotificationService } from "./audit-notification.service";
import { NotificationsController } from "./notifications.controller";

@Module({
  imports: [DatabaseModule],
  controllers: [AuditController, NotificationsController],
  providers: [AuditLogRepository, AuditNotificationService],
  exports: [AuditNotificationService],
})
export class AuditNotificationModule {}
