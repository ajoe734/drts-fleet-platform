import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { IdempotencyModule } from "../../common/idempotency";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { BillingSettlementRepository } from "./billing-settlement.repository";
import { BillingSettlementController } from "./billing-settlement.controller";
import { BillingSettlementService } from "./billing-settlement.service";
import {
  PAYMENT_RECOVERY_PORT,
  UnavailablePaymentRecoveryPort,
} from "./payment-recovery.port";
import { ReferralSettlementScaffoldService } from "./referral-settlement.scaffold.service";

@Module({
  imports: [DatabaseModule, IdempotencyModule, AuditNotificationModule],
  controllers: [BillingSettlementController],
  providers: [
    BillingSettlementService,
    BillingSettlementRepository,
    UnavailablePaymentRecoveryPort,
    {
      provide: PAYMENT_RECOVERY_PORT,
      useExisting: UnavailablePaymentRecoveryPort,
    },
    ReferralSettlementScaffoldService,
  ],
  exports: [BillingSettlementService, ReferralSettlementScaffoldService],
})
export class BillingSettlementModule {}
