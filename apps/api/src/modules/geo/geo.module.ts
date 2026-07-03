import { Module } from "@nestjs/common";

import { MapGeofenceObservabilityModule } from "../map-geofence-observability/map-geofence-observability.module";
import { GeoProviderConfigService } from "./geo-provider-config.service";
import { GeoController } from "./geo.controller";
import { GeoService } from "./geo.service";
import { MockGeoProvider } from "./mock-geo.provider";

@Module({
  imports: [MapGeofenceObservabilityModule],
  controllers: [GeoController],
  providers: [GeoProviderConfigService, MockGeoProvider, GeoService],
  exports: [GeoService],
})
export class GeoModule {}
