import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { BillingSettlementModule } from "../billing-settlement/billing-settlement.module";
import { FleetPartnerController } from "./fleet-partner.controller";
import { FleetPartnerRepository } from "./fleet-partner.repository";
import { FleetPartnerService } from "./fleet-partner.service";

@Module({
  imports: [DatabaseModule, BillingSettlementModule],
  controllers: [FleetPartnerController],
  providers: [FleetPartnerService, FleetPartnerRepository],
  exports: [FleetPartnerService],
})
export class FleetPartnerModule {}
