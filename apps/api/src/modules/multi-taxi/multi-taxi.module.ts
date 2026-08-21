import { Module, OnModuleInit } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { ReportingFilingModule } from "../reporting-filing/reporting-filing.module";
import { ReportingFilingService } from "../reporting-filing/reporting-filing.service";
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
export class MultiTaxiModule implements OnModuleInit {
  constructor(
    private readonly reportingFilingService: ReportingFilingService,
    private readonly multiTaxiService: MultiTaxiService,
  ) {}

  onModuleInit() {
    // Registered from this side because the dependency runs this way:
    // MultiTaxiModule imports ReportingFilingModule, so reporting cannot import
    // multi-taxi back. PRD 9.10.1 item 7 reads the authorization rows, which
    // are the fare version history.
    this.reportingFilingService.registerOperatingAuthorizationFeedProvider(() =>
      this.multiTaxiService.listAuthorizations(),
    );
  }
}
