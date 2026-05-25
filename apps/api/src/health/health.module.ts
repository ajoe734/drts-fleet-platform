import { Module } from "@nestjs/common";

import { ForwarderModule } from "../modules/forwarder/forwarder.module";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

@Module({
  imports: [ForwarderModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
