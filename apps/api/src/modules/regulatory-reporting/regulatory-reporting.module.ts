import { Module } from "@nestjs/common";

import { RegulatoryReportingService } from "./regulatory-reporting.service";

@Module({
  providers: [RegulatoryReportingService],
  exports: [RegulatoryReportingService],
})
export class RegulatoryReportingModule {}
