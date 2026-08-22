import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { OpsDispatchEventsModule } from "../../common/ops-dispatch-events.module";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { DriverProfileModule } from "../driver-profile/driver-profile.module";

import { DriverHeartbeatController } from "./driver-heartbeat.controller";
import { OpsDriverTrackingController } from "./ops-driver-tracking.controller";
import { RegulatoryRegistryController } from "./regulatory-registry.controller";
import { RegulatoryRegistryRepository } from "./regulatory-registry.repository";
import { RegulatoryRegistryService } from "./regulatory-registry.service";

@Module({
  imports: [
    DatabaseModule,
    OpsDispatchEventsModule,
    AuditNotificationModule,
    DriverProfileModule,
  ],
  controllers: [
    RegulatoryRegistryController,
    DriverHeartbeatController,
    OpsDriverTrackingController,
  ],
  providers: [RegulatoryRegistryService, RegulatoryRegistryRepository],
  exports: [RegulatoryRegistryService],
})
export class RegulatoryRegistryModule {}
