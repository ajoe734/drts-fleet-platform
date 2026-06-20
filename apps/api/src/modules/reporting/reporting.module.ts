import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { ComplaintModule } from "../complaint/complaint.module";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { VehicleEligibilityModule } from "../vehicle-eligibility/vehicle-eligibility.module";
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
  controllers: [ReportingController],
  providers: [ReportingRepository, ReportingService],
  exports: [ReportingService],
})
export class ReportingModule {}
