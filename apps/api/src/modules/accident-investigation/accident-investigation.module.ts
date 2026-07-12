import { Module } from "@nestjs/common";

import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { RocOperationsModule } from "../roc-operations/roc-operations.module";
import { SafetyOperatorModule } from "../safety-operator/safety-operator.module";
import { SandboxGovernanceModule } from "../sandbox-governance/sandbox-governance.module";
import { TeslaIntegrationModule } from "../tesla-integration/tesla-integration.module";
import { VehicleEvidenceModule } from "../vehicle-evidence/vehicle-evidence.module";
import { AccidentInvestigationController } from "./accident-investigation.controller";
import { AccidentInvestigationService } from "./accident-investigation.service";

@Module({
  imports: [
    AuditNotificationModule,
    OwnedMobilityModule,
    RocOperationsModule,
    SafetyOperatorModule,
    SandboxGovernanceModule,
    TeslaIntegrationModule,
    VehicleEvidenceModule,
  ],
  controllers: [AccidentInvestigationController],
  providers: [AccidentInvestigationService],
  exports: [AccidentInvestigationService],
})
export class AccidentInvestigationModule {}
