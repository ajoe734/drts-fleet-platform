import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { SandboxGovernanceModule } from "../sandbox-governance/sandbox-governance.module";
import { SafetyOperatorController } from "./safety-operator.controller";
import { SafetyOperatorRepository } from "./safety-operator.repository";
import { SafetyOperatorService } from "./safety-operator.service";

@Module({
  imports: [DatabaseModule, AuditNotificationModule, SandboxGovernanceModule],
  controllers: [SafetyOperatorController],
  providers: [SafetyOperatorRepository, SafetyOperatorService],
  exports: [SafetyOperatorService],
})
export class SafetyOperatorModule {}
