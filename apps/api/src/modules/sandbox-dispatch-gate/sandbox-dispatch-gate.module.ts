import { Module } from "@nestjs/common";

import { VehicleEvidenceModule } from "../vehicle-evidence/vehicle-evidence.module";
import { SandboxDispatchGateService } from "./sandbox-dispatch-gate.service";

@Module({
  imports: [VehicleEvidenceModule],
  providers: [SandboxDispatchGateService],
  exports: [SandboxDispatchGateService],
})
export class SandboxDispatchGateModule {}
