import { Module, forwardRef } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AccidentInvestigationModule } from "../accident-investigation/accident-investigation.module";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { IdentityModule } from "../identity/identity.module";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { VehicleEvidenceModule } from "../vehicle-evidence/vehicle-evidence.module";
import { PlatformAdminComplianceController } from "./platform-admin-compliance.controller";
import { PlatformAdminComplianceService } from "./platform-admin-compliance.service";
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
    AccidentInvestigationModule,
    VehicleEvidenceModule,
    forwardRef(() => IdentityModule),
  ],
  controllers: [
    PlatformAdminController,
    PlatformAdminComplianceController,
    TenantsController,
    PlatformTenantGovernanceController,
  ],
  providers: [
    PlatformAdminRepository,
    PlatformAdminService,
    PlatformAdminComplianceService,
    TenantsService,
    PlatformTenantGovernanceService,
  ],
  exports: [
    PlatformAdminService,
    PlatformAdminComplianceService,
    TenantsService,
    PlatformTenantGovernanceService,
  ],
})
export class PlatformAdminModule {}

