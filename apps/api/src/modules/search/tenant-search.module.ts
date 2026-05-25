import { Module } from "@nestjs/common";

import { BillingSettlementModule } from "../billing-settlement/billing-settlement.module";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { TenantSearchController } from "./tenant-search.controller";
import { TenantSearchService } from "./tenant-search.service";

@Module({
  imports: [OwnedMobilityModule, TenantPartnerModule, BillingSettlementModule],
  controllers: [TenantSearchController],
  providers: [TenantSearchService],
})
export class TenantSearchModule {}
