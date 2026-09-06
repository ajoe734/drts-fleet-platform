import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { IdempotencyModule } from "../../common/idempotency";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { ControlledDownloadModule } from "../controlled-download/controlled-download.module";
import { BillingSettlementRepository } from "./billing-settlement.repository";
import { BillingSettlementController } from "./billing-settlement.controller";
import { BillingSettlementService } from "./billing-settlement.service";
import {
  PAYMENT_RECOVERY_PORT,
  UnavailablePaymentRecoveryPort,
} from "./payment-recovery.port";
import { ReferralSettlementScaffoldService } from "./referral-settlement.scaffold.service";

@Module({
  imports: [
    DatabaseModule,
    IdempotencyModule,
    AuditNotificationModule,
    // Shares the same `DOCUMENT_ARTIFACT_STORE` singleton as
    // `ControlledDownloadController` (both import this module class into the
    // same app graph): the PDF this module renders and puts must be readable
    // by the controller that answers the signed link pointing at it.
    ControlledDownloadModule,
  ],
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
