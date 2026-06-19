import { Module, OnModuleInit } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { DispatchDailyRecordBuilder } from "../reporting/dispatch-daily-record.builder";
import { DispatchableSupplySnapshotService } from "../reporting/dispatchable-supply-snapshot.service";
import { OperationsSummaryAggregator } from "../reporting/operations-summary-aggregator.service";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { OwnedMobilityService } from "../owned-mobility/owned-mobility.service";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";
import { ReportingFilingController } from "./reporting-filing.controller";
import { ReportingFilingRepository } from "./reporting-filing.repository";
import { ReportingFilingService } from "./reporting-filing.service";

@Module({
  imports: [
    DatabaseModule,
    AuditNotificationModule,
    OwnedMobilityModule,
    TenantPartnerModule,
  ],
  controllers: [ReportingFilingController],
  providers: [
    ReportingFilingService,
    ReportingFilingRepository,
    DispatchDailyRecordBuilder,
    DispatchableSupplySnapshotService,
    OperationsSummaryAggregator,
  ],
  exports: [ReportingFilingService],
})
export class ReportingFilingModule implements OnModuleInit {
  constructor(
    private readonly reportingFilingService: ReportingFilingService,
    private readonly ownedMobilityService: OwnedMobilityService,
    private readonly tenantPartnerService: TenantPartnerService,
  ) {}

  onModuleInit() {
    this.reportingFilingService.registerOrderFeedProvider(() =>
      this.ownedMobilityService.listOrders(),
    );
    this.reportingFilingService.registerCostCenterDirectoryProvider((tenantId) =>
      this.tenantPartnerService.listCostCenters(tenantId),
    );
  }
}
