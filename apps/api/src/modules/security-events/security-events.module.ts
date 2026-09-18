import { Global, Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { SecurityEventsController } from "./security-events.controller";
import { SecurityEventsRepository } from "./security-events.repository";
import { SecurityEventsService } from "./security-events.service";

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [SecurityEventsController],
  providers: [SecurityEventsRepository, SecurityEventsService],
  exports: [SecurityEventsRepository, SecurityEventsService],
})
export class SecurityEventsModule {}
