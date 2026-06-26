import { Module } from "@nestjs/common";

import { TeslaRegulatoryEventsService } from "./tesla-regulatory-events.service";

@Module({
  providers: [TeslaRegulatoryEventsService],
  exports: [TeslaRegulatoryEventsService],
})
export class TeslaRegulatoryEventsModule {}
