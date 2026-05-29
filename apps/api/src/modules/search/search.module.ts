import { Module } from "@nestjs/common";

import { BillingSettlementModule } from "../billing-settlement/billing-settlement.module";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";

@Module({
  imports: [OwnedMobilityModule, TenantPartnerModule, BillingSettlementModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
