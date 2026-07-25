import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { ReportingFilingModule } from "../reporting-filing/reporting-filing.module";
import { ServiceProductModule } from "../service-product/service-product.module";
import {
  MASKED_CALL_PORT,
  UnavailableMaskedCallPort,
} from "./masked-call.port";
import { MultiTaxiController } from "./multi-taxi.controller";
import { MultiTaxiRepository } from "./multi-taxi.repository";
import { MultiTaxiService } from "./multi-taxi.service";
import {
  PASSENGER_PUSH_PORT,
  UnavailablePassengerPushPort,
} from "./passenger-push.port";

@Module({
  imports: [
    DatabaseModule,
    AuditNotificationModule,
    OwnedMobilityModule,
    ReportingFilingModule,
    ServiceProductModule,
  ],
  controllers: [MultiTaxiController],
  providers: [
    MultiTaxiRepository,
    MultiTaxiService,
    // P5-CALL-001 / P5-PUSH-001 stay `blocked_ext`: until a provider contract
    // and credentials land, the only binding is the one that reports absence.
    { provide: MASKED_CALL_PORT, useClass: UnavailableMaskedCallPort },
    { provide: PASSENGER_PUSH_PORT, useClass: UnavailablePassengerPushPort },
  ],
  exports: [MultiTaxiService],
})
export class MultiTaxiModule {}
