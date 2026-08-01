import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { IdentityController } from "./identity.controller";
import { IdentityRepository } from "./identity.repository";

@Module({
  imports: [DatabaseModule],
  controllers: [IdentityController],
  providers: [IdentityRepository],
  exports: [IdentityRepository],
})
export class IdentityModule {}
