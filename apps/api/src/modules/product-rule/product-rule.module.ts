import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { FareAnomalyController } from "./fare-anomaly.controller";
import { FareAnomalyRepository } from "./fare-anomaly.repository";
import { FareAnomalyService } from "./fare-anomaly.service";
import {
  FARE_QUOTE_RECOVERY_PORT,
  UnavailableFareQuoteRecoveryPort,
} from "./fare-quote-recovery.port";
import { ProductRuleController } from "./product-rule.controller";

@Module({
  imports: [DatabaseModule, AuditNotificationModule],
  controllers: [ProductRuleController, FareAnomalyController],
  providers: [
    FareAnomalyRepository,
    FareAnomalyService,
    UnavailableFareQuoteRecoveryPort,
    {
      provide: FARE_QUOTE_RECOVERY_PORT,
      useExisting: UnavailableFareQuoteRecoveryPort,
    },
  ],
  exports: [FareAnomalyService],
})
export class ProductRuleModule {}
