import { Module } from "@nestjs/common";

import { MapGeofenceObservabilityService } from "./map-geofence-observability.service";

@Module({
  providers: [MapGeofenceObservabilityService],
  exports: [MapGeofenceObservabilityService],
})
export class MapGeofenceObservabilityModule {}
