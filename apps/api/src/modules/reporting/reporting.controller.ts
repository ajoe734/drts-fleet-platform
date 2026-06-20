import { Body, Controller, Get, Headers, Post, Query } from "@nestjs/common";

import { toApiListData, toApiSuccessEnvelope } from "../../common/api-envelope";
import { RequireRealms } from "../../common/auth";
import { ReportingService } from "./reporting.service";
import type {
  DailyDispatchRecordQuery,
  DispatchableSupplySnapshotQuery,
  MonthlyOperationsSummaryQuery,
} from "./reporting.repository";

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

  @Post("reports/dispatchable-supply-snapshots/rebuild")
  @RequireRealms("platform", "ops")
  async rebuildDispatchableSupplySnapshots(
    @Body("snapshotAt") snapshotAt: string | undefined,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.reportingService.captureDispatchableSupplySnapshot(
        snapshotAt ? new Date(snapshotAt) : new Date(),
      ),
      requestId,
    );
  }

  @Get("reports/dispatchable-supply-snapshots")
  @RequireRealms("platform", "ops")
  async listDispatchableSupplySnapshots(
    @Query() query: DispatchableSupplySnapshotQuery,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items =
      await this.reportingService.listDispatchableSupplySnapshots(query);
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Post("reports/monthly-operations-summaries/rebuild")
  @RequireRealms("platform", "ops")
  async rebuildMonthlyOperationsSummaries(
    @Body() query: MonthlyOperationsSummaryQuery,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.reportingService.rebuildMonthlyOperationsSummaries(query),
      requestId,
    );
  }

  @Get("reports/monthly-operations-summaries")
  @RequireRealms("platform", "ops")
  async listMonthlyOperationsSummaries(
    @Query() query: MonthlyOperationsSummaryQuery,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = await this.reportingService.listMonthlyOperationsSummaries(query);
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("reports/operations-summary/preview")
  @RequireRealms("platform", "ops")
  async previewSixMonthOperationsSummary(
    @Query()
    query: MonthlyOperationsSummaryQuery & {
      from?: string;
      to?: string;
    },
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = await this.reportingService.previewSixMonthOperationsSummary(
      query,
    );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }
}
