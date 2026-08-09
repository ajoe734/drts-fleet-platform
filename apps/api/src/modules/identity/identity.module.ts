import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AccessReviewController } from "./access-review.controller";
import { AccessReviewService } from "./access-review.service";
import { IdentityController } from "./identity.controller";
import { IdentityRepository } from "./identity.repository";
import { BreakGlassService } from "./break-glass.service";

@Module({
  imports: [DatabaseModule],
  controllers: [IdentityController, AccessReviewController],
  providers: [IdentityRepository, AccessReviewService, BreakGlassService],
  exports: [IdentityRepository, AccessReviewService, BreakGlassService],
})
export class IdentityModule {}
