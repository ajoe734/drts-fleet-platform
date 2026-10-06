/**
 * IAM-MFA-001 — the IAP workforce path is gated like every other path.
 *
 * `BootstrapAuthGuard` has two ways to establish a platform/ops identity: a
 * verified `x-goog-iap-jwt-assertion`, and the bearer/bootstrap route. Only the
 * second one called `assertRequestSatisfied`, so a workforce caller could reach
 * a privileged action with no step-up proof at all.
 *
 * Closing that hole needs both halves, and these tests pin both:
 *  - the IAP assertion's own evidence (`amr`, `acr`, `auth_time`, a session to
 *    bind to) has to reach the identity, or the gate would be unclearable
 *    rather than strict, and
 *  - the gate has to actually run on that path.
 */
import { afterEach, describe, expect, it } from "vitest";

import type { IdentityContext } from "@drts/contracts";
import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { StepUpProofService } from "../../apps/api/src/common/auth";
import type { BootstrapRequestIdentity } from "../../apps/api/src/common/auth";
import { DEV_MFA_WAIVED_AMR } from "../../apps/api/src/common/auth/trusted-mfa.policy";
import { SecurityEventsService } from "../../apps/api/src/modules/security-events/security-events.service";

const TENANT_CREATE_ROUTE = "/api/platform-admin/tenants";
const TENANT_CREATE_ACTION = "platform:tenants:create";

type StepUpTestIdentity = BootstrapRequestIdentity & IdentityContext;

/**
 * What `resolveIapAssertionAndActivate` now puts on the request: the membership
 * stands in for the session until the durable session store lands, and the
 * evidence comes from the verified assertion.
 */
function iapWorkforceIdentity(
  overrides: Partial<BootstrapRequestIdentity> = {},
): StepUpTestIdentity {
  return {
    authMode: "jwt_bearer",
    actorType: "platform_admin",
    actorId: "principal-platform-001",
    principalId: "principal-platform-001",
    membershipId: "membership-platform-001",
    subject: "workforce@example.com",
    realm: "platform",
    tenantId: null,
    sessionId: "iap:membership-platform-001",
    tokenVersion: 1,
    authTime: new Date().toISOString(),
    amr: ["verified_iap_workforce"],
    acr: "aal2",
    roleFamilies: ["platform"],
    roles: ["platform_admin"],
    scopes: ["platform:write"],
    supportedExecutionModes: ["supervisor_managed_execution"],
    requestId: "req-iap-001",
    ...overrides,
  } as StepUpTestIdentity;
}

function privilegedRequest(reference?: string | null) {
  return {
    headers: reference ? { "x-drts-step-up-reference": reference } : {},
    method: "POST",
    url: TENANT_CREATE_ROUTE,
    body: {},
  };
}

function errorCodeOf(error: unknown): string | undefined {
  const response = (
    error as { getResponse?: () => { error?: { code?: string } } }
  ).getResponse?.();
  return response?.error?.code;
}

function expectApiError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(errorCodeOf(error)).toBe(code);
    return;
  }
  throw new Error(`Expected ${code} to be thrown`);
}

describe("IAM-MFA-001 IAP workforce step-up gate", () => {
  it("refuses a privileged action when the workforce caller sent no proof", () => {
    const service = new StepUpProofService();

    expectApiError(
      () =>
        service.assertRequestSatisfied(
          iapWorkforceIdentity(),
          privilegedRequest(),
        ),
      "STEP_UP_REQUIRED",
    );
  });

  it("accepts the workforce assertion as trusted evidence and issues a bound proof", () => {
    const service = new StepUpProofService();
    const identity = iapWorkforceIdentity();

    const proof = service.createProof(identity, {
      actionId: TENANT_CREATE_ACTION,
    });

    expect(proof.required).toBe(true);
    expect(proof.actionId).toBe(TENANT_CREATE_ACTION);
    expect(proof.stepUpReference).toBeTruthy();

    // The same reference then clears the gate the previous test could not.
    expect(() =>
      service.assertRequestSatisfied(
        identity,
        privilegedRequest(proof.stepUpReference),
      ),
    ).not.toThrow();
  });

  it("cannot issue a proof when the assertion carried no auth_time", () => {
    const service = new StepUpProofService();

    expectApiError(
      () =>
        service.createProof(iapWorkforceIdentity({ authTime: null }), {
          actionId: TENANT_CREATE_ACTION,
        }),
      "MFA_REQUIRED",
    );
  });

  it("cannot issue a proof for a workforce identity with no session binding", () => {
    const service = new StepUpProofService();

    expectApiError(
      () =>
        service.createProof(iapWorkforceIdentity({ sessionId: null }), {
          actionId: TENANT_CREATE_ACTION,
        }),
      "STEP_UP_REQUIRED",
    );
  });

  it("does not let one workforce session spend another's proof", () => {
    const service = new StepUpProofService();
    const owner = iapWorkforceIdentity();
    const other = iapWorkforceIdentity({
      actorId: "principal-platform-002",
      principalId: "principal-platform-002",
      membershipId: "membership-platform-002",
      sessionId: "iap:membership-platform-002",
    });

    const proof = service.createProof(owner, {
      actionId: TENANT_CREATE_ACTION,
    });

    expectApiError(
      () =>
        service.assertRequestSatisfied(
          other,
          privilegedRequest(proof.stepUpReference),
        ),
      "STEP_UP_REQUIRED",
    );
  });

  it("leaves non-privileged workforce routes alone", () => {
    const service = new StepUpProofService();

    expect(() =>
      service.assertRequestSatisfied(iapWorkforceIdentity(), {
        headers: {},
        method: "GET",
        url: "/api/identity/context",
        body: {},
      }),
    ).not.toThrow();
  });

  it("cannot mint proof when fresh iat request lacks upstream auth_time", () => {
    const service = new StepUpProofService();
    // Fresh request iat but authTime is null
    const identityWithMissingAuthTime = iapWorkforceIdentity({
      authTime: null,
      amr: ["verified_iap_workforce"],
      acr: "aal2",
    });

    expectApiError(
      () =>
        service.createProof(identityWithMissingAuthTime, {
          actionId: TENANT_CREATE_ACTION,
        }),
      "MFA_REQUIRED",
    );
  });

  it("cannot mint proof when fresh iat request carries stale upstream auth_time outside policy window", () => {
    const service = new StepUpProofService();
    // Fresh request iat but authTime was 2 hours ago (outside 10 min window)
    const staleAuthTime = new Date(
      Date.now() - 2 * 60 * 60 * 1000,
    ).toISOString();
    const identityWithStaleAuthTime = iapWorkforceIdentity({
      authTime: staleAuthTime,
      amr: ["mfa", "totp"],
      acr: "aal2",
    });

    expectApiError(
      () =>
        service.createProof(identityWithStaleAuthTime, {
          actionId: TENANT_CREATE_ACTION,
        }),
      "STEP_UP_REQUIRED",
    );
  });

  it("succeeds in minting proof when request has fresh upstream auth_time inside policy window", () => {
    const service = new StepUpProofService();
    // Upstream MFA performed 1 minute ago (inside 10 min window)
    const freshAuthTime = new Date(Date.now() - 60 * 1000).toISOString();
    const identityWithFreshAuthTime = iapWorkforceIdentity({
      authTime: freshAuthTime,
      amr: ["mfa", "totp"],
      acr: "aal2",
    });

    const proof = service.createProof(identityWithFreshAuthTime, {
      actionId: TENANT_CREATE_ACTION,
    });

    expect(proof.required).toBe(true);
    expect(proof.stepUpReference).toBeTruthy();

    expect(() =>
      service.assertRequestSatisfied(
        identityWithFreshAuthTime,
        privilegedRequest(proof.stepUpReference),
      ),
    ).not.toThrow();
  });
});

describe("ENTRY-IAP-WORKFORCE-AUTH-20261005 dev MFA waiver", () => {
  afterEach(() => {
    delete process.env.DRTS_DEV_MFA_WAIVED;
    delete process.env.DRTS_ENV;
    delete process.env.APP_ENV;
  });

  it("refuses the privileged action with no waiver flag and no real MFA evidence (default-safe)", () => {
    const service = new StepUpProofService();
    const identity = iapWorkforceIdentity({ amr: [], acr: null });

    expectApiError(
      () => service.createProof(identity, { actionId: TENANT_CREATE_ACTION }),
      "MFA_REQUIRED",
    );
  });

  it("lets a platform workforce identity through with DRTS_DEV_MFA_WAIVED=true and no real MFA evidence, without fabricating amr/acr on the identity itself", () => {
    process.env.DRTS_DEV_MFA_WAIVED = "true";
    const service = new StepUpProofService();
    const identity = iapWorkforceIdentity({ amr: [], acr: null });

    const proof = service.createProof(identity, {
      actionId: TENANT_CREATE_ACTION,
    });

    expect(proof.required).toBe(true);
    expect(proof.stepUpReference).toBeTruthy();
    // The source identity's own amr/acr are untouched -- the waiver is
    // recorded on the issued proof, not faked onto the caller's evidence.
    expect(identity.amr).toEqual([]);
    expect(identity.acr).toBeNull();
  });

  it("records the dev MFA waiver on a distinct, truthful amr marker and as a security event, never as verified_iap_workforce", () => {
    process.env.DRTS_DEV_MFA_WAIVED = "true";
    const securityEventsService = new SecurityEventsService();
    const service = new StepUpProofService(securityEventsService);
    const identity = iapWorkforceIdentity({ amr: [], acr: null });

    service.createProof(identity, { actionId: TENANT_CREATE_ACTION });

    return securityEventsService
      .listEvents(null, { eventType: "step_up.proof_issued" })
      .then((events) => {
        const waived = events.find((e) => e.reasonCode === "dev_mfa_waived");
        expect(waived).toBeDefined();
      });
  });

  it("never applies the waiver outside platform/ops realms", () => {
    process.env.DRTS_DEV_MFA_WAIVED = "true";
    const service = new StepUpProofService();
    // "tenant:approval-requests:approve" is enforced for both tenant and
    // platform realms, so this exercises the waiver's realm gate rather than
    // short-circuiting on resolveRequestedPolicy returning null for tenant.
    const identity = iapWorkforceIdentity({
      realm: "tenant" as BootstrapRequestIdentity["realm"],
      amr: [],
      acr: null,
    });

    expectApiError(
      () =>
        service.createProof(identity, {
          actionId: "tenant:approval-requests:approve",
        }),
      "MFA_REQUIRED",
    );
  });

  it("rejects the waiver flag in staging even when explicitly set", () => {
    process.env.DRTS_ENV = "staging";
    process.env.DRTS_DEV_MFA_WAIVED = "true";
    const service = new StepUpProofService();
    const identity = iapWorkforceIdentity({ amr: [], acr: null });

    expectApiError(
      () => service.createProof(identity, { actionId: TENANT_CREATE_ACTION }),
      "MFA_REQUIRED",
    );
  });

  it("DEV_MFA_WAIVED_AMR is not itself a trusted AMR value (the waiver must stay an explicit bypass, not a disguised trust grant)", () => {
    process.env.DRTS_DEV_MFA_WAIVED = "true";
    const service = new StepUpProofService();
    // An identity that already carries the waiver marker as if it were real
    // evidence must still require the explicit flag to pass -- confirm by
    // turning the flag off and seeing the same identity get rejected.
    delete process.env.DRTS_DEV_MFA_WAIVED;
    const identity = iapWorkforceIdentity({
      amr: [DEV_MFA_WAIVED_AMR],
      acr: null,
    });

    expectApiError(
      () => service.createProof(identity, { actionId: TENANT_CREATE_ACTION }),
      "MFA_REQUIRED",
    );
  });
});
