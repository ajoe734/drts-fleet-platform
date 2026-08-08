import { Module } from "@nestjs/common";

import { StepUpProofService } from "../../common/auth";
import { DatabaseModule } from "../../common/db";
import { AccessReviewController } from "./access-review.controller";
import { AccessReviewService } from "./access-review.service";
import { BreakGlassService } from "./break-glass.service";
import { IdentityController } from "./identity.controller";
import { IdentityRepository } from "./identity.repository";
import { PrivilegedRoleGovernanceService } from "./privileged-role-governance.service";
import { SecurityEventsModule } from "../security-events/security-events.module";

@Module({
  imports: [DatabaseModule, SecurityEventsModule],
  controllers: [IdentityController, AccessReviewController],
  providers: [
    IdentityRepository,
    AccessReviewService,
    BreakGlassService,
    StepUpProofService,
    PrivilegedRoleGovernanceService,
  ],
  exports: [
    IdentityRepository,
    AccessReviewService,
    BreakGlassService,
    StepUpProofService,
    PrivilegedRoleGovernanceService,
  ],
})
export class IdentityModule {}
