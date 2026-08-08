import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { IdentityController } from "./identity.controller";
import { IdentityRepository } from "./identity.repository";
import { PrivilegedRoleRequestService } from "./privileged-role-request.service";

@Module({
  imports: [DatabaseModule],
  controllers: [IdentityController],
  providers: [IdentityRepository, PrivilegedRoleRequestService],
  exports: [IdentityRepository, PrivilegedRoleRequestService],
})
export class IdentityModule {}
