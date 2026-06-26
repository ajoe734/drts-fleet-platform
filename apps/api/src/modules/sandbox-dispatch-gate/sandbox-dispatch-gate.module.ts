import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { SandboxGovernanceModule } from "../sandbox-governance/sandbox-governance.module";
import { VehicleEvidenceModule } from "../vehicle-evidence/vehicle-evidence.module";
import { SandboxDispatchGateController } from "./sandbox-dispatch-gate.controller";
import { SandboxDispatchGateRepository } from "./sandbox-dispatch-gate.repository";
import { SandboxDispatchGateService } from "./sandbox-dispatch-gate.service";

@Module({
  imports: [
    DatabaseModule,
    AuditNotificationModule,
    VehicleEvidenceModule,
    SandboxGovernanceModule,
  ],
  controllers: [SandboxDispatchGateController],
  providers: [SandboxDispatchGateRepository, SandboxDispatchGateService],
  exports: [SandboxDispatchGateService],
})
export class SandboxDispatchGateModule {}
