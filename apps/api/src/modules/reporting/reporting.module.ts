import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { ComplaintModule } from "../complaint/complaint.module";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { VehicleEligibilityModule } from "../vehicle-eligibility/vehicle-eligibility.module";
import { ReferralMonthlyRatingService } from "./referral-monthly-rating.service";
import { ReferralMonthlyRatingController } from "./referral-monthly-rating.controller";
import { ReportingController } from "./reporting.controller";
import { ReportingRepository } from "./reporting.repository";
import { ReportingService } from "./reporting.service";

@Module({
  imports: [
    DatabaseModule,
    ComplaintModule,
    OwnedMobilityModule,
    RegulatoryRegistryModule,
    VehicleEligibilityModule,
  ],
  controllers: [ReportingController, ReferralMonthlyRatingController],
  providers: [
    ReportingRepository,
    ReportingService,
    ReferralMonthlyRatingService,
  ],
  exports: [ReportingService],
})
export class ReportingModule {}
