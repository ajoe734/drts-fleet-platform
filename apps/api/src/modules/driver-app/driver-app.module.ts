import { Module } from "@nestjs/common";
import { ForwarderModule } from "../forwarder/forwarder.module";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { PlatformPresenceModule } from "../platform-presence/platform-presence.module";
import { DriverAppSummaryController } from "./driver-app-summary.controller";
import { DriverAppSummaryService } from "./driver-app-summary.service";

@Module({
  imports: [OwnedMobilityModule, ForwarderModule, PlatformPresenceModule],
  controllers: [DriverAppSummaryController],
  providers: [DriverAppSummaryService],
})
export class DriverAppModule {}
