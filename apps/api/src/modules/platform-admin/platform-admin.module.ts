import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { ForwarderModule } from "../forwarder/forwarder.module";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { PlatformAdminHealthController } from "./platform-admin-health.controller";
import { PlatformAdminHealthService } from "./platform-admin-health.service";
import { PlatformAdminController } from "./platform-admin.controller";
import { PlatformTenantGovernanceController } from "./tenant-governance.controller";
import { PlatformTenantGovernanceService } from "./tenant-governance.service";
import { TenantsController } from "./tenants.controller";
import { TenantsService } from "./tenants.service";
import { PlatformAdminRepository } from "./platform-admin.repository";
import { PlatformAdminService } from "./platform-admin.service";

@Module({
  imports: [
    DatabaseModule,
    AuditNotificationModule,
    TenantPartnerModule,
    ForwarderModule,
  ],
  controllers: [
    PlatformAdminController,
    PlatformAdminHealthController,
    TenantsController,
    PlatformTenantGovernanceController,
  ],
  providers: [
    PlatformAdminRepository,
    PlatformAdminService,
    PlatformAdminHealthService,
    TenantsService,
    PlatformTenantGovernanceService,
  ],
})
export class PlatformAdminModule {}
