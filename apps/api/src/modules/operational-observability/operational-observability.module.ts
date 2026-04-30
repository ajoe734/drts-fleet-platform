import { Module } from "@nestjs/common";

import { CallcenterModule } from "../callcenter/callcenter.module";
import { ForwarderModule } from "../forwarder/forwarder.module";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { ReportingFilingModule } from "../reporting-filing/reporting-filing.module";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { OperationalObservabilityController } from "./operational-observability.controller";
import { OperationalObservabilityService } from "./operational-observability.service";

@Module({
  imports: [
    OwnedMobilityModule,
    CallcenterModule,
    RegulatoryRegistryModule,
    ForwarderModule,
    ReportingFilingModule,
    TenantPartnerModule,
  ],
  controllers: [OperationalObservabilityController],
  providers: [OperationalObservabilityService],
  exports: [OperationalObservabilityService],
})
export class OperationalObservabilityModule {}
