import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { MultiTaxiController } from "./multi-taxi.controller";
import { MultiTaxiRepository } from "./multi-taxi.repository";
import { MultiTaxiService } from "./multi-taxi.service";

@Module({
  imports: [DatabaseModule, OwnedMobilityModule],
  controllers: [MultiTaxiController],
  providers: [MultiTaxiRepository, MultiTaxiService],
  exports: [MultiTaxiService],
})
export class MultiTaxiModule {}
