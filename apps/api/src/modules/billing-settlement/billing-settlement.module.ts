import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { BillingSettlementRepository } from "./billing-settlement.repository";
import { BillingSettlementController } from "./billing-settlement.controller";
import { BillingSettlementService } from "./billing-settlement.service";
import { ReferralSettlementScaffoldService } from "./referral-settlement.scaffold.service";
import { SandboxFallbackCostPolicyResolverService } from "./sandbox-fallback-cost-policy-resolver.service";

@Module({
  imports: [DatabaseModule, AuditNotificationModule],
  controllers: [BillingSettlementController],
  providers: [
    BillingSettlementService,
    BillingSettlementRepository,
    ReferralSettlementScaffoldService,
    SandboxFallbackCostPolicyResolverService,
  ],
  exports: [
    BillingSettlementService,
    ReferralSettlementScaffoldService,
    SandboxFallbackCostPolicyResolverService,
  ],
})
export class BillingSettlementModule {}
