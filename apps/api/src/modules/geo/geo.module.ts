import { Module } from "@nestjs/common";

import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { MapGeofenceObservabilityModule } from "../operational-observability/map-geofence-observability.module";
import { GeoProviderConfigService } from "./geo-provider-config.service";
import { GeoController } from "./geo.controller";
import { GeoService } from "./geo.service";
import { MockGeoProvider } from "./mock-geo.provider";

@Module({
  imports: [AuditNotificationModule, MapGeofenceObservabilityModule],
  controllers: [GeoController],
  providers: [GeoProviderConfigService, MockGeoProvider, GeoService],
  exports: [GeoService],
})
export class GeoModule {}
