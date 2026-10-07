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
// PUSH-FIRST-PARTY-FCM-20261006: only the first-party transport's own
// bindings below are new. `PASSENGER_PUSH_TRANSPORT`/`PASSENGER_PUSH_PORT`
// stay exclusively bound to the partner path (unchanged), per D7 — the
// first-party channel is selected in MultiTaxiService/MultiTaxiRepository,
// never through that generic single-transport abstraction.
import { PassengerPushDevicesModule } from "../passenger-push-devices/passenger-push-devices.module";
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
import { PassengerPushRepository } from "./passenger-push.repository";
import { PartnerNotificationTransport } from "./partner-notification.transport";
import { PartnerNotificationWorker } from "./partner-notification.worker";
import {
  FcmHttpV1PushProvider,
  FIRST_PARTY_PUSH_CONFIG,
  FIRST_PARTY_PUSH_PROVIDER,
  firstPartyPushConfigFromEnv,
} from "./first-party-notification.transport";

@Module({
  imports: [
    DatabaseModule,
    AuditNotificationModule,
    OwnedMobilityModule,
    ReportingFilingModule,
    ServiceProductModule,
    TenantPartnerModule,
    PassengerPushDevicesModule,
  ],
  controllers: [MultiTaxiController],
  providers: [
    MultiTaxiRepository,
    MultiTaxiService,
    PartnerNotificationWorker,
    // P5-CALL-001 stays `blocked_ext`: until a provider contract
    // and credentials land, the only binding is the one that reports absence.
    { provide: MASKED_CALL_PORT, useClass: UnavailableMaskedCallPort },
    PassengerPushAdapter,
    { provide: PASSENGER_PUSH_PORT, useClass: PassengerPushAdapter },
    {
      provide: PASSENGER_PUSH_ADAPTER_CONFIG,
      useValue: {
        transportMode: "partner_webhook",
        providerName: "partner_webhook",
      },
    },
    PartnerNotificationTransport,
    {
      provide: PASSENGER_PUSH_TRANSPORT,
      useExisting: PartnerNotificationTransport,
    },
    // Retained for subscription API compatibility, not injected as a receiver.
    PassengerPushRepository,
    // PUSH-FIRST-PARTY-FCM-20261006: additive, dormant-by-default bindings.
    // `useValue` reads the flag/project id once at bootstrap, same pattern
    // as PASSENGER_PUSH_ADAPTER_CONFIG above — this is a static deploy-time
    // setting, not something expected to change mid-process.
    { provide: FIRST_PARTY_PUSH_CONFIG, useValue: firstPartyPushConfigFromEnv() },
    {
      provide: FIRST_PARTY_PUSH_PROVIDER,
      useFactory: () => new FcmHttpV1PushProvider(),
    },
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
