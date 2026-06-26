import { Body, Controller, Headers, Post } from "@nestjs/common";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { CurrentIdentity } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { SandboxDispatchGateService } from "./sandbox-dispatch-gate.service";
import type {
  SandboxDispatchGateInput,
  SandboxDispatchManualReleaseCommand,
} from "./sandbox-dispatch-gate.types";

@Controller("sandbox/dispatch")
export class SandboxDispatchGateController {
  constructor(
    private readonly sandboxDispatchGateService: SandboxDispatchGateService,
  ) {}

  @Post("evaluate")
  async evaluate(
    @Body() command: SandboxDispatchGateInput,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.sandboxDispatchGateService.evaluateDispatch(command, requestId),
      requestId,
    );
  }

  @Post("manual-release")
  async manualRelease(
    @Body() command: SandboxDispatchGateInput & SandboxDispatchManualReleaseCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.sandboxDispatchGateService.recordManualRelease(
        command,
        {
          actorId: identity?.actorId ?? command.actorId,
          actorType:
            identity?.actorType === "ops_user" ? "ops_user" : "system",
          reason: command.reason,
          decisionId: command.decisionId ?? null,
        },
        requestId,
      ),
      requestId,
    );
  }
}
