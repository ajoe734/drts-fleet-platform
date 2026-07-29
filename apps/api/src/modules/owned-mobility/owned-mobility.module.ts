import { Module, OnModuleInit, forwardRef } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { OpsDispatchEventsService } from "../../common/ops-dispatch-events.service";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { CallcenterModule } from "../callcenter/callcenter.module";
import { ProductRuleModule } from "../product-rule/product-rule.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { SandboxDispatchGateModule } from "../sandbox-dispatch-gate/sandbox-dispatch-gate.module";
import { ServiceAreaModule } from "../service-area/service-area.module";
import { ServiceProductModule } from "../service-product/service-product.module";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";
import { VehicleEligibilityModule } from "../vehicle-eligibility/vehicle-eligibility.module";
import { OwnedMobilityController } from "./owned-mobility.controller";
import { OwnedMobilityRepository } from "./owned-mobility.repository";
import { ReferralBindingScaffoldService } from "./referral-binding.scaffold.service";
import { OwnedMobilityTaskEventsService } from "./owned-mobility-task-events.service";
import { OwnedMobilityService } from "./owned-mobility.service";

@Module({
  imports: [
    DatabaseModule,
    RegulatoryRegistryModule,
    ServiceAreaModule,
    ServiceProductModule,
    VehicleEligibilityModule,
    AuditNotificationModule,
    CallcenterModule,
    ProductRuleModule,
    forwardRef(() => SandboxDispatchGateModule),
    forwardRef(() => TenantPartnerModule),
  ],
  controllers: [OwnedMobilityController],
  providers: [
    OwnedMobilityRepository,
    OwnedMobilityService,
    OwnedMobilityTaskEventsService,
    ReferralBindingScaffoldService,
    OpsDispatchEventsService,
  ],
  exports: [OwnedMobilityService, ReferralBindingScaffoldService],
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
