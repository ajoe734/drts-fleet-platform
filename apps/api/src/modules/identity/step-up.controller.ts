/**
 * IAM-MFA-001 — the caller-facing half of the step-up control.
 *
 * `StepUpGuard` refuses a privileged action until a bound proof is presented;
 * these two routes are how a caller learns what an action needs and raises that
 * proof. Neither route is privileged itself, so neither appears in
 * `IAM_PRIVILEGED_ACTION_CATALOG` and neither can be used to bootstrap evidence
 * the session does not already hold — the proof is minted from the server-owned
 * claim envelope only.
 */
import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import {
  findIamPrivilegedActionRule,
  toIamStepUpChallenge,
  toIamStepUpProofIssueResponse,
  type IamStepUpProofIssueRequest,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import { CurrentIdentity, RequireRealms } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { toStepUpIdentityEvidence } from "../../common/auth/mfa-step-up.policy";
import { StepUpProofService } from "./step-up-proof.service";

// Any authenticated principal may ask about, and step up for, their own
// actions. The realm list is what makes the route authenticated at all: without
// a policy the bootstrap guard would let it through anonymously.
@RequireRealms("system", "platform", "ops", "tenant", "driver", "partner")
@Controller("identity/step-up")
export class StepUpController {
  constructor(private readonly stepUpProofService: StepUpProofService) {}

  /**
   * What this action requires. Deliberately says nothing about what the caller
   * already holds, so it cannot be used to enumerate a principal's factors.
   */
  @Get("actions/:actionId")
  getActionChallenge(
    @Param("actionId") actionId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const rule = findIamPrivilegedActionRule(actionId);
    if (!rule) {
      throw new ApiRequestError(
        404,
        "IAM_STEP_UP_ACTION_UNKNOWN",
        "No step-up policy is declared for this action.",
        { actionId },
      );
    }

    return toApiSuccessEnvelope(toIamStepUpChallenge(rule), requestId);
  }

  @Post("proofs")
  issueProof(
    @CurrentIdentity() identity: BootstrapRequestIdentity,
    @Body() body: IamStepUpProofIssueRequest,
    @Headers("x-request-id") requestId?: string,
  ) {
    const actionId =
      typeof body?.actionId === "string" ? body.actionId.trim() : "";
    if (!actionId) {
      throw new ApiRequestError(
        400,
        "IAM_STEP_UP_ACTION_UNKNOWN",
        "A step-up proof must name the action it is raised for.",
        { actionId: null },
      );
    }

    const proof = this.stepUpProofService.issueSessionBackedProof({
      identity: toStepUpIdentityEvidence(identity),
      actionId,
    });

    return toApiSuccessEnvelope(
      toIamStepUpProofIssueResponse(proof),
      requestId,
    );
  }
}
