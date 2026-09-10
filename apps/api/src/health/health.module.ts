import { forwardRef, Module } from "@nestjs/common";

import { HealthController } from "./health.controller";
import { MetricsController } from "./metrics.controller";
import { VoiceBookingModule } from "../modules/voice-booking/voice-booking.module";

@Module({
  imports: [forwardRef(() => VoiceBookingModule)],
  controllers: [HealthController, MetricsController],
})
export class HealthModule {}
