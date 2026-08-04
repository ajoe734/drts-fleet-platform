/**
 * IAM-MFA-001 — request-time enforcement and the server-owned proof store.
 *
 * Acceptance covered here:
 *  - stable MFA_REQUIRED / STEP_UP_REQUIRED errors at the request boundary
 *  - client MFA booleans in headers or bodies cannot satisfy policy
 *  - proof is single-use and bound to principal + session + action
 *  - allow and deny paths both emit canonical audit / security events
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SECURITY_EVENT_MATRIX } from "../../apps/api/src/common/audit/security-event-matrix";
import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import {
  StepUpGuard,
  resolveStepUpEnforcementMode,
} from "../../apps/api/src/common/auth/step-up.guard";
import { StepUpProofService } from "../../apps/api/src/modules/identity/step-up-proof.service";
import type { BootstrapRequestIdentity } from "../../apps/api/src/common/auth/auth.types";

const EXPORT_ROUTE = "/api/platform-admin/multi-taxi-trip-records/export-jobs";
const EXPORT_ACTION = "compliance.multi_taxi_records.export";
const PRINCIPAL_ID = "principal_platform_001";
const SESSION_ID = "sid_platform_001";

interface RecordedEvent {
  eventType: string;
  outcome: string;
  reasonCode: string | null;
  targetId: string | null;
  authMethods: string[];
  sessionId: string | null;
}

function makeSecurityEventsService() {
  const events: RecordedEvent[] = [];
  return {
    events,
    service: {
      recordEvent: (input: Record<string, unknown>) => {
        events.push({
          eventType: input.eventType as string,
          outcome: input.outcome as string,
          reasonCode: (input.reasonCode as string | null) ?? null,
          targetId: (input.targetId as string | null) ?? null,
          authMethods: (input.authMethods as string[]) ?? [],
          sessionId: (input.sessionId as string | null) ?? null,
        });
        return {} as never;
      },
    },
  };
}

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

function makeContext(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    method: "POST",
    originalUrl: EXPORT_ROUTE,
    headers: {},
    body: {},
    identity: workforceIdentity(),
    ...overrides,
  };
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
  throw new Error(`Expected the guard to throw ${code}`);
}

describe("IAM-MFA-001 enforcement mode", () => {
  it("is strict in production and staging regardless of the override", () => {
    expect(
      resolveStepUpEnforcementMode({
        DRTS_ENV: "production",
        IAM_STEP_UP_ENFORCEMENT: "off",
      } as NodeJS.ProcessEnv),
    ).toBe("strict");
    expect(
      resolveStepUpEnforcementMode({
        DRTS_ENV: "staging",
        IAM_STEP_UP_ENFORCEMENT: "verified_sessions_only",
      } as NodeJS.ProcessEnv),
    ).toBe("strict");
  });

  it("defaults to verified-session enforcement locally and can be raised", () => {
    expect(
      resolveStepUpEnforcementMode({ DRTS_ENV: "local" } as NodeJS.ProcessEnv),
    ).toBe("verified_sessions_only");
    expect(
      resolveStepUpEnforcementMode({
        DRTS_ENV: "local",
        IAM_STEP_UP_ENFORCEMENT: "strict",
      } as NodeJS.ProcessEnv),
    ).toBe("strict");
  });
});

describe("IAM-MFA-001 step-up guard", () => {
  let proofService: StepUpProofService;
  let recorder: ReturnType<typeof makeSecurityEventsService>;
  let guard: StepUpGuard;

  beforeEach(() => {
    vi.stubEnv("DRTS_ENV", "test");
    vi.stubEnv("IAM_STEP_UP_ENFORCEMENT", "strict");
    proofService = new StepUpProofService();
    recorder = makeSecurityEventsService();
    guard = new StepUpGuard(proofService, recorder.service as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function issueProof(overrides: Record<string, unknown> = {}) {
    return proofService.recordVerifiedProof({
      principalId: PRINCIPAL_ID,
      sessionId: SESSION_ID,
      actionId: EXPORT_ACTION,
      authMethods: ["verified_iap_workforce"],
      evidenceSource: "workforce_proxy",
      ...overrides,
    } as never);
  }

  it("lets non-privileged routes through without emitting events", () => {
    const request = makeRequest({
      method: "GET",
      originalUrl: "/api/identity/context",
    });

    expect(guard.canActivate(makeContext(request))).toBe(true);
    expect(recorder.events).toEqual([]);
  });

  it("denies a privileged action with no step-up proof and records the event", () => {
    const request = makeRequest();

    const details = expectApiError(
      () => guard.canActivate(makeContext(request)),
      "STEP_UP_REQUIRED",
    );

    expect(details.actionId).toBe(EXPORT_ACTION);
    expect(details.reasonCode).toBe("BOUND_PROOF_REQUIRED");
    expect(details.freshnessSeconds).toBe(600);
    expect(recorder.events).toHaveLength(1);
    expect(recorder.events[0]).toMatchObject({
      eventType: "mfa.step_up_denied",
      outcome: "denied",
      targetId: EXPORT_ACTION,
      reasonCode: "BOUND_PROOF_REQUIRED",
    });
  });

  it("returns MFA_REQUIRED when the principal never proved a trusted factor", () => {
    const request = makeRequest({
      identity: workforceIdentity({ amr: [], acr: null }),
    });

    const details = expectApiError(
      () => guard.canActivate(makeContext(request)),
      "MFA_REQUIRED",
    );
    expect(details.reasonCode).toBe("NO_TRUSTED_AUTH_METHOD");
  });

  it("never leaks which evidence the principal already holds", () => {
    const request = makeRequest();
    const details = expectApiError(
      () => guard.canActivate(makeContext(request)),
      "STEP_UP_REQUIRED",
    );

    expect(Object.keys(details).sort()).toEqual([
      "acceptedAuthMethods",
      "actionId",
      "freshnessSeconds",
      "method",
      "reasonCode",
      "requiredAssurance",
      "riskTier",
      "route",
    ]);
  });

  it("ignores client MFA booleans in headers and bodies", () => {
    const request = makeRequest({
      headers: {
        "x-mfa-verified": "true",
        "x-drts-mfa": "1",
      },
      body: {
        mfaVerified: true,
        mfa: { verified: true, methods: ["webauthn"] },
        amr: ["webauthn"],
        acr: "aal3",
      },
    });

    expectApiError(
      () => guard.canActivate(makeContext(request)),
      "STEP_UP_REQUIRED",
    );
  });

  it("accepts a fresh proof supplied through the step-up header", () => {
    const proof = issueProof();
    const request = makeRequest({
      headers: { "x-drts-step-up-proof": proof.proofId },
    });

    expect(guard.canActivate(makeContext(request))).toBe(true);
    expect(recorder.events.at(-1)).toMatchObject({
      eventType: "mfa.step_up_satisfied",
      outcome: "success",
      reasonCode: "STEP_UP_PROOF_FRESH",
      sessionId: SESSION_ID,
    });
  });

  it("accepts a proof supplied through the mutation stepUpReference field", () => {
    const proof = issueProof();
    const request = makeRequest({
      body: {
        mutation: { reasonCode: "audit", stepUpReference: proof.proofId },
      },
    });

    expect(guard.canActivate(makeContext(request))).toBe(true);
  });

  it("burns the proof so a replay of the same reference fails", () => {
    const proof = issueProof();
    const first = makeRequest({
      headers: { "x-drts-step-up-proof": proof.proofId },
    });
    expect(guard.canActivate(makeContext(first))).toBe(true);

    const replay = makeRequest({
      headers: { "x-drts-step-up-proof": proof.proofId },
    });
    const details = expectApiError(
      () => guard.canActivate(makeContext(replay)),
      "STEP_UP_REQUIRED",
    );
    expect(details.reasonCode).toBe("STEP_UP_PROOF_ALREADY_CONSUMED");
  });

  it("rejects a proof bound to another session", () => {
    const proof = issueProof({ sessionId: "sid_other" });
    const request = makeRequest({
      headers: { "x-drts-step-up-proof": proof.proofId },
    });

    const details = expectApiError(
      () => guard.canActivate(makeContext(request)),
      "STEP_UP_REQUIRED",
    );
    expect(details.reasonCode).toBe("STEP_UP_PROOF_SESSION_MISMATCH");
  });

  it("rejects a proof raised for a different action", () => {
    const proof = issueProof({ actionId: "platform.access_review.decide" });
    const request = makeRequest({
      headers: { "x-drts-step-up-proof": proof.proofId },
    });

    const details = expectApiError(
      () => guard.canActivate(makeContext(request)),
      "STEP_UP_REQUIRED",
    );
    expect(details.reasonCode).toBe("STEP_UP_PROOF_ACTION_MISMATCH");
  });

  it("rejects an unknown proof reference", () => {
    const request = makeRequest({
      headers: { "x-drts-step-up-proof": "stepup_does_not_exist" },
    });

    const details = expectApiError(
      () => guard.canActivate(makeContext(request)),
      "STEP_UP_REQUIRED",
    );
    expect(details.reasonCode).toBe("STEP_UP_PROOF_UNKNOWN");
  });

  it("denies a bootstrap fixture identity under strict enforcement", () => {
    const request = makeRequest({
      identity: workforceIdentity({
        authMode: "bootstrap_headers",
        amr: ["webauthn"],
        acr: "aal3",
      }),
    });

    const details = expectApiError(
      () => guard.canActivate(makeContext(request)),
      "MFA_REQUIRED",
    );
    expect(details.reasonCode).toBe("UNTRUSTED_AUTH_MODE");
  });

  it("records an explicit event when a local fixture identity is not enforced", () => {
    vi.stubEnv("IAM_STEP_UP_ENFORCEMENT", "verified_sessions_only");
    const request = makeRequest({
      identity: workforceIdentity({ authMode: "bootstrap_headers" }),
    });

    expect(guard.canActivate(makeContext(request))).toBe(true);
    expect(recorder.events).toEqual([
      expect.objectContaining({
        eventType: "mfa.step_up_not_enforced",
        outcome: "success",
        reasonCode: "FIXTURE_BOOTSTRAP_IDENTITY",
      }),
    ]);
  });

  it("still enforces verified-token identities in the relaxed local mode", () => {
    vi.stubEnv("IAM_STEP_UP_ENFORCEMENT", "verified_sessions_only");
    const request = makeRequest();

    expectApiError(
      () => guard.canActivate(makeContext(request)),
      "STEP_UP_REQUIRED",
    );
  });

  it("does not let a failing security-event sink block the decision", () => {
    const throwingGuard = new StepUpGuard(proofService, {
      recordEvent: () => {
        throw new Error("sink down");
      },
    } as never);
    const proof = issueProof();

    expect(
      throwingGuard.canActivate(
        makeContext(
          makeRequest({ headers: { "x-drts-step-up-proof": proof.proofId } }),
        ),
      ),
    ).toBe(true);
  });

  it("registers every emitted event type in the canonical security event matrix", () => {
    const emitted = [
      "mfa.step_up_denied",
      "mfa.step_up_satisfied",
      "mfa.step_up_not_enforced",
    ];

    for (const eventType of emitted) {
      const entry = SECURITY_EVENT_MATRIX.find(
        (candidate) => candidate.eventType === eventType,
      );
      expect(entry, `${eventType} must be declared`).toBeDefined();
      expect(entry?.eventFamily).toBe("policy");
      expect(entry?.privileged).toBe(true);
    }
  });
});

describe("IAM-MFA-001 step-up proof store", () => {
  let proofService: StepUpProofService;

  beforeEach(() => {
    proofService = new StepUpProofService();
  });

  it("derives assurance and expiry from the policy, not from the caller", () => {
    const proof = proofService.recordVerifiedProof({
      principalId: PRINCIPAL_ID,
      sessionId: SESSION_ID,
      actionId: EXPORT_ACTION,
      authMethods: ["verified_iap_workforce"],
      evidenceSource: "workforce_proxy",
      verifiedAt: "2026-08-04T12:00:00.000Z",
    });

    expect(proof.assurance).toBe("aal2");
    expect(proof.expiresAt).toBe("2026-08-04T12:10:00.000Z");
    expect(proof.consumedAt).toBeNull();
    expect(proof.proofId.startsWith("stepup_")).toBe(true);
  });

  it("refuses to mint a proof from untrusted evidence", () => {
    expect(() =>
      proofService.recordVerifiedProof({
        principalId: PRINCIPAL_ID,
        sessionId: SESSION_ID,
        actionId: EXPORT_ACTION,
        authMethods: ["client_mfa_flag"],
        evidenceSource: "idp_claim",
      }),
    ).toThrow(ApiRequestError);
  });

  it("refuses to mint a weak proof for a phishing-resistant action", () => {
    expect(() =>
      proofService.recordVerifiedProof({
        principalId: PRINCIPAL_ID,
        sessionId: SESSION_ID,
        actionId: "platform.break_glass.approve",
        authMethods: ["otp"],
        evidenceSource: "idp_claim",
      }),
    ).toThrow(ApiRequestError);
  });

  it("refuses to mint a proof for an undeclared action", () => {
    expect(() =>
      proofService.recordVerifiedProof({
        principalId: PRINCIPAL_ID,
        sessionId: SESSION_ID,
        actionId: "not.a.declared.action",
        authMethods: ["webauthn"],
        evidenceSource: "idp_claim",
      }),
    ).toThrow(ApiRequestError);
  });

  it("refuses to mint an unbound proof", () => {
    expect(() =>
      proofService.recordVerifiedProof({
        principalId: PRINCIPAL_ID,
        sessionId: "   ",
        actionId: EXPORT_ACTION,
        authMethods: ["webauthn"],
        evidenceSource: "idp_claim",
      }),
    ).toThrow(ApiRequestError);
  });

  it("consumes a proof exactly once", () => {
    const proof = proofService.recordVerifiedProof({
      principalId: PRINCIPAL_ID,
      sessionId: SESSION_ID,
      actionId: EXPORT_ACTION,
      authMethods: ["webauthn"],
      evidenceSource: "idp_claim",
    });

    expect(proofService.consumeProof(proof.proofId)?.consumedAt).toBeTruthy();
    expect(proofService.consumeProof(proof.proofId)).toBeNull();
    expect(proofService.findProof(proof.proofId)?.consumedAt).toBeTruthy();
  });

  it("returns nothing for a blank or unknown reference", () => {
    expect(proofService.findProof(null)).toBeNull();
    expect(proofService.findProof("  ")).toBeNull();
    expect(proofService.findProof("stepup_missing")).toBeNull();
  });
});
