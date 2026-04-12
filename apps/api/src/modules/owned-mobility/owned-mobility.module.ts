import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { CallcenterModule } from "../callcenter/callcenter.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { OwnedMobilityController } from "./owned-mobility.controller";
import { OwnedMobilityRepository } from "./owned-mobility.repository";
import { OwnedMobilityService } from "./owned-mobility.service";

@Module({
  imports: [
    DatabaseModule,
    RegulatoryRegistryModule,
    AuditNotificationModule,
    CallcenterModule,
  ],
  controllers: [OwnedMobilityController],
  providers: [OwnedMobilityRepository, OwnedMobilityService],
  exports: [OwnedMobilityService],
})
export class OwnedMobilityModule {}
