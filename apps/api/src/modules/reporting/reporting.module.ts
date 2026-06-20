import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { DispatchDailyRecordBuilderService } from "./dispatch-daily-record-builder.service";
import { ReportingRepository } from "./reporting.repository";

@Module({
  imports: [DatabaseModule],
  providers: [ReportingRepository, DispatchDailyRecordBuilderService],
  exports: [DispatchDailyRecordBuilderService],
})
export class ReportingModule {}
