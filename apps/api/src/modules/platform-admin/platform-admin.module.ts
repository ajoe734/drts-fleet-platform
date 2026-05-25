import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { TenantRolloutService } from "../tenant-rollout/tenant-rollout.service";
import { PlatformAdminController } from "./platform-admin.controller";
import { PlatformTenantGovernanceController } from "./tenant-governance.controller";
import { PlatformTenantGovernanceService } from "./tenant-governance.service";
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
    TenantRolloutService,
    PlatformTenantGovernanceService,
  ],
})
export class PlatformAdminModule {}
