import { Module } from "@nestjs/common";

import { CallcenterModule } from "../callcenter/callcenter.module";
import { ForwarderModule } from "../forwarder/forwarder.module";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { RegulatoryReportingModule } from "../regulatory-reporting/regulatory-reporting.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { ReportingFilingModule } from "../reporting-filing/reporting-filing.module";
import { SandboxGovernanceModule } from "../sandbox-governance/sandbox-governance.module";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { MapGeofenceObservabilityModule } from "./map-geofence-observability.module";
import { OperationalObservabilityController } from "./operational-observability.controller";
import { OperationalObservabilityService } from "./operational-observability.service";

@Module({
  imports: [
    OwnedMobilityModule,
    CallcenterModule,
    RegulatoryReportingModule,
    RegulatoryRegistryModule,
    ForwarderModule,
    ReportingFilingModule,
    SandboxGovernanceModule,
    TenantPartnerModule,
    MapGeofenceObservabilityModule,
  ],
  controllers: [OperationalObservabilityController],
  providers: [OperationalObservabilityService],
  exports: [OperationalObservabilityService],
})
export class OperationalObservabilityModule {}
