import { PassengerFareRepository } from "../passenger-app/fare/passenger-fare.repository";
import { ComplaintModule } from "../complaint/complaint.module";
import {
  MASKED_CALL_PORT,
  UnavailableMaskedCallPort,
} from "../multi-taxi/masked-call.port";
import { Module, OnModuleInit, forwardRef } from "@nestjs/common";

import { GeoModule } from "../geo/geo.module";
import { DatabaseModule } from "../../common/db";
import { IdempotencyModule } from "../../common/idempotency";
import { OpsDispatchEventsModule } from "../../common/ops-dispatch-events.module";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { CallcenterModule } from "../callcenter/callcenter.module";
import { MultiTaxiRepository } from "../multi-taxi/multi-taxi.repository";
import { FleetPartnerRepository } from "../fleet-partner/fleet-partner.repository";
import { RegulatoryRegistryRepository } from "../regulatory-registry/regulatory-registry.repository";
import { ProductRuleModule } from "../product-rule/product-rule.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { SandboxDispatchGateModule } from "../sandbox-dispatch-gate/sandbox-dispatch-gate.module";
import { ServiceAreaModule } from "../service-area/service-area.module";
import { ServiceProductModule } from "../service-product/service-product.module";
import { PlatformPresenceModule } from "../platform-presence/platform-presence.module";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";
import { VehicleEligibilityModule } from "../vehicle-eligibility/vehicle-eligibility.module";
import { VoiceBookingModule } from "../voice-booking/voice-booking.module";
import { OwnedMobilityController } from "./owned-mobility.controller";
import { OwnedMobilityRepository } from "./owned-mobility.repository";
import { ReferralBindingScaffoldService } from "./referral-binding.scaffold.service";
import { OwnedMobilityTaskEventsService } from "./owned-mobility-task-events.service";
import { OwnedMobilityService } from "./owned-mobility.service";
import { OwnedAutonomousDispatchExecutorService } from "./owned-autonomous-dispatch-executor.service";
import { ReferralDemoTripController } from "./referral-demo-trip.controller";
import { ReferralDemoTripService } from "./referral-demo-trip.service";

@Module({
  imports: [
    GeoModule,
    ComplaintModule,
    DatabaseModule,
    IdempotencyModule,
    OpsDispatchEventsModule,
    RegulatoryRegistryModule,
    ServiceAreaModule,
    ServiceProductModule,
    VehicleEligibilityModule,
    AuditNotificationModule,
    CallcenterModule,
    ProductRuleModule,
    forwardRef(() => VoiceBookingModule),
    forwardRef(() => SandboxDispatchGateModule),
    forwardRef(() => TenantPartnerModule),
    forwardRef(() => PlatformPresenceModule),
  ],
  controllers: [OwnedMobilityController, ReferralDemoTripController],
  providers: [
    { provide: MASKED_CALL_PORT, useClass: UnavailableMaskedCallPort },
    // Stateless DB adapter only; importing MultiTaxiModule would add a cycle.
    MultiTaxiRepository,
    FleetPartnerRepository,
    RegulatoryRegistryRepository,
    OwnedMobilityRepository,
    PassengerFareRepository,
    OwnedMobilityService,
    OwnedMobilityTaskEventsService,
    ReferralBindingScaffoldService,
    OwnedAutonomousDispatchExecutorService,
    ReferralDemoTripService,
  ],
  exports: [
    OwnedMobilityService,
    ReferralBindingScaffoldService,
    OwnedAutonomousDispatchExecutorService,
  ],
})
export class OwnedMobilityModule implements OnModuleInit {
  constructor(
    private readonly ownedMobilityService: OwnedMobilityService,
    private readonly tenantPartnerService: TenantPartnerService,
  ) {}

  onModuleInit() {
    this.tenantPartnerService.registerOrderFeedProvider(() =>
      this.ownedMobilityService.listOrders(),
    );
  }
}
