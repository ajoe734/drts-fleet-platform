import { Module, OnModuleInit } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { IdempotencyModule } from "../../common/idempotency";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { ComplaintModule } from "../complaint/complaint.module";
import { ComplaintService } from "../complaint/complaint.service";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { OwnedMobilityService } from "../owned-mobility/owned-mobility.service";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import { ReportingModule } from "../reporting/reporting.module";
import { ReportingService } from "../reporting/reporting.service";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";
import { ReportingFilingController } from "./reporting-filing.controller";
import { ReportingFilingRepository } from "./reporting-filing.repository";
import { ReportingFilingService } from "./reporting-filing.service";

@Module({
  imports: [
    DatabaseModule,
    IdempotencyModule,
    AuditNotificationModule,
    ComplaintModule,
    OwnedMobilityModule,
    RegulatoryRegistryModule,
    ReportingModule,
    TenantPartnerModule,
  ],
  controllers: [ReportingFilingController],
  providers: [ReportingFilingService, ReportingFilingRepository],
  exports: [ReportingFilingService],
})
export class ReportingFilingModule implements OnModuleInit {
  constructor(
    private readonly reportingFilingService: ReportingFilingService,
    private readonly ownedMobilityService: OwnedMobilityService,
    private readonly reportingService: ReportingService,
    private readonly tenantPartnerService: TenantPartnerService,
    private readonly regulatoryRegistryService: RegulatoryRegistryService,
    private readonly complaintService: ComplaintService,
  ) {}

  onModuleInit() {
    this.reportingFilingService.registerOrderFeedProvider(() =>
      this.ownedMobilityService.listOrders(),
    );
    this.reportingFilingService.registerDailyDispatchRecordProvider((filters) =>
      this.reportingService.listDailyDispatchRecords(filters),
    );
    this.reportingFilingService.registerSixMonthOperationsSummaryProvider(
      (filters) =>
        this.reportingService.previewSixMonthOperationsSummary(filters),
    );
    this.reportingFilingService.registerCostCenterDirectoryProvider(
      (tenantId) => this.tenantPartnerService.listCostCenters(tenantId),
    );
    // PRD 9.10.1 rosters read live registry state rather than a captured
    // snapshot, so the report is whatever the fleet is at export time.
    this.reportingFilingService.registerVehicleRegistryFeedProvider(() =>
      this.regulatoryRegistryService.listVehicles(),
    );
    this.reportingFilingService.registerDriverRegistryFeedProvider(() =>
      this.regulatoryRegistryService.listDrivers(),
    );
    this.reportingFilingService.registerVehicleContractFeedProvider(() =>
      this.regulatoryRegistryService.listContracts(),
    );
    this.reportingFilingService.registerInsurancePolicyFeedProvider(() =>
      this.regulatoryRegistryService.listPolicies(),
    );
    this.reportingFilingService.registerComplaintCaseFeedProvider(() =>
      this.complaintService.listComplaintCases(),
    );
  }
}
