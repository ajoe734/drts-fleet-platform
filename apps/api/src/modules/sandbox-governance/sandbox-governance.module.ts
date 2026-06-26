import { Module } from "@nestjs/common";

import { AuditNotificationModule } from "../audit-notification/audit-notification.module";
import { SandboxGovernanceService } from "./sandbox-governance.service";

@Module({
  imports: [AuditNotificationModule],
  providers: [SandboxGovernanceService],
  exports: [SandboxGovernanceService],
})
export class SandboxGovernanceModule {}
