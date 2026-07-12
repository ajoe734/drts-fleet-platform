import { Module } from "@nestjs/common";

import { AccidentInvestigationModule } from "../accident-investigation/accident-investigation.module";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { IncidentModule } from "../incident/incident.module";
import { PlatformAdminModule } from "../platform-admin/platform-admin.module";
import { RocOperationsModule } from "../roc-operations/roc-operations.module";
import { ReportingModule } from "../reporting/reporting.module";
import { SafetyOperatorModule } from "../safety-operator/safety-operator.module";
import { SandboxGovernanceModule } from "../sandbox-governance/sandbox-governance.module";
import { TeslaIntegrationModule } from "../tesla-integration/tesla-integration.module";
import { PlatformAdminRegulatorCasesController } from "./platform-admin-regulator-cases.controller";
import { PlatformAdminRegulatorCasesService } from "./platform-admin-regulator-cases.service";
import { PlatformAdminRegulatoryReportingController } from "./platform-admin-regulatory-reporting.controller";
import { RegulatoryReportJobsService } from "./regulatory-report-jobs.service";
import { RegulatoryReportingController } from "./regulatory-reporting.controller";
import { RegulatoryReportingService } from "./regulatory-reporting.service";

@Module({
  imports: [
    AccidentInvestigationModule,
    AuditNotificationModule,
    ReportingModule,
    PlatformAdminModule,
    RocOperationsModule,
    TeslaIntegrationModule,
    SafetyOperatorModule,
    SandboxGovernanceModule,
    IncidentModule,
  ],
  controllers: [
    RegulatoryReportingController,
    PlatformAdminRegulatoryReportingController,
    PlatformAdminRegulatorCasesController,
  ],
  providers: [
    RegulatoryReportingService,
    RegulatoryReportJobsService,
    PlatformAdminRegulatorCasesService,
  ],
  exports: [
    RegulatoryReportingService,
    RegulatoryReportJobsService,
    PlatformAdminRegulatorCasesService,
  ],
})
export class RegulatoryReportingModule {}
