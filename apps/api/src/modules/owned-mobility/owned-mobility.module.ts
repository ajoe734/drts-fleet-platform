import { Module, OnModuleInit, forwardRef } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { OpsDispatchEventsService } from "../../common/ops-dispatch-events.service";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { CallcenterModule } from "../callcenter/callcenter.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";
import { OwnedMobilityController } from "./owned-mobility.controller";
import { OwnedMobilityRepository } from "./owned-mobility.repository";
import { OwnedMobilityTaskEventsService } from "./owned-mobility-task-events.service";
import { OwnedMobilityService } from "./owned-mobility.service";

@Module({
  imports: [
    DatabaseModule,
    RegulatoryRegistryModule,
    AuditNotificationModule,
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
  ) {}

  onModuleInit() {
    this.tenantPartnerService.registerOrderFeedProvider(() =>
      this.ownedMobilityService.listOrders(),
    );
  }
}
