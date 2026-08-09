import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { IdentityController } from "./identity.controller";
import { IdentityRepository } from "./identity.repository";
import { BreakGlassService } from "./break-glass.service";

@Module({
  imports: [DatabaseModule],
  controllers: [IdentityController],
  providers: [IdentityRepository, BreakGlassService],
  exports: [IdentityRepository, BreakGlassService],
})
export class IdentityModule {}
