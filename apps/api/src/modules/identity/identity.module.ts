import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { IdentityController } from "./identity.controller";
import { IdentityRepository } from "./identity.repository";
import { StepUpController } from "./step-up.controller";
import { StepUpProofService } from "./step-up-proof.service";

@Module({
  imports: [DatabaseModule],
  controllers: [IdentityController, StepUpController],
  providers: [IdentityRepository, StepUpProofService],
  exports: [IdentityRepository, StepUpProofService],
})
export class IdentityModule {}
