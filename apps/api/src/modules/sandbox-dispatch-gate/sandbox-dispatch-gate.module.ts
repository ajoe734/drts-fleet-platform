import { Module } from "@nestjs/common";

import { RocOperationsModule } from "../roc-operations/roc-operations.module";
import { VehicleEvidenceModule } from "../vehicle-evidence/vehicle-evidence.module";
import { SandboxDispatchGateService } from "./sandbox-dispatch-gate.service";

@Module({
  imports: [VehicleEvidenceModule, RocOperationsModule],
  providers: [SandboxDispatchGateService],
  exports: [SandboxDispatchGateService],
})
export class SandboxDispatchGateModule {}
