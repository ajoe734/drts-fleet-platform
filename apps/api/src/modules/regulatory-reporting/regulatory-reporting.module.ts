import { Module } from "@nestjs/common";

import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { IncidentModule } from "../incident/incident.module";
import { RocOperationsModule } from "../roc-operations/roc-operations.module";
import { ReportingModule } from "../reporting/reporting.module";
import { SandboxGovernanceModule } from "../sandbox-governance/sandbox-governance.module";
import { TeslaIntegrationModule } from "../tesla-integration/tesla-integration.module";
import { RegulatoryReportJobsService } from "./regulatory-report-jobs.service";
import { RegulatoryReportingController } from "./regulatory-reporting.controller";
import { RegulatoryReportingService } from "./regulatory-reporting.service";

@Module({
  imports: [
    AuditNotificationModule,
    ReportingModule,
    RocOperationsModule,
    TeslaIntegrationModule,
    SandboxGovernanceModule,
    IncidentModule,
  ],
  controllers: [RegulatoryReportingController],
  providers: [RegulatoryReportingService, RegulatoryReportJobsService],
  exports: [RegulatoryReportingService, RegulatoryReportJobsService],
})
export class RegulatoryReportingModule {}
