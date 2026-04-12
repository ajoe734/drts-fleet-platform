import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { PlatformAdminController } from "./platform-admin.controller";
import { PlatformAdminRepository } from "./platform-admin.repository";
import { PlatformAdminService } from "./platform-admin.service";

@Module({
  imports: [DatabaseModule, AuditNotificationModule],
  controllers: [PlatformAdminController],
  providers: [PlatformAdminRepository, PlatformAdminService],
})
export class PlatformAdminModule {}
