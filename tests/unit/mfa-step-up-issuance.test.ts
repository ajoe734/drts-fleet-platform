/**
 * IAM-MFA-001 — raising a step-up proof.
 *
 * Every privileged rule sets `requiresBoundProof`, so without this surface a
 * declared action would be permanently unreachable. What these tests pin down
 * is that the surface hands out nothing the session did not already prove:
 *
 *  - client-supplied evidence in the request body is ignored
 *  - a session that cannot clear the rule gets the same stable step-up error
 *  - the issued proof is bound to principal + session + action, single-use, and
 *    expires on the original `auth_time` clock rather than restarting it
 *  - the proof it mints is exactly the proof the guard accepts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { StepUpGuard } from "../../apps/api/src/common/auth/step-up.guard";
import { StepUpProofService } from "../../apps/api/src/modules/identity/step-up-proof.service";
import { StepUpController } from "../../apps/api/src/modules/identity/step-up.controller";
import { toStepUpIdentityEvidence } from "../../apps/api/src/common/auth/mfa-step-up.policy";
import type { BootstrapRequestIdentity } from "../../apps/api/src/common/auth/auth.types";

const EXPORT_ROUTE = "/api/platform-admin/multi-taxi-trip-records/export-jobs";
const EXPORT_ACTION = "compliance.multi_taxi_records.export";
const BREAK_GLASS_ACTION = "platform.break_glass.approve";
const PRINCIPAL_ID = "principal_platform_001";
const SESSION_ID = "sid_platform_001";

/** `compliance.multi_taxi_records.export` allows ten minutes. */
const EXPORT_FRESHNESS_SECONDS = 600;

function workforceIdentity(
  overrides: Partial<BootstrapRequestIdentity> = {},
): BootstrapRequestIdentity {
  return {
    authMode: "jwt_bearer",
    actorType: "platform_admin",
    actorId: PRINCIPAL_ID,
    principalId: PRINCIPAL_ID,
    realm: "platform",
    tenantId: null,
    sessionId: SESSION_ID,
    tokenId: "jti_001",
    authTime: new Date().toISOString(),
    amr: ["verified_iap_workforce"],
    acr: "aal2",
    roleFamilies: ["platform"],
    roles: ["platform_admin"],
    scopes: [],
    requestId: "req-1",
    ...overrides,
  } as BootstrapRequestIdentity;
}

function secondsAgo(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

function expectApiError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    const response = (error as ApiRequestError).getResponse() as {
      error?: { code?: string; details?: Record<string, unknown> };
    };
    expect(response.error?.code).toBe(code);
    return response.error?.details ?? {};
  }
  throw new Error(`Expected ${code} to be thrown`);
}

function unwrap<T>(envelope: unknown): T {
  return (envelope as { data: T }).data;
}

describe("IAM-MFA-001 step-up proof issuance", () => {
  let proofService: StepUpProofService;
  let controller: StepUpController;

  beforeEach(() => {
    proofService = new StepUpProofService();
    controller = new StepUpController(proofService);
  });

  it("publishes the requirement for a declared action without leaking held evidence", () => {
    const challenge = unwrap<Record<string, unknown>>(
      controller.getActionChallenge(EXPORT_ACTION),
    );

    expect(challenge).toEqual({
      actionId: EXPORT_ACTION,
      requiredAssurance: "aal2",
      acceptedAuthMethods: expect.arrayContaining(["verified_iap_workforce"]),
      freshnessSeconds: EXPORT_FRESHNESS_SECONDS,
      riskTier: "critical",
    });
    expect(Object.keys(challenge)).not.toContain("satisfiedByAuthMethods");
  });

  it("refuses to describe an action that has no declared policy", () => {
    expectApiError(
      () => controller.getActionChallenge("compliance.not_a_real_action"),
      "IAM_STEP_UP_ACTION_UNKNOWN",
    );
  });

  it("issues a proof bound to the caller's principal, session and action", () => {
    const identity = workforceIdentity();

    const issued = unwrap<{
      proofReference: string;
      actionId: string;
      expiresAt: string;
    }>(controller.issueProof(identity, { actionId: EXPORT_ACTION }));

    expect(issued.actionId).toBe(EXPORT_ACTION);
    expect(issued.proofReference).toMatch(/^stepup_/);

    const stored = proofService.findProof(issued.proofReference);
    expect(stored).toMatchObject({
      principalId: PRINCIPAL_ID,
      sessionId: SESSION_ID,
      actionId: EXPORT_ACTION,
      authMethods: ["verified_iap_workforce"],
      assurance: "aal2",
      consumedAt: null,
    });
  });

  it("returns only the reference, never the evidence behind it", () => {
    const issued = unwrap<Record<string, unknown>>(
      controller.issueProof(workforceIdentity(), { actionId: EXPORT_ACTION }),
    );

    expect(Object.keys(issued).sort()).toEqual([
      "actionId",
      "expiresAt",
      "proofReference",
      "verifiedAt",
    ]);
  });

  it("expires the proof on the original auth_time clock rather than restarting it", () => {
    const identity = workforceIdentity({ authTime: secondsAgo(500) });

    const issued = unwrap<{ verifiedAt: string; expiresAt: string }>(
      controller.issueProof(identity, { actionId: EXPORT_ACTION }),
    );

    expect(issued.verifiedAt).toBe(identity.authTime);
    expect(Date.parse(issued.expiresAt) - Date.parse(issued.verifiedAt)).toBe(
      EXPORT_FRESHNESS_SECONDS * 1000,
    );
    // 500s of the 600s window is already gone: this proof has ~100s of life.
    expect(Date.parse(issued.expiresAt) - Date.now()).toBeLessThan(110 * 1000);
  });

  it("refuses to issue once the session login falls outside the policy window", () => {
    const identity = workforceIdentity({
      authTime: secondsAgo(EXPORT_FRESHNESS_SECONDS + 60),
    });

    const details = expectApiError(
      () => controller.issueProof(identity, { actionId: EXPORT_ACTION }),
      "STEP_UP_REQUIRED",
    );

    expect(details.reasonCode).toBe("SESSION_AUTH_STALE");
    expect(details.actionId).toBe(EXPORT_ACTION);
  });

  it("refuses to issue for a principal that never proved a trusted factor", () => {
    const details = expectApiError(
      () =>
        controller.issueProof(workforceIdentity({ amr: [], acr: null }), {
          actionId: EXPORT_ACTION,
        }),
      "MFA_REQUIRED",
    );

    expect(details.reasonCode).toBe("NO_TRUSTED_AUTH_METHOD");
  });

  it("cannot be used to reach an action the session's factor is too weak for", () => {
    // Break-glass approval accepts only phishing-resistant factors. An IAP
    // workforce assertion is trusted, but not for this action, so it is
    // dropped before evaluation rather than downgraded into a pass.
    const details = expectApiError(
      () =>
        controller.issueProof(workforceIdentity(), {
          actionId: BREAK_GLASS_ACTION,
        }),
      "MFA_REQUIRED",
    );

    expect(details.reasonCode).toBe("UNTRUSTED_AUTH_METHOD");
    expect(details.requiredAssurance).toBe("aal3");
  });

  it("ignores client-asserted evidence in the issuance payload", () => {
    const identity = workforceIdentity({ amr: [], acr: null });

    expectApiError(
      () =>
        controller.issueProof(identity, {
          actionId: EXPORT_ACTION,
          // Not part of the contract; a caller sending it must gain nothing.
          ...({
            mfa: true,
            amr: ["webauthn"],
            acr: "aal3",
            authMethods: ["webauthn"],
          } as Record<string, unknown>),
        } as never),
      "MFA_REQUIRED",
    );
  });

  it("rejects an issuance request that names no action", () => {
    expectApiError(
      () => controller.issueProof(workforceIdentity(), { actionId: "  " }),
      "IAM_STEP_UP_ACTION_UNKNOWN",
    );
  });

  it("rejects an issuance request for an undeclared action", () => {
    expectApiError(
      () =>
        controller.issueProof(workforceIdentity(), {
          actionId: "compliance.not_a_real_action",
        }),
      "IAM_STEP_UP_ACTION_UNKNOWN",
    );
  });

  it("refuses an identity that did not arrive on a verified token", () => {
    const details = expectApiError(
      () =>
        controller.issueProof(
          workforceIdentity({ authMode: "bootstrap_headers" }),
          { actionId: EXPORT_ACTION },
        ),
      "MFA_REQUIRED",
    );

    expect(details.reasonCode).toBe("UNTRUSTED_AUTH_MODE");
  });
});

describe("IAM-MFA-001 issued proof clears the guard exactly once", () => {
  let proofService: StepUpProofService;
  let controller: StepUpController;
  let guard: StepUpGuard;

  beforeEach(() => {
    vi.stubEnv("DRTS_ENV", "test");
    vi.stubEnv("IAM_STEP_UP_ENFORCEMENT", "strict");
    proofService = new StepUpProofService();
    controller = new StepUpController(proofService);
    guard = new StepUpGuard(proofService);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function privilegedRequest(
    identity: BootstrapRequestIdentity,
    proofReference: string,
  ) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          method: "POST",
          originalUrl: EXPORT_ROUTE,
          headers: { "x-drts-step-up-proof": proofReference },
          body: {},
          identity,
        }),
      }),
    } as never;
  }

  it("closes the loop: issue, spend, and the replay fails", () => {
    const identity = workforceIdentity();
    const { proofReference } = unwrap<{ proofReference: string }>(
      controller.issueProof(identity, { actionId: EXPORT_ACTION }),
    );

    expect(guard.canActivate(privilegedRequest(identity, proofReference))).toBe(
      true,
    );

    const details = expectApiError(
      () => guard.canActivate(privilegedRequest(identity, proofReference)),
      "STEP_UP_REQUIRED",
    );
    expect(details.reasonCode).toBe("STEP_UP_PROOF_ALREADY_CONSUMED");
  });

  it("does not let one principal spend another principal's issued proof", () => {
    const owner = workforceIdentity();
    const attacker = workforceIdentity({
      actorId: "principal_platform_002",
      principalId: "principal_platform_002",
      sessionId: "sid_platform_002",
    });

    const { proofReference } = unwrap<{ proofReference: string }>(
      controller.issueProof(owner, { actionId: EXPORT_ACTION }),
    );

    const details = expectApiError(
      () => guard.canActivate(privilegedRequest(attacker, proofReference)),
      "STEP_UP_REQUIRED",
    );
    expect(details.reasonCode).toBe("STEP_UP_PROOF_PRINCIPAL_MISMATCH");
  });

  it("does not let an issued proof cross to another action", () => {
    const identity = workforceIdentity();
    const { proofReference } = unwrap<{ proofReference: string }>(
      controller.issueProof(identity, {
        actionId: "platform.access_review.decide",
      }),
    );

    const details = expectApiError(
      () => guard.canActivate(privilegedRequest(identity, proofReference)),
      "STEP_UP_REQUIRED",
    );
    expect(details.reasonCode).toBe("STEP_UP_PROOF_ACTION_MISMATCH");
  });

  it("projects the same identity evidence the guard evaluates", () => {
    const identity = workforceIdentity();
    expect(toStepUpIdentityEvidence(identity)).toEqual({
      authMode: "jwt_bearer",
      realm: "platform",
      principalId: PRINCIPAL_ID,
      sessionId: SESSION_ID,
      authTime: identity.authTime,
      authMethods: ["verified_iap_workforce"],
      assurance: "aal2",
    });
  });
});
