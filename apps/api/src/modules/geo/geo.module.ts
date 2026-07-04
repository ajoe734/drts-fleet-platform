import { Module } from "@nestjs/common";

import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { MapGeofenceObservabilityModule } from "../operational-observability/map-geofence-observability.module";
import { ExternalGeoProvider } from "./external-geo.provider";
import { GeoProviderConfigService } from "./geo-provider-config.service";
import { GeoController } from "./geo.controller";
import { GEO_PROVIDER } from "./geo.provider";
import { GeoService } from "./geo.service";
import { MockGeoProvider } from "./mock-geo.provider";

@Module({
  imports: [AuditNotificationModule, MapGeofenceObservabilityModule],
  controllers: [GeoController],
  providers: [
    GeoProviderConfigService,
    MockGeoProvider,
    ExternalGeoProvider,
    {
      provide: GEO_PROVIDER,
      inject: [GeoProviderConfigService, MockGeoProvider, ExternalGeoProvider],
      useFactory: (
        configService: GeoProviderConfigService,
        mockProvider: MockGeoProvider,
        externalProvider: ExternalGeoProvider,
      ) => {
        const health = configService.getHealth();
        return health.mode === "external" ? externalProvider : mockProvider;
      },
    },
    GeoService,
  ],
  exports: [GeoService],
})
export class GeoModule {}
