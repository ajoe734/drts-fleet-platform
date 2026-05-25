import { Module } from "@nestjs/common";

import { PlatformAdminModule } from "../platform-admin/platform-admin.module";
import { ReportingFilingModule } from "../reporting-filing/reporting-filing.module";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { TenantIntegrationController } from "./tenant-integration.controller";
import { TenantIntegrationService } from "./tenant-integration.service";

@Module({
  imports: [TenantPartnerModule, ReportingFilingModule, PlatformAdminModule],
  controllers: [TenantIntegrationController],
  providers: [TenantIntegrationService],
})
export class TenantIntegrationModule {}
