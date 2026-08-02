import { Module, forwardRef } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { IdentityController } from "./identity.controller";
import { IdentityRepository } from "./identity.repository";

@Module({
  imports: [DatabaseModule, forwardRef(() => TenantPartnerModule)],
  controllers: [IdentityController],
  providers: [IdentityRepository],
  exports: [IdentityRepository],
})
export class IdentityModule {}

