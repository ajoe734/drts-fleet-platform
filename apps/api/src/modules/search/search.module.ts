import { Module } from "@nestjs/common";

import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { PlatformAdminModule } from "../platform-admin/platform-admin.module";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";

@Module({
  imports: [PlatformAdminModule, TenantPartnerModule, AuditNotificationModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
