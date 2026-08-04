/**
 * IAM-MFA-001 — MFA / step-up policy declaration and evaluation.
 *
 * Acceptance covered here:
 *  - every privileged action has a declared step-up rule
 *  - client-asserted MFA can never satisfy the policy
 *  - stale, wrong-session and wrong-action proof fails
 *  - fresh trusted proof succeeds only inside the policy window
 */
import { describe, expect, it } from "vitest";

import {
  IAM_PRIVILEGED_ACTION_CATALOG,
  IAM_STAGE15_OPERATION_CATALOG,
  IAM_STEP_UP_EXEMPT_OPERATIONS,
  IAM_TRUSTED_AUTH_METHODS,
  IAM_UNTRUSTED_AUTH_METHOD_MARKERS,
  findIamPrivilegedActionRule,
  rankIamAuthAssurance,
  toIamStepUpChallenge,
  type IamPrivilegedActionRule,
  type IamStepUpProofRecord,
} from "@drts/contracts";

import {
  evaluateStepUpPolicy,
  normalizeStepUpRoutePath,
  resolvePrivilegedActionRule,
  selectAcceptedAuthMethods,
  toStepUpIdentityEvidence,
  type StepUpIdentityEvidence,
} from "../../apps/api/src/common/auth/mfa-step-up.policy";
import type { BootstrapRequestIdentity } from "../../apps/api/src/common/auth/auth.types";

const NOW = new Date("2026-08-04T12:00:00.000Z");

const PRINCIPAL_ID = "principal_platform_001";
const SESSION_ID = "sid_platform_001";

const TENANT_ROLE_RULE = findIamPrivilegedActionRule(
  "tenant.user_role.update",
) as IamPrivilegedActionRule;
const BREAK_GLASS_RULE = findIamPrivilegedActionRule(
  "platform.break_glass.approve",
) as IamPrivilegedActionRule;
const EXPORT_RULE = findIamPrivilegedActionRule(
  "compliance.multi_taxi_records.export",
) as IamPrivilegedActionRule;
const DRIVER_RULE = findIamPrivilegedActionRule(
  "driver.profile.sensitive_update",
) as IamPrivilegedActionRule;

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

function identity(
  overrides: Partial<StepUpIdentityEvidence> = {},
): StepUpIdentityEvidence {
  return {
    authMode: "jwt_bearer",
    realm: "platform",
    principalId: PRINCIPAL_ID,
    sessionId: SESSION_ID,
    authTime: minutesAgo(2),
    authMethods: ["webauthn"],
    assurance: "aal3",
    ...overrides,
  };
}

function proof(
  rule: IamPrivilegedActionRule,
  overrides: Partial<IamStepUpProofRecord> = {},
): IamStepUpProofRecord {
  const verifiedAt = overrides.verifiedAt ?? minutesAgo(1);
  return {
    proofId: "stepup_test_001",
    principalId: PRINCIPAL_ID,
    sessionId: SESSION_ID,
    actionId: rule.actionId,
    authMethods: ["webauthn"],
    assurance: "aal3",
    verifiedAt,
    expiresAt: new Date(
      Date.parse(verifiedAt) + rule.freshnessSeconds * 1000,
    ).toISOString(),
    consumedAt: null,
    createdByEvidenceSource: "idp_claim",
    ...overrides,
  };
}

describe("IAM-MFA-001 privileged action catalog", () => {
  it("declares a step-up rule for every privileged stage-1.5 operation", () => {
    const readMethods = new Set(["get", "head", "options"]);
    const exemptOperationIds = new Set(
      IAM_STEP_UP_EXEMPT_OPERATIONS.map((entry) => entry.operationId),
    );

    const uncovered = IAM_STAGE15_OPERATION_CATALOG.filter((operation) => {
      if (readMethods.has(operation.method)) {
        return false;
      }
      if (exemptOperationIds.has(operation.operationId)) {
        return false;
      }
      return (
        resolvePrivilegedActionRule(operation.method, operation.path) === null
      );
    }).map((operation) => operation.operationId);

    expect(uncovered).toEqual([]);
  });

  it("gives every exemption a stated reason and no overlapping rule", () => {
    for (const exemption of IAM_STEP_UP_EXEMPT_OPERATIONS) {
      expect(exemption.reason.length).toBeGreaterThan(20);

      const operation = IAM_STAGE15_OPERATION_CATALOG.find(
        (candidate) => candidate.operationId === exemption.operationId,
      );
      expect(operation).toBeDefined();
      expect(
        resolvePrivilegedActionRule(operation!.method, operation!.path),
      ).toBeNull();
    }
  });

  it("keeps action ids unique and every rule internally consistent", () => {
    const actionIds = IAM_PRIVILEGED_ACTION_CATALOG.map(
      (rule) => rule.actionId,
    );
    expect(new Set(actionIds).size).toBe(actionIds.length);

    for (const rule of IAM_PRIVILEGED_ACTION_CATALOG) {
      expect(rule.methods.length).toBeGreaterThan(0);
      expect(rule.realms.length).toBeGreaterThan(0);
      expect(rule.acceptedAuthMethods.length).toBeGreaterThan(0);
      expect(rule.freshnessSeconds).toBeGreaterThan(0);
      // §7.2 caps step-up freshness at 15 minutes for every listed row.
      expect(rule.freshnessSeconds).toBeLessThanOrEqual(900);
      expect(rule.policyRef).toMatch(/hardening-plan/);

      // Every accepted method must exist in the trusted registry, otherwise the
      // rule declares evidence that can never be presented.
      for (const method of rule.acceptedAuthMethods) {
        expect(
          IAM_TRUSTED_AUTH_METHODS.some((entry) => entry.method === method),
        ).toBe(true);
      }

      // At least one accepted method must reach the required assurance.
      const reachable = rule.acceptedAuthMethods.some((method) => {
        const trusted = IAM_TRUSTED_AUTH_METHODS.find(
          (entry) => entry.method === method,
        );
        return (
          rankIamAuthAssurance(trusted?.assurance) >=
          rankIamAuthAssurance(rule.minimumAssurance)
        );
      });
      expect(reachable).toBe(true);

      if (rule.requiresPhishingResistant) {
        expect(
          rule.acceptedAuthMethods.every((method) =>
            IAM_TRUSTED_AUTH_METHODS.some(
              (entry) => entry.method === method && entry.phishingResistant,
            ),
          ),
        ).toBe(true);
      }
    }
  });

  it("never lists an untrusted marker as accepted evidence", () => {
    for (const rule of IAM_PRIVILEGED_ACTION_CATALOG) {
      for (const marker of IAM_UNTRUSTED_AUTH_METHOD_MARKERS) {
        expect(rule.acceptedAuthMethods).not.toContain(marker);
      }
    }
  });

  it("exposes a client-safe challenge without leaking held evidence", () => {
    const challenge = toIamStepUpChallenge(TENANT_ROLE_RULE);
    expect(challenge).toEqual({
      actionId: "tenant.user_role.update",
      requiredAssurance: "aal2",
      acceptedAuthMethods: TENANT_ROLE_RULE.acceptedAuthMethods,
      freshnessSeconds: 900,
      riskTier: "critical",
    });
  });
});

describe("IAM-MFA-001 route resolution", () => {
  it("normalizes api prefix, query string and trailing slashes", () => {
    expect(normalizeStepUpRoutePath("/api/tenant/api-keys?foo=1")).toBe(
      "tenant/api-keys",
    );
    expect(normalizeStepUpRoutePath("///api//tenant/api-keys/")).toBe(
      "tenant/api-keys",
    );
  });

  it("matches parameterized routes segment by segment", () => {
    const rule = resolvePrivilegedActionRule(
      "POST",
      "/api/tenant/users/user-42/role",
    );
    expect(rule?.actionId).toBe("tenant.user_role.update");
  });

  it("does not match a longer or shorter path against the same pattern", () => {
    expect(
      resolvePrivilegedActionRule(
        "POST",
        "/api/tenant/users/user-42/role/extra",
      ),
    ).toBeNull();
    expect(
      resolvePrivilegedActionRule("POST", "/api/tenant/users/role"),
    ).toBeNull();
  });

  it("does not match a read method on a privileged write route", () => {
    expect(
      resolvePrivilegedActionRule("GET", "/api/tenant/api-keys"),
    ).toBeNull();
  });

  it("narrows shared routes by caller realm", () => {
    // Ops remote revoke is the privileged action; a driver revoking their own
    // device on the same route is not.
    expect(
      resolvePrivilegedActionRule(
        "POST",
        "/api/auth/driver/device/revoke",
        "ops",
      )?.actionId,
    ).toBe("ops.driver_device.remote_revoke");
    expect(
      resolvePrivilegedActionRule(
        "POST",
        "/api/auth/driver/device/revoke",
        "driver",
      ),
    ).toBeNull();
  });

  it("returns nothing for routes outside the catalog", () => {
    expect(resolvePrivilegedActionRule("POST", "/api/orders")).toBeNull();
    expect(
      resolvePrivilegedActionRule("GET", "/api/identity/context"),
    ).toBeNull();
  });
});

describe("IAM-MFA-001 identity projection", () => {
  it("reads only server-projected claim fields from the request identity", () => {
    const requestIdentity = {
      authMode: "jwt_bearer",
      actorType: "platform_admin",
      actorId: "actor-1",
      principalId: PRINCIPAL_ID,
      realm: "platform",
      tenantId: null,
      sessionId: SESSION_ID,
      authTime: minutesAgo(1),
      amr: ["webauthn"],
      acr: "aal3",
      roleFamilies: [],
      roles: [],
      scopes: [],
      requestId: null,
    } as unknown as BootstrapRequestIdentity;

    expect(toStepUpIdentityEvidence(requestIdentity)).toEqual({
      authMode: "jwt_bearer",
      realm: "platform",
      principalId: PRINCIPAL_ID,
      sessionId: SESSION_ID,
      authTime: requestIdentity.authTime,
      authMethods: ["webauthn"],
      assurance: "aal3",
    });
  });

  it("projects a bootstrap-header identity with no authentication evidence", () => {
    const bootstrapIdentity = {
      authMode: "bootstrap_headers",
      actorType: "platform_admin",
      actorId: "actor-1",
      realm: "platform",
      tenantId: null,
      roleFamilies: [],
      roles: [],
      scopes: [],
      requestId: null,
    } as unknown as BootstrapRequestIdentity;

    const evidence = toStepUpIdentityEvidence(bootstrapIdentity);
    expect(evidence?.authMethods).toEqual([]);
    expect(evidence?.assurance).toBeNull();
    expect(evidence?.authTime).toBeNull();
  });
});

describe("IAM-MFA-001 client-asserted MFA is never sufficient", () => {
  it("rejects every enumerated untrusted marker", () => {
    for (const marker of IAM_UNTRUSTED_AUTH_METHOD_MARKERS) {
      const decision = evaluateStepUpPolicy({
        rule: TENANT_ROLE_RULE,
        identity: identity({
          realm: "tenant",
          authMethods: [marker],
          assurance: "aal3",
        }),
        now: NOW,
      });

      expect(decision.outcome).toBe("mfa_required");
      expect(decision.errorCode).toBe("MFA_REQUIRED");
      expect(decision.reasonCode).toBe("UNTRUSTED_AUTH_METHOD");
      expect(decision.satisfiedByAuthMethods).toEqual([]);
    }
  });

  it("drops untrusted markers even when a trusted method is also present", () => {
    expect(
      selectAcceptedAuthMethods(TENANT_ROLE_RULE, [
        "client_mfa_flag",
        "mfa",
        "totally_made_up",
      ]),
    ).toEqual(["mfa"]);
  });

  it("rejects a bootstrap-header identity that self-asserts strong claims", () => {
    const decision = evaluateStepUpPolicy({
      rule: TENANT_ROLE_RULE,
      identity: identity({
        authMode: "bootstrap_headers",
        realm: "tenant",
        authMethods: ["webauthn"],
        assurance: "aal3",
      }),
      now: NOW,
    });

    expect(decision.outcome).toBe("mfa_required");
    expect(decision.reasonCode).toBe("UNTRUSTED_AUTH_MODE");
  });

  it("rejects a partner API key identity regardless of claims", () => {
    const decision = evaluateStepUpPolicy({
      rule: TENANT_ROLE_RULE,
      identity: identity({
        authMode: "partner_api_key",
        realm: "tenant",
        authMethods: ["mfa"],
        assurance: "aal2",
      }),
      now: NOW,
    });

    expect(decision.reasonCode).toBe("UNTRUSTED_AUTH_MODE");
  });

  it("rejects a high acr claim carried over a weak factor", () => {
    // SMS is a permitted transitional fallback but only reaches aal1, so an
    // IdP echoing acr=aal3 over SMS gains nothing.
    const smsRule: IamPrivilegedActionRule = {
      ...TENANT_ROLE_RULE,
      acceptedAuthMethods: [...TENANT_ROLE_RULE.acceptedAuthMethods, "sms"],
    };

    const decision = evaluateStepUpPolicy({
      rule: smsRule,
      identity: identity({
        realm: "tenant",
        authMethods: ["sms"],
        assurance: "aal3",
      }),
      now: NOW,
    });

    expect(decision.outcome).toBe("mfa_required");
    expect(decision.reasonCode).toBe("INSUFFICIENT_ASSURANCE");
  });

  it("rejects a trusted method that this action does not accept", () => {
    const decision = evaluateStepUpPolicy({
      rule: BREAK_GLASS_RULE,
      identity: identity({ authMethods: ["otp"], assurance: "aal3" }),
      now: NOW,
    });

    expect(decision.outcome).toBe("mfa_required");
    expect(decision.reasonCode).toBe("UNTRUSTED_AUTH_METHOD");
  });

  it("requires no identity at all to fail closed", () => {
    const decision = evaluateStepUpPolicy({
      rule: TENANT_ROLE_RULE,
      identity: null,
      now: NOW,
    });

    expect(decision.outcome).toBe("mfa_required");
    expect(decision.reasonCode).toBe("MISSING_IDENTITY");
  });

  it("fails closed when the session carries no auth_time", () => {
    const decision = evaluateStepUpPolicy({
      rule: EXPORT_RULE,
      identity: identity({ authTime: null }),
      now: NOW,
    });

    expect(decision.outcome).toBe("mfa_required");
    expect(decision.reasonCode).toBe("MISSING_AUTH_TIME");
  });
});

describe("IAM-MFA-001 bound step-up proof", () => {
  it("requires a bound proof even when the session login is fresh", () => {
    const decision = evaluateStepUpPolicy({
      rule: EXPORT_RULE,
      identity: identity({ authTime: minutesAgo(1) }),
      now: NOW,
    });

    expect(decision.outcome).toBe("step_up_required");
    expect(decision.errorCode).toBe("STEP_UP_REQUIRED");
    expect(decision.reasonCode).toBe("BOUND_PROOF_REQUIRED");
  });

  it("accepts a fresh proof bound to this principal, session and action", () => {
    const decision = evaluateStepUpPolicy({
      rule: EXPORT_RULE,
      identity: identity(),
      proof: proof(EXPORT_RULE, { verifiedAt: minutesAgo(1) }),
      now: NOW,
    });

    expect(decision.outcome).toBe("allow");
    expect(decision.reasonCode).toBe("STEP_UP_PROOF_FRESH");
    expect(decision.satisfiedByAuthMethods).toEqual(["webauthn"]);
    expect(decision.evidenceAgeSeconds).toBe(60);
  });

  it("accepts a proof at the exact policy window boundary and rejects one second past it", () => {
    const windowMinutes = EXPORT_RULE.freshnessSeconds / 60;

    const atBoundary = evaluateStepUpPolicy({
      rule: EXPORT_RULE,
      identity: identity(),
      proof: proof(EXPORT_RULE, { verifiedAt: minutesAgo(windowMinutes) }),
      now: NOW,
    });
    // The stored expiry lands exactly on `now`, and an expired proof is unusable.
    expect(atBoundary.outcome).toBe("step_up_required");
    expect(atBoundary.reasonCode).toBe("STEP_UP_PROOF_STALE");

    const insideWindow = evaluateStepUpPolicy({
      rule: EXPORT_RULE,
      identity: identity(),
      proof: proof(EXPORT_RULE, {
        verifiedAt: new Date(
          NOW.getTime() - EXPORT_RULE.freshnessSeconds * 1000 + 1000,
        ).toISOString(),
      }),
      now: NOW,
    });
    expect(insideWindow.outcome).toBe("allow");

    const pastWindow = evaluateStepUpPolicy({
      rule: EXPORT_RULE,
      identity: identity(),
      proof: proof(EXPORT_RULE, {
        verifiedAt: new Date(
          NOW.getTime() - EXPORT_RULE.freshnessSeconds * 1000 - 1000,
        ).toISOString(),
      }),
      now: NOW,
    });
    expect(pastWindow.outcome).toBe("step_up_required");
    expect(pastWindow.reasonCode).toBe("STEP_UP_PROOF_STALE");
  });

  it("rejects a stale proof", () => {
    const decision = evaluateStepUpPolicy({
      rule: EXPORT_RULE,
      identity: identity(),
      proof: proof(EXPORT_RULE, { verifiedAt: minutesAgo(30) }),
      now: NOW,
    });

    expect(decision.outcome).toBe("step_up_required");
    expect(decision.reasonCode).toBe("STEP_UP_PROOF_STALE");
  });

  it("rejects a proof dated in the future", () => {
    const decision = evaluateStepUpPolicy({
      rule: EXPORT_RULE,
      identity: identity(),
      proof: proof(EXPORT_RULE, { verifiedAt: minutesAgo(-5) }),
      now: NOW,
    });

    expect(decision.outcome).toBe("step_up_required");
    expect(decision.reasonCode).toBe("STEP_UP_PROOF_STALE");
  });

  it("rejects a proof whose stored expiry already passed even if verifiedAt looks fresh", () => {
    const decision = evaluateStepUpPolicy({
      rule: EXPORT_RULE,
      identity: identity(),
      proof: proof(EXPORT_RULE, {
        verifiedAt: minutesAgo(1),
        expiresAt: minutesAgo(1),
      }),
      now: NOW,
    });

    expect(decision.reasonCode).toBe("STEP_UP_PROOF_STALE");
  });

  it("rejects a proof issued for another session", () => {
    const decision = evaluateStepUpPolicy({
      rule: EXPORT_RULE,
      identity: identity(),
      proof: proof(EXPORT_RULE, { sessionId: "sid_other_session" }),
      now: NOW,
    });

    expect(decision.outcome).toBe("step_up_required");
    expect(decision.reasonCode).toBe("STEP_UP_PROOF_SESSION_MISMATCH");
  });

  it("rejects a proof issued for another principal", () => {
    const decision = evaluateStepUpPolicy({
      rule: EXPORT_RULE,
      identity: identity(),
      proof: proof(EXPORT_RULE, { principalId: "principal_other" }),
      now: NOW,
    });

    expect(decision.reasonCode).toBe("STEP_UP_PROOF_PRINCIPAL_MISMATCH");
  });

  it("rejects a proof raised for a different action", () => {
    const decision = evaluateStepUpPolicy({
      rule: EXPORT_RULE,
      identity: identity(),
      proof: proof(EXPORT_RULE, {
        actionId: "platform.access_review.decide",
      }),
      now: NOW,
    });

    expect(decision.reasonCode).toBe("STEP_UP_PROOF_ACTION_MISMATCH");
  });

  it("rejects a proof that was already consumed", () => {
    const decision = evaluateStepUpPolicy({
      rule: EXPORT_RULE,
      identity: identity(),
      proof: proof(EXPORT_RULE, { consumedAt: minutesAgo(1) }),
      now: NOW,
    });

    expect(decision.reasonCode).toBe("STEP_UP_PROOF_ALREADY_CONSUMED");
  });

  it("rejects a proof whose recorded methods are not trusted", () => {
    const decision = evaluateStepUpPolicy({
      rule: EXPORT_RULE,
      identity: identity(),
      proof: proof(EXPORT_RULE, { authMethods: ["client_mfa_flag"] }),
      now: NOW,
    });

    expect(decision.reasonCode).toBe("STEP_UP_PROOF_METHOD_UNTRUSTED");
  });

  it("rejects a proof whose assurance is below the rule minimum", () => {
    const decision = evaluateStepUpPolicy({
      rule: EXPORT_RULE,
      identity: identity(),
      proof: proof(EXPORT_RULE, {
        authMethods: ["mfa"],
        assurance: "aal1",
      }),
      now: NOW,
    });

    expect(decision.reasonCode).toBe("STEP_UP_PROOF_ASSURANCE_INSUFFICIENT");
  });

  it("rejects a non-phishing-resistant proof for break-glass approval", () => {
    const decision = evaluateStepUpPolicy({
      rule: BREAK_GLASS_RULE,
      identity: identity(),
      proof: proof(BREAK_GLASS_RULE, {
        authMethods: ["otp"],
        assurance: "aal2",
      }),
      now: NOW,
    });

    expect(decision.outcome).toBe("step_up_required");
    expect(decision.reasonCode).toBe("STEP_UP_PROOF_METHOD_UNTRUSTED");
  });

  it("reports an unresolvable proof reference distinctly from a missing one", () => {
    const unknown = evaluateStepUpPolicy({
      rule: EXPORT_RULE,
      identity: identity(),
      proof: null,
      proofReferencePresented: true,
      now: NOW,
    });
    expect(unknown.reasonCode).toBe("STEP_UP_PROOF_UNKNOWN");

    const missing = evaluateStepUpPolicy({
      rule: EXPORT_RULE,
      identity: identity({ authTime: minutesAgo(45) }),
      proof: null,
      proofReferencePresented: false,
      now: NOW,
    });
    expect(missing.reasonCode).toBe("STEP_UP_PROOF_MISSING");
  });

  it("accepts a driver device proof for the driver row without raising session assurance", () => {
    const decision = evaluateStepUpPolicy({
      rule: DRIVER_RULE,
      identity: identity({
        realm: "driver",
        authMethods: ["driver_device_proof"],
        assurance: "aal1",
      }),
      proof: proof(DRIVER_RULE, {
        authMethods: ["driver_device_proof"],
        assurance: "aal2",
      }),
      now: NOW,
    });

    expect(decision.outcome).toBe("allow");
    expect(decision.reasonCode).toBe("STEP_UP_PROOF_FRESH");
  });
});

describe("IAM-MFA-001 session-freshness rules", () => {
  // Rules that do not demand a bound proof may be satisfied by a recent login,
  // which is the shape the tenant/partner rollout rows allow.
  const sessionOnlyRule: IamPrivilegedActionRule = {
    ...TENANT_ROLE_RULE,
    requiresBoundProof: false,
  };

  it("allows a login inside the freshness window", () => {
    const decision = evaluateStepUpPolicy({
      rule: sessionOnlyRule,
      identity: identity({ realm: "tenant", authTime: minutesAgo(14) }),
      now: NOW,
    });

    expect(decision.outcome).toBe("allow");
    expect(decision.reasonCode).toBe("SESSION_AUTH_FRESH");
  });

  it("demands step-up once the login falls outside the window", () => {
    const decision = evaluateStepUpPolicy({
      rule: sessionOnlyRule,
      identity: identity({ realm: "tenant", authTime: minutesAgo(16) }),
      now: NOW,
    });

    expect(decision.outcome).toBe("step_up_required");
    expect(decision.reasonCode).toBe("SESSION_AUTH_STALE");
  });

  it("still accepts a fresh bound proof after the login went stale", () => {
    const decision = evaluateStepUpPolicy({
      rule: sessionOnlyRule,
      identity: identity({ realm: "tenant", authTime: minutesAgo(120) }),
      proof: proof(sessionOnlyRule, { verifiedAt: minutesAgo(2) }),
      now: NOW,
    });

    expect(decision.outcome).toBe("allow");
    expect(decision.reasonCode).toBe("STEP_UP_PROOF_FRESH");
  });
});
