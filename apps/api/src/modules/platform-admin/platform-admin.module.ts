import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { PlatformAdminController } from "./platform-admin.controller";
import { TenantsController } from "./tenants.controller";
import { TenantsService } from "./tenants.service";
import { PlatformAdminRepository } from "./platform-admin.repository";
import { PlatformAdminService } from "./platform-admin.service";

@Module({
  imports: [DatabaseModule, AuditNotificationModule],
  controllers: [PlatformAdminController, TenantsController],
  providers: [PlatformAdminRepository, PlatformAdminService, TenantsService],
})
export class PlatformAdminModule {}
