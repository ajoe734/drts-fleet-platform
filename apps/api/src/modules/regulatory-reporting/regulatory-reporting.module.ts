import { Module } from "@nestjs/common";

import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { PlatformAdminRegulatoryReportingController } from "./platform-admin-regulatory-reporting.controller";
import { RegulatoryReportingController } from "./regulatory-reporting.controller";
import { RegulatoryReportingService } from "./regulatory-reporting.service";

@Module({
  imports: [AuditNotificationModule],
  controllers: [
    RegulatoryReportingController,
    PlatformAdminRegulatoryReportingController,
  ],
  providers: [RegulatoryReportingService],
  exports: [RegulatoryReportingService],
})
export class RegulatoryReportingModule {}
