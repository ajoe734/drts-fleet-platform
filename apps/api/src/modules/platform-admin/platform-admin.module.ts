import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { PlatformAdminController } from "./platform-admin.controller";
import { PlatformTenantGovernanceController } from "./tenant-governance.controller";
import { PlatformTenantGovernanceService } from "./tenant-governance.service";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { TenantsController } from "./tenants.controller";
import { TenantsService } from "./tenants.service";
import { PlatformAdminRepository } from "./platform-admin.repository";
import { PlatformAdminService } from "./platform-admin.service";

@Module({
  imports: [DatabaseModule, AuditNotificationModule, TenantPartnerModule],
  controllers: [
    PlatformAdminController,
    TenantsController,
    PlatformTenantGovernanceController,
  ],
  providers: [
    PlatformAdminRepository,
    PlatformAdminService,
    TenantsService,
    PlatformTenantGovernanceService,
  ],
})
export class PlatformAdminModule {}
