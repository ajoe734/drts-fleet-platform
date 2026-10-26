import { FleetDocumentStorageService } from "./fleet-document-storage.service";
import { ControlledDownloadModule } from "../controlled-download/controlled-download.module";
import { Module } from "@nestjs/common";

import { DriverAcademyModule } from "../driver-academy/driver-academy.module";
import { DatabaseModule } from "../../common/db";
import { IdempotencyModule } from "../../common/idempotency";
import { BillingSettlementModule } from "../billing-settlement/billing-settlement.module";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { VehicleEligibilityModule } from "../vehicle-eligibility/vehicle-eligibility.module";
import { FleetPartnerController } from "./fleet-partner.controller";
import { FleetStatementDecisionRepository } from "./fleet-statement-decision.repository";
import { FleetPartnerRepository } from "./fleet-partner.repository";
import { FleetPartnerService } from "./fleet-partner.service";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { CallcenterModule } from "../callcenter/callcenter.module";
import { IdentityModule } from "../identity/identity.module";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { SecurityEventsModule } from "../security-events/security-events.module";
import { ComplaintModule } from "../complaint/complaint.module";
import { FleetPartnerCaseService } from "./fleet-partner-case.service";
import { SupplyDocumentService } from "./supply-document.service";
import { SupplyReadinessService } from "./supply-readiness.service";
import { SupplySubmissionRepository } from "./supply-submission.repository";
import { SupplyReviewService } from "./supply-review.service";
import { SupplySubmissionService } from "./supply-submission.service";

@Module({
  imports: [
    ControlledDownloadModule,
    DatabaseModule,
    IdempotencyModule,
    DriverAcademyModule,
    BillingSettlementModule,
    OwnedMobilityModule,
    RegulatoryRegistryModule,
    VehicleEligibilityModule,
    AuditNotificationModule,
    ComplaintModule,
    CallcenterModule,
    IdentityModule,
    TenantPartnerModule,
    SecurityEventsModule,
  ],
  controllers: [FleetPartnerController],
  providers: [
    FleetDocumentStorageService,
    FleetPartnerService,
    FleetPartnerCaseService,
    FleetPartnerRepository,
    FleetStatementDecisionRepository,
    SupplySubmissionRepository,
    SupplySubmissionService,
    SupplyReviewService,
    SupplyReadinessService,
    SupplyDocumentService,
  ],
  exports: [
    FleetPartnerService,
    FleetPartnerCaseService,
    SupplySubmissionRepository,
    SupplySubmissionService,
    SupplyReviewService,
    SupplyReadinessService,
    SupplyDocumentService,
  ],
})
export class FleetPartnerModule {}
