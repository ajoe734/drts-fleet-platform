import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { PlatformPresenceController } from "./platform-presence.controller";
import { PlatformPresenceService } from "./platform-presence.service";
import { PlatformPresenceRepository } from "./platform-presence.repository";

@Module({
  imports: [DatabaseModule],
  controllers: [PlatformPresenceController],
  providers: [PlatformPresenceRepository, PlatformPresenceService],
  exports: [PlatformPresenceService],
})
export class PlatformPresenceModule {}
