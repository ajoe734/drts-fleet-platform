import { Module, OnModuleInit, forwardRef } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { OpsDispatchEventsService } from "../../common/ops-dispatch-events.service";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { BillingSettlementModule } from "../billing-settlement/billing-settlement.module";
import { BillingSettlementService } from "../billing-settlement/billing-settlement.service";
import { CallcenterModule } from "../callcenter/callcenter.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { ServiceProductModule } from "../service-product/service-product.module";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";
import { VehicleEligibilityModule } from "../vehicle-eligibility/vehicle-eligibility.module";
import { OwnedMobilityController } from "./owned-mobility.controller";
import { OwnedMobilityRepository } from "./owned-mobility.repository";
import { OwnedMobilityTaskEventsService } from "./owned-mobility-task-events.service";
import { OwnedMobilityService } from "./owned-mobility.service";

@Module({
  imports: [
    DatabaseModule,
    RegulatoryRegistryModule,
    ServiceProductModule,
    VehicleEligibilityModule,
    AuditNotificationModule,
    BillingSettlementModule,
    CallcenterModule,
    forwardRef(() => TenantPartnerModule),
  ],
  controllers: [OwnedMobilityController],
  providers: [
    OwnedMobilityRepository,
    OwnedMobilityService,
    OwnedMobilityTaskEventsService,
    OpsDispatchEventsService,
  ],
  exports: [OwnedMobilityService],
})
export class OwnedMobilityModule implements OnModuleInit {
  constructor(
    private readonly ownedMobilityService: OwnedMobilityService,
    private readonly tenantPartnerService: TenantPartnerService,
    private readonly billingSettlementService: BillingSettlementService,
  ) {}

  onModuleInit() {
    this.tenantPartnerService.registerOrderFeedProvider(() =>
      this.ownedMobilityService.listOrders(),
    );
    this.billingSettlementService.registerLiveSettlementTripProvider(() =>
      this.ownedMobilityService.listLiveSettlementTrips(),
    );
  }
}
