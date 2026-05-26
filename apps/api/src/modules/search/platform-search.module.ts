import { Module } from "@nestjs/common";

import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { ForwarderModule } from "../forwarder/forwarder.module";
import { PlatformAdminModule } from "../platform-admin/platform-admin.module";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { PlatformSearchController } from "./platform-search.controller";
import { PlatformSearchService } from "./platform-search.service";

@Module({
  imports: [
    AuditNotificationModule,
    ForwarderModule,
    PlatformAdminModule,
    TenantPartnerModule,
  ],
  controllers: [PlatformSearchController],
  providers: [PlatformSearchService],
})
export class PlatformSearchModule {}
