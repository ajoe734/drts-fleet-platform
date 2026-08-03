import { Module } from "@nestjs/common";

import { StepUpProofService } from "../../common/auth";
import { DatabaseModule } from "../../common/db";
import { IdentityController } from "./identity.controller";
import { IdentityRepository } from "./identity.repository";

@Module({
  imports: [DatabaseModule],
  controllers: [IdentityController],
  providers: [IdentityRepository, StepUpProofService],
  exports: [IdentityRepository, StepUpProofService],
})
export class IdentityModule {}
