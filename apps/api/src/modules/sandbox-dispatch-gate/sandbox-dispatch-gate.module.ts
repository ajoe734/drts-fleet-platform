import { Module } from "@nestjs/common";

import { SandboxDispatchGateService } from "./sandbox-dispatch-gate.service";

@Module({
  providers: [SandboxDispatchGateService],
  exports: [SandboxDispatchGateService],
})
export class SandboxDispatchGateModule {}
