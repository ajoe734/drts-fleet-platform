import { Module } from "@nestjs/common";

import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { IncidentModule } from "../incident/incident.module";
import { PlatformAdminModule } from "../platform-admin/platform-admin.module";
import { RocOperationsModule } from "../roc-operations/roc-operations.module";
import { ReportingModule } from "../reporting/reporting.module";
import { SandboxGovernanceModule } from "../sandbox-governance/sandbox-governance.module";
import { TeslaIntegrationModule } from "../tesla-integration/tesla-integration.module";
import { PlatformAdminRegulatoryReportingController } from "./platform-admin-regulatory-reporting.controller";
import { RegulatoryReportJobsService } from "./regulatory-report-jobs.service";
import { RegulatoryReportingController } from "./regulatory-reporting.controller";
import { RegulatoryReportingService } from "./regulatory-reporting.service";

@Module({
  imports: [
    AuditNotificationModule,
    ReportingModule,
    PlatformAdminModule,
    RocOperationsModule,
    TeslaIntegrationModule,
    SandboxGovernanceModule,
    IncidentModule,
  ],
  controllers: [
    RegulatoryReportingController,
    PlatformAdminRegulatoryReportingController,
  ],
  providers: [RegulatoryReportingService, RegulatoryReportJobsService],
  exports: [RegulatoryReportingService, RegulatoryReportJobsService],
})
export class RegulatoryReportingModule {}
