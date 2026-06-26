import { Module, forwardRef } from "@nestjs/common";

import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { IncidentModule } from "../incident/incident.module";
import { OwnedMobilityModule } from "../owned-mobility/owned-mobility.module";
import { SafetyOperatorModule } from "../safety-operator/safety-operator.module";
import { SandboxDispatchGateModule } from "../sandbox-dispatch-gate/sandbox-dispatch-gate.module";
import { TeslaIntegrationModule } from "../tesla-integration/tesla-integration.module";
import { VehicleEvidenceModule } from "../vehicle-evidence/vehicle-evidence.module";
import { RocOperationsController } from "./roc-operations.controller";
import { RocOperationsService } from "./roc-operations.service";

@Module({
  imports: [
    SafetyOperatorModule,
    AuditNotificationModule,
    IncidentModule,
    OwnedMobilityModule,
    VehicleEvidenceModule,
    TeslaIntegrationModule,
    forwardRef(() => SandboxDispatchGateModule),
  ],
  controllers: [RocOperationsController],
  providers: [RocOperationsService],
  exports: [RocOperationsService],
})
export class RocOperationsModule {}
