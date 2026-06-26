import { Module } from "@nestjs/common";

import { TeslaTelemetryService } from "./tesla-telemetry.service";

@Module({
  providers: [TeslaTelemetryService],
  exports: [TeslaTelemetryService],
})
export class TeslaTelemetryModule {}
