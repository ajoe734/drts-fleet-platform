import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { MapGeofenceObservabilityModule } from "../operational-observability/map-geofence-observability.module";
import { ServiceAreaController } from "./service-area.controller";
import { ServiceAreaRepository } from "./service-area.repository";
import { ServiceAreaService } from "./service-area.service";

@Module({
  imports: [
    DatabaseModule,
    AuditNotificationModule,
    MapGeofenceObservabilityModule,
  ],
  controllers: [ServiceAreaController],
  providers: [ServiceAreaRepository, ServiceAreaService],
  exports: [ServiceAreaService],
})
export class ServiceAreaModule {}
