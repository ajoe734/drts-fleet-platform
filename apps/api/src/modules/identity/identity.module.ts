import { Module, forwardRef } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { IdentityController } from "./identity.controller";
import { IdentityRepository } from "./identity.repository";
import { PrivilegedRoleRequestController } from "./privileged-role-request.controller";
import { PrivilegedRoleRequestService } from "./privileged-role-request.service";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { PlatformAdminModule } from "../platform-admin/platform-admin.module";

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => TenantPartnerModule),
    forwardRef(() => PlatformAdminModule),
  ],
  controllers: [IdentityController, PrivilegedRoleRequestController],
  providers: [IdentityRepository, PrivilegedRoleRequestService],
  exports: [IdentityRepository, PrivilegedRoleRequestService],
})
export class IdentityModule {}

