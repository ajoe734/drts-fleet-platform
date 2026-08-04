/**
 * IAM-MFA-001 — end-to-end enforcement chain.
 *
 * Runs a request through the real guard stack: a verified IAP workforce
 * assertion is resolved by `BootstrapAuthGuard` into the canonical request
 * identity, and `StepUpGuard` then evaluates the MFA / step-up policy against
 * that server-projected identity.
 *
 * The point of doing this at integration level is to prove the two halves
 * agree: the evidence the authentication layer projects is the evidence the
 * policy layer actually reads.
 */
import { afterEach, describe, expect, it } from "vitest";

import { signTestIapJwtAssertion } from "@drts/control-plane-auth";
import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { BootstrapAuthGuard } from "../../apps/api/src/common/auth/bootstrap-auth.guard";
import { StepUpGuard } from "../../apps/api/src/common/auth/step-up.guard";
import { IAPSubjectAdapter } from "../../apps/api/src/modules/auth/iap-subject.adapter";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { StepUpProofService } from "../../apps/api/src/modules/identity/step-up-proof.service";
import { SecurityEventsService } from "../../apps/api/src/modules/security-events/security-events.service";

const TEST_SECRET = "iap_stepup_integration_secret_key_32ch!";
const TEST_AUDIENCE = "/projects/1122334455/apps/drts-control-plane-prod";
const HOLD_ROUTE =
  "/api/platform-admin/evidence/legal-holds/hold-001/release-approve";
const HOLD_ACTION = "compliance.legal_hold.release_approve";
const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function signAssertion(payload: Record<string, unknown>): string {
  return signTestIapJwtAssertion(
    {
      iss: "https://cloud.google.com/iap",
      exp: Math.floor(Date.now() / 1000) + 3600,
      aud: TEST_AUDIENCE,
      ...payload,
    },
    TEST_SECRET,
  );
}

function reflectorStub() {
  return { getAllAndOverride: () => undefined } as never;
}

function contextFor(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as never;
}

function errorCodeOf(error: unknown): string | undefined {
  const response = (error as ApiRequestError).getResponse() as {
    error?: { code?: string; details?: Record<string, unknown> };
  };
  return response.error?.code;
}

function detailsOf(error: unknown): Record<string, unknown> {
  const response = (error as ApiRequestError).getResponse() as {
    error?: { details?: Record<string, unknown> };
  };
  return response.error?.details ?? {};
}

async function buildScenario(assertionPayload: Record<string, unknown>) {
  process.env.DRTS_ENV = "test";
  process.env.IAM_STEP_UP_ENFORCEMENT = "strict";
  process.env.IAP_EXPECTED_AUDIENCE = TEST_AUDIENCE;
  process.env.IAP_JWT_SECRET_OR_PUBLIC_KEY = TEST_SECRET;
  delete process.env.STRICT_IAP_MODE;

  const identityRepository = new IdentityRepository();
  const securityEventsService = new SecurityEventsService();
  const iapAdapter = new IAPSubjectAdapter(
    identityRepository,
    securityEventsService,
  );
  const proofService = new StepUpProofService();

  const authGuard = new BootstrapAuthGuard(
    reflectorStub(),
    undefined,
    undefined,
    undefined,
    iapAdapter,
  );
  const stepUpGuard = new StepUpGuard(proofService, securityEventsService);

  const request: Record<string, unknown> = {
    method: "POST",
    originalUrl: HOLD_ROUTE,
    headers: {
      "x-goog-iap-jwt-assertion": signAssertion(assertionPayload),
    },
    body: {},
  };

  await authGuard.canActivate(contextFor(request));

  return { request, stepUpGuard, proofService, securityEventsService };
}

const PLATFORM_ASSERTION = {
  sub: "google_subject_stepup_001",
  email: "platform-lead@platform.drts",
  gcp_ia_groups: ["platform-admins@platform.drts"],
  auth_time: Math.floor(Date.now() / 1000) - 120,
};

describe("IAM-MFA-001 enforcement over the verified IAP workforce path", () => {
  it("projects server-owned amr, acr and auth_time onto the request identity", async () => {
    const { request } = await buildScenario(PLATFORM_ASSERTION);
    const identity = request.identity as {
      amr: string[];
      acr: string;
      authTime: string;
      sessionId: string;
      principalId: string;
    };

    expect(identity.amr).toEqual(["verified_iap_workforce"]);
    expect(identity.acr).toBe("aal2");
    expect(Date.parse(identity.authTime)).toBeCloseTo(
      (PLATFORM_ASSERTION.auth_time as number) * 1000,
      -3,
    );
    expect(identity.sessionId.startsWith("iap:")).toBe(true);
    expect(identity.principalId).toBeTruthy();
  });

  it("refuses the privileged legal-hold release without a bound step-up proof", async () => {
    const { request, stepUpGuard } = await buildScenario(PLATFORM_ASSERTION);

    try {
      stepUpGuard.canActivate(contextFor(request));
      throw new Error("expected the step-up guard to refuse the request");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect(errorCodeOf(error)).toBe("STEP_UP_REQUIRED");
      expect(detailsOf(error).actionId).toBe(HOLD_ACTION);
    }
  });

  it("admits the release once a fresh proof bound to that session is presented", async () => {
    const { request, stepUpGuard, proofService, securityEventsService } =
      await buildScenario(PLATFORM_ASSERTION);
    const identity = request.identity as {
      principalId: string;
      sessionId: string;
    };

    const proof = proofService.recordVerifiedProof({
      principalId: identity.principalId,
      sessionId: identity.sessionId,
      actionId: HOLD_ACTION,
      authMethods: ["verified_iap_workforce"],
      evidenceSource: "workforce_proxy",
    });

    (request.headers as Record<string, string>)["x-drts-step-up-proof"] =
      proof.proofId;

    expect(stepUpGuard.canActivate(contextFor(request))).toBe(true);

    const events = await securityEventsService.listEvents(null, {
      eventType: "mfa.step_up_satisfied",
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.targetId).toBe(HOLD_ACTION);
    expect(events[0]?.outcome).toBe("success");
  });

  it("refuses a proof minted for a different workforce session", async () => {
    const first = await buildScenario(PLATFORM_ASSERTION);
    const second = await buildScenario({
      ...PLATFORM_ASSERTION,
      sub: "google_subject_stepup_002",
      email: "other-lead@platform.drts",
    });

    const otherIdentity = second.request.identity as {
      principalId: string;
      sessionId: string;
    };
    const foreignProof = first.proofService.recordVerifiedProof({
      principalId: otherIdentity.principalId,
      sessionId: otherIdentity.sessionId,
      actionId: HOLD_ACTION,
      authMethods: ["verified_iap_workforce"],
      evidenceSource: "workforce_proxy",
    });

    (first.request.headers as Record<string, string>)["x-drts-step-up-proof"] =
      foreignProof.proofId;

    try {
      first.stepUpGuard.canActivate(contextFor(first.request));
      throw new Error("expected the step-up guard to refuse the request");
    } catch (error) {
      expect(errorCodeOf(error)).toBe("STEP_UP_REQUIRED");
      expect(detailsOf(error).reasonCode).toBe(
        "STEP_UP_PROOF_PRINCIPAL_MISMATCH",
      );
    }
  });

  it("fails closed when the assertion carries no authentication time", async () => {
    const { request, stepUpGuard } = await buildScenario({
      sub: "google_subject_stepup_003",
      email: "no-auth-time@platform.drts",
      gcp_ia_groups: ["platform-admins@platform.drts"],
      // No auth_time and no iat: the login moment is unknown.
    });

    (request.identity as { authTime: string | null }).authTime = null;

    try {
      stepUpGuard.canActivate(contextFor(request));
      throw new Error("expected the step-up guard to refuse the request");
    } catch (error) {
      expect(errorCodeOf(error)).toBe("MFA_REQUIRED");
      expect(detailsOf(error).reasonCode).toBe("MISSING_AUTH_TIME");
    }
  });

  it("records a denial security event that names the action and reason", async () => {
    const { request, stepUpGuard, securityEventsService } =
      await buildScenario(PLATFORM_ASSERTION);

    expect(() => stepUpGuard.canActivate(contextFor(request))).toThrow(
      ApiRequestError,
    );

    const events = await securityEventsService.listEvents(null, {
      eventType: "mfa.step_up_denied",
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventFamily: "policy",
      outcome: "denied",
      targetId: HOLD_ACTION,
      reasonCode: "BOUND_PROOF_REQUIRED",
    });
  });
});
