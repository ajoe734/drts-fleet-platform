import { Module, forwardRef } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { OpsDispatchEventsService } from "../../common/ops-dispatch-events.service";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { DriverProfileModule } from "../driver-profile/driver-profile.module";
import { MultiTaxiModule } from "../multi-taxi/multi-taxi.module";

import { DriverHeartbeatController } from "./driver-heartbeat.controller";
import { OpsDriverTrackingController } from "./ops-driver-tracking.controller";
import { RegulatoryRegistryController } from "./regulatory-registry.controller";
import { RegulatoryRegistryRepository } from "./regulatory-registry.repository";
import { RegulatoryRegistryService } from "./regulatory-registry.service";

@Module({
  imports: [
    DatabaseModule,
    AuditNotificationModule,
    DriverProfileModule,
    forwardRef(() => MultiTaxiModule),
  ],
  controllers: [
    RegulatoryRegistryController,
    DriverHeartbeatController,
    OpsDriverTrackingController,
  ],
  providers: [
    RegulatoryRegistryService,
    RegulatoryRegistryRepository,
    OpsDispatchEventsService,
  ],
  exports: [RegulatoryRegistryService],
})
export class RegulatoryRegistryModule {}

