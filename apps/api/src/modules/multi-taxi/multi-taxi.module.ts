import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { ReportingFilingModule } from "../reporting-filing/reporting-filing.module";
import { ServiceProductModule } from "../service-product/service-product.module";
import { MultiTaxiController } from "./multi-taxi.controller";
import { MultiTaxiRepository } from "./multi-taxi.repository";
import { MultiTaxiService } from "./multi-taxi.service";

@Module({
  imports: [
    DatabaseModule,
    OwnedMobilityModule,
    ReportingFilingModule,
    ServiceProductModule,
  ],
  controllers: [MultiTaxiController],
  providers: [MultiTaxiRepository, MultiTaxiService],
  exports: [MultiTaxiService],
})
export class MultiTaxiModule {}
