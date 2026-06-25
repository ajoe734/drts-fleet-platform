import { Module } from "@nestjs/common";

import { SandboxGovernanceService } from "./sandbox-governance.service";

@Module({
  providers: [SandboxGovernanceService],
  exports: [SandboxGovernanceService],
})
export class SandboxGovernanceModule {}
