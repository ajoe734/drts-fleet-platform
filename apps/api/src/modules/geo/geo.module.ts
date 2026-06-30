import { Module } from "@nestjs/common";

import { GeoController } from "./geo.controller";
import { GeoService } from "./geo.service";
import { MockGeoProvider } from "./mock-geo.provider";

@Module({
  controllers: [GeoController],
  providers: [MockGeoProvider, GeoService],
  exports: [GeoService],
})
export class GeoModule {}
