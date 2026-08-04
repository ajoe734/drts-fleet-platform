/**
 * IAM-MFA-001 — server-owned MFA / step-up evaluation.
 *
 * The declaration (which actions are privileged, which evidence is trusted,
 * how fresh it must be) lives in `@drts/contracts`. This module turns a request
 * into a decision using *only* server-owned inputs:
 *
 *  - the canonical request identity projected from a verified token, and
 *  - a step-up proof record the server itself created and stored.
 *
 * Nothing else participates. A request body, header or query flag claiming
 * "mfa: true" is never read here, and any `amr` value outside the trusted
 * registry is dropped before evaluation.
 */
import {
  findIamTrustedAuthMethod,
  IAM_PRIVILEGED_ACTION_CATALOG,
  rankIamAuthAssurance,
  type IamAuthAssuranceLevel,
  type IamPrivilegedActionRule,
  type IamStepUpDecision,
  type IamStepUpProofRecord,
  type IamStepUpRealm,
} from "@drts/contracts";

import type { BootstrapRequestIdentity } from "./auth.types";

/** Identity fields the policy is allowed to look at. */
export interface StepUpIdentityEvidence {
  authMode: string | null;
  realm: string | null;
  principalId: string | null;
  sessionId: string | null;
  authTime: string | null;
  authMethods: readonly string[];
  assurance: string | null;
}

export interface EvaluateStepUpPolicyInput {
  rule: IamPrivilegedActionRule;
  identity: StepUpIdentityEvidence | null;
  /** Server-stored proof resolved from an opaque reference, when one was sent. */
  proof?: IamStepUpProofRecord | null;
  /** True when a reference was supplied but no stored proof matched it. */
  proofReferencePresented?: boolean;
  now: Date;
}

const NO_ACTION_DECISION: IamStepUpDecision = {
  outcome: "allow",
  reasonCode: "NO_PRIVILEGED_ACTION",
  actionId: null,
  errorCode: null,
  requiredAssurance: null,
  acceptedAuthMethods: [],
  freshnessSeconds: null,
  satisfiedByAuthMethods: [],
  evidenceAgeSeconds: null,
};

export function normalizeStepUpRoutePath(url: string): string {
  const withoutQuery = url.split("?", 1)[0] ?? url;
  return withoutQuery
    .replace(/^\/+/, "")
    .replace(/^api\/+/, "")
    .replace(/\/+$/, "");
}

function matchesRoutePattern(routePath: string, routePattern: string): boolean {
  const pathSegments = routePath.split("/");
  const patternSegments = routePattern.split("/");

  if (pathSegments.length !== patternSegments.length) {
    return false;
  }

  return patternSegments.every((patternSegment, index) => {
    const pathSegment = pathSegments[index];
    if (!pathSegment) {
      return false;
    }
    if (patternSegment.startsWith(":")) {
      return true;
    }
    return patternSegment === pathSegment;
  });
}

/**
 * Resolve the privileged action for a request. `realm` narrows rules that only
 * apply to some callers — a driver revoking their own device is not the same
 * action as ops remotely revoking it, even though the route is shared.
 */
export function resolvePrivilegedActionRule(
  method: string,
  url: string,
  realm?: string | null,
): IamPrivilegedActionRule | null {
  const upperMethod = method.toUpperCase();
  const routePath = normalizeStepUpRoutePath(url);

  return (
    IAM_PRIVILEGED_ACTION_CATALOG.find((rule) => {
      if (!rule.methods.includes(upperMethod)) {
        return false;
      }
      if (!matchesRoutePattern(routePath, rule.routePattern)) {
        return false;
      }
      if (!realm) {
        return true;
      }
      return rule.realms.includes(realm as IamStepUpRealm);
    }) ?? null
  );
}

/**
 * Project the fields the policy may read out of the canonical request
 * identity. Bootstrap-header identities carry no `amr`/`acr`/`auth_time`, so
 * they arrive here empty and fail closed.
 */
export function toStepUpIdentityEvidence(
  identity: BootstrapRequestIdentity | null | undefined,
): StepUpIdentityEvidence | null {
  if (!identity) {
    return null;
  }

  return {
    authMode: identity.authMode ?? null,
    realm: identity.realm ?? null,
    principalId: identity.principalId ?? identity.actorId ?? null,
    sessionId: identity.sessionId ?? null,
    authTime: identity.authTime ?? null,
    authMethods: identity.amr ?? [],
    assurance: identity.acr ?? null,
  };
}

/**
 * Keep only `amr` entries that are both in the trusted registry and accepted by
 * this rule. Untrusted markers (including anything a client invented) never
 * survive this filter.
 */
export function selectAcceptedAuthMethods(
  rule: IamPrivilegedActionRule,
  presentedMethods: readonly string[],
): string[] {
  return [...new Set(presentedMethods)].filter((method) => {
    if (!rule.acceptedAuthMethods.includes(method)) {
      return false;
    }
    return findIamTrustedAuthMethod(method) !== null;
  });
}

function maxAssuranceOf(methods: readonly string[]): number {
  return methods.reduce((highest, method) => {
    const trusted = findIamTrustedAuthMethod(method);
    return trusted
      ? Math.max(highest, rankIamAuthAssurance(trusted.assurance))
      : highest;
  }, 0);
}

function hasPhishingResistantMethod(methods: readonly string[]): boolean {
  return methods.some(
    (method) => findIamTrustedAuthMethod(method)?.phishingResistant === true,
  );
}

function ageSeconds(from: string | null, now: Date): number | null {
  if (!from) {
    return null;
  }
  const parsed = Date.parse(from);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return (now.getTime() - parsed) / 1000;
}

function deny(
  rule: IamPrivilegedActionRule,
  outcome: "mfa_required" | "step_up_required",
  reasonCode: IamStepUpDecision["reasonCode"],
  satisfiedByAuthMethods: readonly string[] = [],
  evidenceAgeSeconds: number | null = null,
): IamStepUpDecision {
  return {
    outcome,
    reasonCode,
    actionId: rule.actionId,
    errorCode: outcome === "mfa_required" ? "MFA_REQUIRED" : "STEP_UP_REQUIRED",
    requiredAssurance: rule.minimumAssurance,
    acceptedAuthMethods: rule.acceptedAuthMethods,
    freshnessSeconds: rule.freshnessSeconds,
    satisfiedByAuthMethods,
    evidenceAgeSeconds,
  };
}

function allow(
  rule: IamPrivilegedActionRule,
  reasonCode: IamStepUpDecision["reasonCode"],
  satisfiedByAuthMethods: readonly string[],
  evidenceAgeSeconds: number | null,
): IamStepUpDecision {
  return {
    outcome: "allow",
    reasonCode,
    actionId: rule.actionId,
    errorCode: null,
    requiredAssurance: rule.minimumAssurance,
    acceptedAuthMethods: rule.acceptedAuthMethods,
    freshnessSeconds: rule.freshnessSeconds,
    satisfiedByAuthMethods,
    evidenceAgeSeconds,
  };
}

/**
 * Evaluate one privileged action.
 *
 * `MFA_REQUIRED` means the principal never proved a trusted factor strong
 * enough for this action. `STEP_UP_REQUIRED` means they did, but the proof is
 * too old, or is not bound to this session and action.
 */
export function evaluateStepUpPolicy(
  input: EvaluateStepUpPolicyInput,
): IamStepUpDecision {
  const { rule, identity, proof, now } = input;

  if (!identity) {
    return deny(rule, "mfa_required", "MISSING_IDENTITY");
  }

  // Only a verified token carries a server-owned claim envelope. Bootstrap
  // headers, partner API keys and referral bearers can assert whatever they
  // like, so they can never satisfy a step-up rule.
  if (identity.authMode !== "jwt_bearer") {
    return deny(rule, "mfa_required", "UNTRUSTED_AUTH_MODE");
  }

  const presentedMethods = identity.authMethods ?? [];
  const trustedMethods = selectAcceptedAuthMethods(rule, presentedMethods);

  if (trustedMethods.length === 0) {
    return deny(
      rule,
      "mfa_required",
      presentedMethods.length > 0
        ? "UNTRUSTED_AUTH_METHOD"
        : "NO_TRUSTED_AUTH_METHOD",
    );
  }

  if (rule.requiresPhishingResistant && !hasPhishingResistantMethod(trustedMethods)) {
    return deny(
      rule,
      "mfa_required",
      "PHISHING_RESISTANT_REQUIRED",
      trustedMethods,
    );
  }

  // Both the asserted `acr` and the strongest trusted method must clear the
  // minimum, so an IdP echoing a high `acr` over a weak factor gains nothing.
  const requiredRank = rankIamAuthAssurance(rule.minimumAssurance);
  if (
    rankIamAuthAssurance(identity.assurance) < requiredRank ||
    maxAssuranceOf(trustedMethods) < requiredRank
  ) {
    return deny(rule, "mfa_required", "INSUFFICIENT_ASSURANCE", trustedMethods);
  }

  const sessionAge = ageSeconds(identity.authTime, now);
  if (sessionAge === null) {
    return deny(rule, "mfa_required", "MISSING_AUTH_TIME", trustedMethods);
  }

  const sessionIsFresh = sessionAge >= 0 && sessionAge <= rule.freshnessSeconds;

  if (!rule.requiresBoundProof && sessionIsFresh) {
    return allow(rule, "SESSION_AUTH_FRESH", trustedMethods, sessionAge);
  }

  return evaluateBoundProof({
    rule,
    identity,
    proof: proof ?? null,
    proofReferencePresented: input.proofReferencePresented ?? Boolean(proof),
    trustedMethods,
    sessionAge,
    sessionIsFresh,
    now,
  });
}

function evaluateBoundProof(args: {
  rule: IamPrivilegedActionRule;
  identity: StepUpIdentityEvidence;
  proof: IamStepUpProofRecord | null;
  proofReferencePresented: boolean;
  trustedMethods: string[];
  sessionAge: number;
  sessionIsFresh: boolean;
  now: Date;
}): IamStepUpDecision {
  const {
    rule,
    identity,
    proof,
    proofReferencePresented,
    trustedMethods,
    sessionAge,
    sessionIsFresh,
    now,
  } = args;

  if (!proof) {
    if (proofReferencePresented) {
      return deny(
        rule,
        "step_up_required",
        "STEP_UP_PROOF_UNKNOWN",
        trustedMethods,
      );
    }
    return deny(
      rule,
      "step_up_required",
      rule.requiresBoundProof
        ? sessionIsFresh
          ? "BOUND_PROOF_REQUIRED"
          : "STEP_UP_PROOF_MISSING"
        : "SESSION_AUTH_STALE",
      trustedMethods,
      sessionAge,
    );
  }

  if (!identity.principalId || proof.principalId !== identity.principalId) {
    return deny(
      rule,
      "step_up_required",
      "STEP_UP_PROOF_PRINCIPAL_MISMATCH",
      trustedMethods,
    );
  }

  if (!identity.sessionId || proof.sessionId !== identity.sessionId) {
    return deny(
      rule,
      "step_up_required",
      "STEP_UP_PROOF_SESSION_MISMATCH",
      trustedMethods,
    );
  }

  if (proof.actionId !== rule.actionId) {
    return deny(
      rule,
      "step_up_required",
      "STEP_UP_PROOF_ACTION_MISMATCH",
      trustedMethods,
    );
  }

  if (proof.consumedAt) {
    return deny(
      rule,
      "step_up_required",
      "STEP_UP_PROOF_ALREADY_CONSUMED",
      trustedMethods,
    );
  }

  const proofMethods = selectAcceptedAuthMethods(rule, proof.authMethods ?? []);
  if (proofMethods.length === 0) {
    return deny(
      rule,
      "step_up_required",
      "STEP_UP_PROOF_METHOD_UNTRUSTED",
      trustedMethods,
    );
  }

  if (rule.requiresPhishingResistant && !hasPhishingResistantMethod(proofMethods)) {
    return deny(
      rule,
      "step_up_required",
      "PHISHING_RESISTANT_REQUIRED",
      proofMethods,
    );
  }

  const requiredRank = rankIamAuthAssurance(rule.minimumAssurance);
  if (
    rankIamAuthAssurance(proof.assurance) < requiredRank ||
    maxAssuranceOf(proofMethods) < requiredRank
  ) {
    return deny(
      rule,
      "step_up_required",
      "STEP_UP_PROOF_ASSURANCE_INSUFFICIENT",
      proofMethods,
    );
  }

  const proofAge = ageSeconds(proof.verifiedAt, now);
  if (proofAge === null) {
    return deny(
      rule,
      "step_up_required",
      "STEP_UP_PROOF_STALE",
      proofMethods,
    );
  }

  // A proof from the future is as unusable as one from the distant past.
  if (proofAge < 0 || proofAge > rule.freshnessSeconds) {
    return deny(
      rule,
      "step_up_required",
      "STEP_UP_PROOF_STALE",
      proofMethods,
      proofAge,
    );
  }

  // The stored expiry is an independent bound; honour whichever is tighter.
  const expiresAt = Date.parse(proof.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
    return deny(
      rule,
      "step_up_required",
      "STEP_UP_PROOF_STALE",
      proofMethods,
      proofAge,
    );
  }

  return allow(rule, "STEP_UP_PROOF_FRESH", proofMethods, proofAge);
}

export function stepUpAssuranceForMethods(
  methods: readonly string[],
): IamAuthAssuranceLevel | null {
  const rank = maxAssuranceOf(methods);
  if (rank >= 3) return "aal3";
  if (rank === 2) return "aal2";
  if (rank === 1) return "aal1";
  return null;
}

export { NO_ACTION_DECISION as STEP_UP_NO_ACTION_DECISION };
