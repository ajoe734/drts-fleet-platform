import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
} from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import type {
  UpsertPassengerDisclosureMessageCatalogEntryCommand,
  UpsertPassengerDisclosurePolicyCommand,
} from "@drts/contracts";
import { SandboxDispatchGateService } from "./sandbox-dispatch-gate.service";
import type {
  SandboxDispatchGateInput,
  SandboxDispatchManualReleaseCommand,
} from "./sandbox-dispatch-gate.types";

@Controller("sandbox/dispatch")
@RequireRealms("system", "platform", "ops")
export class SandboxDispatchGateController {
  constructor(
    private readonly sandboxDispatchGateService: SandboxDispatchGateService,
  ) {}

  @Post("evaluate")
  @RequireScopes("sandbox.compliance.read")
  async evaluate(
    @Body() command: SandboxDispatchGateInput,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.sandboxDispatchGateService.evaluateDispatch(
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("passenger-disclosure/policies")
  @RequireScopes("sandbox.compliance.manage")
  async upsertPassengerDisclosurePolicy(
    @Body() command: UpsertPassengerDisclosurePolicyCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.sandboxDispatchGateService.upsertPassengerDisclosurePolicy(
        command,
      ),
      requestId,
    );
  }

  @Get("passenger-disclosure/policies/:policyId")
  @RequireScopes("sandbox.compliance.read")
  async getPassengerDisclosurePolicy(
    @Param("policyId") policyId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.sandboxDispatchGateService.getPassengerDisclosurePolicy(
        policyId,
      ),
      requestId,
    );
  }

  @Post("passenger-disclosure/catalog")
  @RequireScopes("sandbox.compliance.manage")
  async upsertPassengerDisclosureCatalogEntry(
    @Body() command: UpsertPassengerDisclosureMessageCatalogEntryCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.sandboxDispatchGateService.upsertPassengerDisclosureMessageCatalogEntry(
        command,
      ),
      requestId,
    );
  }

  @Get("passenger-disclosure/catalog")
  @RequireScopes("sandbox.compliance.read")
  async listPassengerDisclosureCatalog(
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items:
          await this.sandboxDispatchGateService.listPassengerDisclosureMessageCatalogEntries(),
      },
      requestId,
    );
  }

  @Post("manual-release")
  @RequireScopes("sandbox.compliance.manage")
  async manualRelease(
    @Body()
    command: SandboxDispatchGateInput & SandboxDispatchManualReleaseCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.sandboxDispatchGateService.recordManualRelease(
        command,
        {
          actorId: identity?.actorId ?? command.actorId,
          actorType: identity?.actorType === "ops_user" ? "ops_user" : "system",
          reason: command.reason,
          decisionId: command.decisionId ?? null,
        },
        requestId,
      ),
      requestId,
    );
  }
}
