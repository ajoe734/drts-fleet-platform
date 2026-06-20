import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { OpsDispatchEventsService } from "../../common/ops-dispatch-events.service";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { DriverProfileModule } from "../driver-profile/driver-profile.module";

import {
  DriverTelemetryController,
  RegulatoryRegistryController,
} from "./regulatory-registry.controller";
import { RegulatoryRegistryRepository } from "./regulatory-registry.repository";
import { RegulatoryRegistryService } from "./regulatory-registry.service";

@Module({
  imports: [DatabaseModule, AuditNotificationModule, DriverProfileModule],
  controllers: [RegulatoryRegistryController, DriverTelemetryController],
  providers: [
    RegulatoryRegistryService,
    RegulatoryRegistryRepository,
    OpsDispatchEventsService,
  ],
  exports: [RegulatoryRegistryService],
})
export class RegulatoryRegistryModule {}
