import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { ForwarderModule } from "../forwarder/forwarder.module";
import { PlatformPresenceController } from "./platform-presence.controller";
import { PlatformPresenceService } from "./platform-presence.service";
import { PlatformPresenceRepository } from "./platform-presence.repository";

@Module({
  imports: [DatabaseModule, ForwarderModule, AuditNotificationModule],
  controllers: [PlatformPresenceController],
  providers: [PlatformPresenceRepository, PlatformPresenceService],
  exports: [PlatformPresenceService],
})
export class PlatformPresenceModule {}
