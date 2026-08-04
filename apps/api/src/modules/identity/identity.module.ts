import { Module } from "@nestjs/common";

import { StepUpProofService } from "../../common/auth";
import { DatabaseModule } from "../../common/db";
import { AccessReviewController } from "./access-review.controller";
import { AccessReviewService } from "./access-review.service";
import { IdentityController } from "./identity.controller";
import { IdentityRepository } from "./identity.repository";

@Module({
  imports: [DatabaseModule],
  controllers: [IdentityController, AccessReviewController],
  providers: [IdentityRepository, AccessReviewService, StepUpProofService],
  exports: [IdentityRepository, AccessReviewService, StepUpProofService],
})
export class IdentityModule {}
