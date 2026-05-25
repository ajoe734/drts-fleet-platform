import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { BillingSettlementModule } from "../billing-settlement/billing-settlement.module";
import { PlatformEarningsController } from "./platform-earnings.controller";
import { PlatformEarningsService } from "./platform-earnings.service";
import { PlatformEarningsRepository } from "./platform-earnings.repository";

@Module({
  imports: [DatabaseModule, BillingSettlementModule],
  controllers: [PlatformEarningsController],
  providers: [PlatformEarningsRepository, PlatformEarningsService],
  exports: [PlatformEarningsService],
})
export class PlatformEarningsModule {}
