import { Body, Controller, Get, Headers, Post, Query } from "@nestjs/common";

import { toApiListData, toApiSuccessEnvelope } from "../../common/api-envelope";
import { RequireRealms } from "../../common/auth";
import { ReportingService } from "./reporting.service";
import type { DailyDispatchRecordQuery } from "./reporting.repository";

@Controller()
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  @Post("reports/daily-dispatch-records/rebuild")
  @RequireRealms("platform", "ops")
  async rebuildDailyDispatchRecords(
    @Body() query: DailyDispatchRecordQuery,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.reportingService.rebuildDailyDispatchRecords(query),
      requestId,
    );
  }

  @Get("reports/daily-dispatch-records")
  @RequireRealms("platform", "ops")
  async listDailyDispatchRecords(
    @Query() query: DailyDispatchRecordQuery,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = await this.reportingService.listDailyDispatchRecords(query);
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }
}
