import { Module } from "@nestjs/common";

import { MapGeofenceObservabilityController } from "./map-geofence-observability.controller";
import { MapGeofenceObservabilityService } from "./map-geofence-observability.service";

@Module({
  controllers: [MapGeofenceObservabilityController],
  providers: [MapGeofenceObservabilityService],
  exports: [MapGeofenceObservabilityService],
})
export class MapGeofenceObservabilityModule {}
