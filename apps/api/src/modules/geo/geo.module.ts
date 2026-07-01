import { Module } from "@nestjs/common";

import {
  GEO_PROVIDER_ENV,
  GeoProviderConfigService,
} from "./geo-provider-config.service";
import { GeoController } from "./geo.controller";
import { GeoService } from "./geo.service";
import { MockGeoProvider } from "./mock-geo.provider";

@Module({
  controllers: [GeoController],
  providers: [
    {
      provide: GEO_PROVIDER_ENV,
      useValue: process.env,
    },
    GeoProviderConfigService,
    MockGeoProvider,
    GeoService,
  ],
  exports: [GeoService],
})
export class GeoModule {}
