import { Module } from "@nestjs/common";

import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { MapGeofenceObservabilityModule } from "../operational-observability/map-geofence-observability.module";
import { GeoProviderConfigService } from "./geo-provider-config.service";
import { GeoController } from "./geo.controller";
import { GEO_PROVIDER } from "./geo.provider";
import { GeoService } from "./geo.service";
import { GoogleGeoProvider } from "./google-geo.provider";
import { MockGeoProvider } from "./mock-geo.provider";

@Module({
  imports: [AuditNotificationModule, MapGeofenceObservabilityModule],
  controllers: [GeoController],
  providers: [
    GeoProviderConfigService,
    MockGeoProvider,
    GoogleGeoProvider,
    {
      provide: GEO_PROVIDER,
      inject: [GeoProviderConfigService, MockGeoProvider, GoogleGeoProvider],
      useFactory: (
        config: GeoProviderConfigService,
        mockProvider: MockGeoProvider,
        googleProvider: GoogleGeoProvider,
      ) => (config.useGoogleProvider() ? googleProvider : mockProvider),
    },
    GeoService,
  ],
  exports: [GeoService],
})
export class GeoModule {}
