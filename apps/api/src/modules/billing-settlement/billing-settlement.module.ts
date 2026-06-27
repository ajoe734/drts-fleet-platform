import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { BillingSettlementRepository } from "./billing-settlement.repository";
import { BillingSettlementController } from "./billing-settlement.controller";
import { BillingSettlementService } from "./billing-settlement.service";
import { ReferralSettlementScaffoldService } from "./referral-settlement.scaffold.service";

@Module({
  imports: [DatabaseModule, AuditNotificationModule],
  controllers: [BillingSettlementController],
  providers: [
    BillingSettlementService,
    BillingSettlementRepository,
    ReferralSettlementScaffoldService,
  ],
  exports: [BillingSettlementService, ReferralSettlementScaffoldService],
})
export class BillingSettlementModule {}
