import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { CallcenterModule } from "../callcenter/callcenter.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
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
    TenantPartnerModule,
  ],
  controllers: [OwnedMobilityController],
  providers: [
    OwnedMobilityRepository,
    OwnedMobilityService,
    OwnedMobilityTaskEventsService,
  ],
  exports: [OwnedMobilityService],
})
export class OwnedMobilityModule {}
