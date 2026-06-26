import { Module } from "@nestjs/common";

import { IncidentModule } from "../incident/incident.module";
import { SafetyOperatorModule } from "../safety-operator/safety-operator.module";
import { TeslaIntegrationModule } from "../tesla-integration/tesla-integration.module";
import { VehicleEvidenceModule } from "../vehicle-evidence/vehicle-evidence.module";
import { RocOperationsController } from "./roc-operations.controller";
import { RocOperationsService } from "./roc-operations.service";

@Module({
  imports: [
    SafetyOperatorModule,
    IncidentModule,
    VehicleEvidenceModule,
    TeslaIntegrationModule,
  ],
  controllers: [RocOperationsController],
  providers: [RocOperationsService],
  exports: [RocOperationsService],
})
export class RocOperationsModule {}
