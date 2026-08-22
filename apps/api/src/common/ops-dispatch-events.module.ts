import { Module } from "@nestjs/common";

import { DatabaseModule } from "./db";
import { OpsDispatchEventsService } from "./ops-dispatch-events.service";

@Module({
  imports: [DatabaseModule],
  providers: [OpsDispatchEventsService],
  exports: [OpsDispatchEventsService],
})
export class OpsDispatchEventsModule {}
