/**
 * IAM-MFA-001 — request-time enforcement of the MFA / step-up policy.
 *
 * Runs after `BootstrapAuthGuard` has established `request.identity`, so the
 * only identity it sees is the canonical server-projected one. It resolves the
 * privileged action from the route, evaluates the policy, and emits a security
 * event for both the allow and the deny path.
 *
 * Enforcement modes
 * -----------------
 * `strict`   — every identity is evaluated. This is the behaviour in
 *              production and staging, and it is not overridable there.
 * `verified_sessions_only` — the local/test default. Identities that arrive
 *              through the bootstrap-header fixture path are recorded and
 *              skipped, because those environments let a caller self-assert
 *              roles and scopes anyway; gating them on MFA would test the
 *              fixture, not the control. Verified-token identities are still
 *              fully evaluated. Bootstrap headers are rejected outright in
 *              strict environments, so this path cannot exist there.
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
} from "@nestjs/common";
import type {
  IamPrivilegedActionRule,
  IamStepUpDecision,
  IdentityContext,
} from "@drts/contracts";

import { ApiRequestError } from "../api-envelope";
import { SecurityEventsService } from "../../modules/security-events/security-events.service";
import { StepUpProofService } from "../../modules/identity/step-up-proof.service";
import { detectAuthEnvironment } from "../../config/auth-startup-config";
import type {
  AuthenticatedRequestLike,
  BootstrapRequestIdentity,
} from "./auth.types";
import {
  evaluateStepUpPolicy,
  resolvePrivilegedActionRule,
  toStepUpIdentityEvidence,
} from "./mfa-step-up.policy";

export const STEP_UP_PROOF_HEADER = "x-drts-step-up-proof";

export type StepUpEnforcementMode = "strict" | "verified_sessions_only";

export function resolveStepUpEnforcementMode(
  env: NodeJS.ProcessEnv = process.env,
): StepUpEnforcementMode {
  const environment = detectAuthEnvironment(env);
  if (environment === "production" || environment === "staging") {
    return "strict";
  }
  return env.IAM_STEP_UP_ENFORCEMENT === "strict"
    ? "strict"
    : "verified_sessions_only";
}

function readProofReference(request: AuthenticatedRequestLike): string | null {
  const headerValue = (
    request.headers as Record<string, string | string[] | undefined>
  )[STEP_UP_PROOF_HEADER];
  const header = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof header === "string" && header.trim()) {
    return header.trim();
  }

  const body = (request as { body?: unknown }).body;
  if (!body || typeof body !== "object") {
    return null;
  }

  const record = body as {
    stepUpReference?: unknown;
    step_up_reference?: unknown;
    mutation?: { stepUpReference?: unknown; step_up_reference?: unknown };
  };
  const candidates = [
    record.stepUpReference,
    record.step_up_reference,
    record.mutation?.stepUpReference,
    record.mutation?.step_up_reference,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

@Injectable()
export class StepUpGuard implements CanActivate {
  constructor(
    @Optional() private readonly stepUpProofService?: StepUpProofService,
    @Optional() private readonly securityEventsService?: SecurityEventsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequestLike>();
    const method = request.method ?? "GET";
    const requestUrl = request.originalUrl ?? request.url ?? "";
    const identity = request.identity ?? null;

    const rule = resolvePrivilegedActionRule(
      method,
      requestUrl,
      identity?.realm ?? null,
    );
    if (!rule) {
      return true;
    }

    const mode = resolveStepUpEnforcementMode();
    if (
      mode === "verified_sessions_only" &&
      identity &&
      identity.authMode !== "jwt_bearer"
    ) {
      this.emitEvent(
        "mfa.step_up_not_enforced",
        "success",
        "low",
        rule,
        identity,
        request,
        "FIXTURE_BOOTSTRAP_IDENTITY",
        [],
      );
      return true;
    }

    const proofReference = readProofReference(request);
    const proof = proofReference
      ? (this.stepUpProofService?.findProof(proofReference) ?? null)
      : null;

    const decision = evaluateStepUpPolicy({
      rule,
      identity: toStepUpIdentityEvidence(identity),
      proof,
      proofReferencePresented: Boolean(proofReference),
      now: new Date(),
    });

    if (decision.outcome !== "allow") {
      this.emitEvent(
        "mfa.step_up_denied",
        "denied",
        rule.riskTier === "critical" ? "high" : "medium",
        rule,
        identity,
        request,
        decision.reasonCode,
        decision.satisfiedByAuthMethods,
      );

      throw new ApiRequestError(
        403,
        decision.errorCode ?? "STEP_UP_REQUIRED",
        decision.errorCode === "MFA_REQUIRED"
          ? "A trusted multi-factor authentication proof is required for this action."
          : "A fresh step-up proof bound to this session and action is required.",
        this.buildErrorDetail(rule, decision, method, requestUrl),
      );
    }

    // Single-use: burn the proof so a replay of the same reference fails.
    if (decision.reasonCode === "STEP_UP_PROOF_FRESH" && proof) {
      this.stepUpProofService?.consumeProof(proof.proofId);
    }

    this.emitEvent(
      "mfa.step_up_satisfied",
      "success",
      "low",
      rule,
      identity,
      request,
      decision.reasonCode,
      decision.satisfiedByAuthMethods,
    );

    return true;
  }

  private buildErrorDetail(
    rule: IamPrivilegedActionRule,
    decision: IamStepUpDecision,
    method: string,
    requestUrl: string,
  ): Record<string, unknown> {
    // Deliberately non-enumerating: the caller learns what the action needs,
    // never what evidence the principal already holds.
    return {
      route: requestUrl,
      method,
      actionId: rule.actionId,
      reasonCode: decision.reasonCode,
      requiredAssurance: rule.minimumAssurance,
      acceptedAuthMethods: [...rule.acceptedAuthMethods],
      freshnessSeconds: rule.freshnessSeconds,
      riskTier: rule.riskTier,
    };
  }

  private emitEvent(
    eventType: string,
    outcome: "success" | "denied",
    severity: "low" | "medium" | "high",
    rule: IamPrivilegedActionRule,
    identity: BootstrapRequestIdentity | null,
    request: AuthenticatedRequestLike,
    reasonCode: string,
    authMethods: readonly string[],
  ): void {
    if (!this.securityEventsService) {
      return;
    }

    try {
      this.securityEventsService.recordEvent({
        eventType,
        eventFamily: "policy",
        outcome,
        severity,
        actorId: identity?.actorId ?? null,
        actorType: (identity?.actorType ??
          "system") as IdentityContext["actorType"],
        realm: (identity?.realm ?? "system") as IdentityContext["realm"],
        tenantId: identity?.tenantId ?? null,
        partnerId: identity?.partnerId ?? null,
        targetType: "privileged_action",
        targetId: rule.actionId,
        sessionId: identity?.sessionId ?? null,
        tokenId: identity?.tokenId ?? null,
        authMethods: [...authMethods],
        requestId: identity?.requestId ?? null,
        traceId: null,
        reasonCode,
        approvalId: null,
        maskedContext: {
          route: request.originalUrl ?? request.url ?? "",
          method: (request.method ?? "GET").toUpperCase(),
          riskTier: rule.riskTier,
          requiredAssurance: rule.minimumAssurance,
          freshnessSeconds: rule.freshnessSeconds,
        },
      });
    } catch {
      // A security event must never mask or block the authorization outcome.
    }
  }
}
