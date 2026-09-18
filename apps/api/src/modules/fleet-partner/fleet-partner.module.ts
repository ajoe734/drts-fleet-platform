import { Module } from "@nestjs/common";

import { DriverAcademyModule } from "../driver-academy/driver-academy.module";
import { DatabaseModule } from "../../common/db";
import { BillingSettlementModule } from "../billing-settlement/billing-settlement.module";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { VehicleEligibilityModule } from "../vehicle-eligibility/vehicle-eligibility.module";
import { FleetPartnerController } from "./fleet-partner.controller";
import { FleetPartnerRepository } from "./fleet-partner.repository";
import { FleetPartnerService } from "./fleet-partner.service";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { ComplaintModule } from "../complaint/complaint.module";
import { FleetPartnerCaseService } from "./fleet-partner-case.service";
import { SupplyDocumentService } from "./supply-document.service";
import { SupplyReadinessService } from "./supply-readiness.service";
import { SupplySubmissionRepository } from "./supply-submission.repository";
import { SupplyReviewService } from "./supply-review.service";
import { SupplySubmissionService } from "./supply-submission.service";

@Module({
  imports: [
    DatabaseModule,
    DriverAcademyModule,
    BillingSettlementModule,
    OwnedMobilityModule,
    RegulatoryRegistryModule,
    VehicleEligibilityModule,
    AuditNotificationModule,
    ComplaintModule,
  ],
  controllers: [FleetPartnerController],
  providers: [
    FleetPartnerService,
    FleetPartnerCaseService,
    FleetPartnerRepository,
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
