import { Module, OnModuleInit, forwardRef } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { OwnedMobilityService } from "../owned-mobility/owned-mobility.service";
import { ReportingFilingController } from "./reporting-filing.controller";
import { ReportingFilingRepository } from "./reporting-filing.repository";
import { ReportingFilingService } from "./reporting-filing.service";

@Module({
  imports: [
    DatabaseModule,
    AuditNotificationModule,
    forwardRef(() => OwnedMobilityModule),
  ],
  controllers: [ReportingFilingController],
  providers: [ReportingFilingService, ReportingFilingRepository],
  exports: [ReportingFilingService],
})
export class ReportingFilingModule implements OnModuleInit {
  constructor(
    private readonly reportingFilingService: ReportingFilingService,
    private readonly ownedMobilityService: OwnedMobilityService,
  ) {}

  onModuleInit() {
    this.reportingFilingService.registerOrderFeedProvider(() =>
      this.ownedMobilityService.listOrders(),
    );
  }
}
