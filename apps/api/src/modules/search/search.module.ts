import { Module } from "@nestjs/common";

import { ComplaintModule } from "../complaint/complaint.module";
import { DriverProfileModule } from "../driver-profile/driver-profile.module";
import { ForwarderModule } from "../forwarder/forwarder.module";
import { IncidentModule } from "../incident/incident.module";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { ShiftAttendanceModule } from "../shift-attendance/shift-attendance.module";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";

@Module({
  imports: [
    ComplaintModule,
    DriverProfileModule,
    ForwarderModule,
    IncidentModule,
    OwnedMobilityModule,
    RegulatoryRegistryModule,
    ShiftAttendanceModule,
  ],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
