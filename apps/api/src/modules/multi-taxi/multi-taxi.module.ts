import { Module, OnModuleInit } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { ReportingFilingModule } from "../reporting-filing/reporting-filing.module";
import { ReportingFilingService } from "../reporting-filing/reporting-filing.service";
import { ServiceProductModule } from "../service-product/service-product.module";
// SR-PARTNER-NOTIFY-ROUTE-20260917: order-route creation must resolve the
// authenticated partner handoff's identity link, never a caller-asserted
// one (design §4). TenantPartnerModule already exports this repository as a
// singleton shared with the referral-embed-handoff flow that creates the
// link in the first place; MultiTaxiModule -> TenantPartnerModule is a new,
// one-way edge (TenantPartnerModule does not import MultiTaxiModule), so
// this does not introduce a module cycle.
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import {
  MASKED_CALL_PORT,
  UnavailableMaskedCallPort,
} from "./masked-call.port";
import { MultiTaxiController } from "./multi-taxi.controller";
import { MultiTaxiRepository } from "./multi-taxi.repository";
import { MultiTaxiService } from "./multi-taxi.service";
import { PASSENGER_PUSH_PORT } from "./passenger-push.port";
import {
  PASSENGER_PUSH_ADAPTER_CONFIG,
  PASSENGER_PUSH_TRANSPORT,
  PassengerPushAdapter,
} from "./passenger-push.adapter";
import {
  PassengerPushRepository,
} from "./passenger-push.repository";
import { PartnerNotificationTransport } from "./partner-notification.transport";

@Module({
  imports: [
    DatabaseModule,
    AuditNotificationModule,
    OwnedMobilityModule,
    ReportingFilingModule,
    ServiceProductModule,
    TenantPartnerModule,
  ],
  controllers: [MultiTaxiController],
  providers: [
    MultiTaxiRepository,
    MultiTaxiService,
    // P5-CALL-001 stays `blocked_ext`: until a provider contract
    // and credentials land, the only binding is the one that reports absence.
    { provide: MASKED_CALL_PORT, useClass: UnavailableMaskedCallPort },
    PassengerPushAdapter,
    { provide: PASSENGER_PUSH_PORT, useExisting: PassengerPushAdapter },
    { provide: PASSENGER_PUSH_ADAPTER_CONFIG, useValue: { transportMode: "partner_webhook", providerName: "partner_webhook" } },
    PartnerNotificationTransport,
    { provide: PASSENGER_PUSH_TRANSPORT, useExisting: PartnerNotificationTransport },
    // Retained for subscription API compatibility, not injected as a receiver.
    PassengerPushRepository,
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
