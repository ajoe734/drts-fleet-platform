import { Body, Controller, Get, Headers, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import type {
  CreateStepUpProofCommand,
  IdentityContext,
  StepUpProof,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import {
  CurrentIdentity,
  OpenRoute,
  RequireRealms,
  StepUpProofService,
  hasTrustedMfaAmr,
} from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { OPEN_ROUTE_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";

@Controller("identity")
export class IdentityController {
  constructor(private readonly stepUpProofService: StepUpProofService) {}

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Get("context")
  getContext(
    @CurrentIdentity() identity: BootstrapRequestIdentity,
    @Headers("x-request-id") requestId?: string,
  ) {
    const isMfaVerified = hasTrustedMfaAmr(identity.amr ?? identity.stepUpProof?.amr);
    const context: IdentityContext = {
      actorType: identity.actorType,
      actorId: identity.actorId,
      realm: identity.realm,
      authMode: identity.authMode,
      roleFamilies: identity.roleFamilies,
      roles: identity.roles,
      scopes: identity.scopes,
      tenantId: identity.tenantId,
      sid: identity.sid ?? null,
      amr: identity.amr ?? identity.stepUpProof?.amr ?? [],
      acr: identity.acr ?? identity.stepUpProof?.acr ?? null,
      authTime: identity.authTime ?? identity.stepUpProof?.authTime ?? null,
      isMfaVerified,
      supportedExecutionModes: [
        "discussion_planning",
        "supervisor_managed_execution",
      ],
    };

    return toApiSuccessEnvelope(context, requestId);
  }

  @Post("step-up-proofs")
  @RequireRealms("platform", "tenant", "ops", "partner", "driver")
  createStepUpProof(
    @Body() command: CreateStepUpProofCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const proof: StepUpProof = this.stepUpProofService.createProof(
      identity,
      command,
      requestId,
    );
    return toApiSuccessEnvelope(proof, requestId);
  }
}
