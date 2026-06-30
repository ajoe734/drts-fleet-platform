import { Module } from "@nestjs/common";

import { GeoProviderConfigService } from "./geo-provider-config.service";
import { GeoController } from "./geo.controller";
import { GeoService } from "./geo.service";
import { MockGeoProvider } from "./mock-geo.provider";

@Module({
  controllers: [GeoController],
  providers: [GeoProviderConfigService, MockGeoProvider, GeoService],
  exports: [GeoService],
})
export class GeoModule {}
