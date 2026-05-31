import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { NotificationModule } from "../notification/notification.module";
import { AuditController } from "./audit.controller";
import { AuditNotificationEmailAdapter } from "./audit-notification.email-adapter";
import { AuditLogRepository } from "./audit-log.repository";
import { AuditNotificationService } from "./audit-notification.service";

@Module({
  imports: [DatabaseModule, NotificationModule],
  controllers: [AuditController],
  providers: [
    AuditLogRepository,
    AuditNotificationEmailAdapter,
    AuditNotificationService,
  ],
  exports: [AuditNotificationService],
})
export class AuditNotificationModule {}
