import { Module } from "@nestjs/common";

import { TeslaIntegrationService } from "./tesla-integration.service";

@Module({
  providers: [TeslaIntegrationService],
  exports: [TeslaIntegrationService],
})
export class TeslaIntegrationModule {}
