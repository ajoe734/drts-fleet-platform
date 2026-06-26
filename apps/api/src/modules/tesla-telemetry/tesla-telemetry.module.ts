import { Module } from "@nestjs/common";

import { TeslaTelemetryRepository } from "./tesla-telemetry.repository";
import { TeslaTelemetryService } from "./tesla-telemetry.service";

@Module({
  providers: [TeslaTelemetryRepository, TeslaTelemetryService],
  exports: [TeslaTelemetryService],
})
export class TeslaTelemetryModule {}
