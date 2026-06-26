import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/db";
import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { SandboxGovernanceController } from "./sandbox-governance.controller";
import { SandboxGovernanceRepository } from "./sandbox-governance.repository";
import { SandboxGovernanceService } from "./sandbox-governance.service";

@Module({
  imports: [DatabaseModule, AuditNotificationModule],
  controllers: [SandboxGovernanceController],
  providers: [SandboxGovernanceRepository, SandboxGovernanceService],
  exports: [SandboxGovernanceService],
})
export class SandboxGovernanceModule {}
