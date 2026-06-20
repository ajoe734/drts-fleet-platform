import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { BillingSettlementModule } from "../billing-settlement/billing-settlement.module";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { RegulatoryRegistryModule } from "../regulatory-registry/regulatory-registry.module";
import { FleetPartnerController } from "./fleet-partner.controller";
import { FleetPartnerRepository } from "./fleet-partner.repository";
import { FleetPartnerService } from "./fleet-partner.service";
import { SupplyDocumentService } from "./supply-document.service";
import { SupplyReadinessService } from "./supply-readiness.service";
import { SupplySubmissionRepository } from "./supply-submission.repository";
import { SupplyReviewService } from "./supply-review.service";
import { SupplySubmissionService } from "./supply-submission.service";

@Module({
  imports: [
    DatabaseModule,
    BillingSettlementModule,
    OwnedMobilityModule,
    RegulatoryRegistryModule,
  ],
  controllers: [FleetPartnerController],
  providers: [
    FleetPartnerService,
    FleetPartnerRepository,
    SupplySubmissionRepository,
    SupplySubmissionService,
    SupplyReviewService,
    SupplyReadinessService,
    SupplyDocumentService,
  ],
  exports: [
    FleetPartnerService,
    SupplySubmissionRepository,
    SupplySubmissionService,
    SupplyReviewService,
    SupplyReadinessService,
    SupplyDocumentService,
  ],
})
export class FleetPartnerModule {}
