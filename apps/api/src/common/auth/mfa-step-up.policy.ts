import type {
  IamStage15ErrorCode,
  IamStepUpEvaluationResult,
  IamStepUpPolicyRule,
  IamStepUpProof,
} from "@drts/contracts";

import type { AuthenticatedRequestLike, BootstrapRequestIdentity } from "./auth.types";

export const TRUSTED_MFA_AMR_METHODS = new Set([
  "mfa",
  "otp",
  "totp",
  "fido2",
  "hwk",
  "webauthn",
  "duo",
]);

export const DEFAULT_MFA_MAX_AGE_SECONDS = 300; // 5 minutes

export const DECLARED_STEP_UP_POLICY_RULES: Record<string, IamStepUpPolicyRule> = {
  // Platform admin & break glass
  "createBreakGlassRequest": {
    actionId: "createBreakGlassRequest",
    description: "Create platform break-glass request",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  "approveBreakGlassRequest": {
    actionId: "approveBreakGlassRequest",
    description: "Approve platform break-glass request",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  "decideAccessReview": {
    actionId: "decideAccessReview",
    description: "Submit quarterly access review decision",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  "issuePartnerIngressCredential": {
    actionId: "issuePartnerIngressCredential",
    description: "Issue partner ingress credential",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  "revokePartnerIngressCredential": {
    actionId: "revokePartnerIngressCredential",
    description: "Revoke partner ingress credential",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  "exportMultiTaxiRecords": {
    actionId: "exportMultiTaxiRecords",
    description: "Export multi-taxi trip operational records",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  "platform-admin:POST": {
    actionId: "platform-admin:POST",
    description: "Platform admin configuration mutation",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  "platform-admin:PUT": {
    actionId: "platform-admin:PUT",
    description: "Platform admin configuration update",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },

  // Tenant admin & user/role management
  "updateTenantUserRole": {
    actionId: "updateTenantUserRole",
    description: "Update tenant user role or permissions",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  "createTenantUser": {
    actionId: "createTenantUser",
    description: "Create tenant user membership",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  "issueTenantApiKey": {
    actionId: "issueTenantApiKey",
    description: "Issue new tenant API key",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  "revokeTenantApiKey": {
    actionId: "revokeTenantApiKey",
    description: "Revoke tenant API key",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  "rotateTenantApiKey": {
    actionId: "rotateTenantApiKey",
    description: "Rotate tenant API key",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  "tenant:billing:POST": {
    actionId: "tenant:billing:POST",
    description: "Tenant billing invoice or payment method mutation",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },

  // Ops, finance & approvals
  "approveTenantApprovalRequest": {
    actionId: "approveTenantApprovalRequest",
    description: "Approve tenant approval request",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  "rejectTenantApprovalRequest": {
    actionId: "rejectTenantApprovalRequest",
    description: "Reject tenant approval request",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  "escalateTenantApprovalRequest": {
    actionId: "escalateTenantApprovalRequest",
    description: "Escalate tenant approval request",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  "resolvePartnerEligibilityReview": {
    actionId: "resolvePartnerEligibilityReview",
    description: "Resolve partner eligibility review",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  "billing:ops:POST": {
    actionId: "billing:ops:POST",
    description: "Billing & settlement operational mutation",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  "reports:POST": {
    actionId: "reports:POST",
    description: "Generate filing package or report export",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  "regulatory-reporting:POST": {
    actionId: "regulatory-reporting:POST",
    description: "Submit regulatory notification report",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },

  // Partner
  "partner:eligibility:verify": {
    actionId: "partner:eligibility:verify",
    description: "Partner eligibility verification submission",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },

  // Driver
  "auth:driver-device:revoke": {
    actionId: "auth:driver-device:revoke",
    description: "Revoke driver device binding",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  "driver:sos-events:create": {
    actionId: "driver:sos-events:create",
    description: "Submit driver SOS emergency event",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
};

export function lookupStepUpPolicyRule(actionId: string, routeKey?: string): IamStepUpPolicyRule | null {
  if (DECLARED_STEP_UP_POLICY_RULES[actionId]) {
    return DECLARED_STEP_UP_POLICY_RULES[actionId];
  }
  if (routeKey && DECLARED_STEP_UP_POLICY_RULES[routeKey]) {
    return DECLARED_STEP_UP_POLICY_RULES[routeKey];
  }

  // Check prefix matches
  for (const [key, rule] of Object.entries(DECLARED_STEP_UP_POLICY_RULES)) {
    if (actionId.startsWith(key) || (routeKey && routeKey.startsWith(key))) {
      return rule;
    }
  }

  return null;
}

export function isPrivilegedAction(method: string, url: string, routeKey?: string): boolean {
  const upperMethod = method.toUpperCase();
  if (upperMethod === "GET" || upperMethod === "HEAD" || upperMethod === "OPTIONS") {
    return false;
  }

  const path = url.split("?")[0]?.replace(/^\/+/, "").replace(/^api\/+/, "") ?? "";

  // Check if matches known high-risk path patterns
  if (
    path.startsWith("platform-admin/") ||
    path.startsWith("tenant/users") ||
    path.startsWith("tenant/api-keys") ||
    path.startsWith("tenant/billing") ||
    path.startsWith("tenant/approval-requests") ||
    path.startsWith("ops/partner/eligibility") ||
    path.startsWith("admin/fleet-partners/billing") ||
    path.startsWith("regulatory") ||
    path.startsWith("filing-packages") ||
    path === "partner/eligibility/verify" ||
    path === "auth/driver/device/revoke" ||
    path === "driver/sos-events"
  ) {
    return true;
  }

  if (routeKey && lookupStepUpPolicyRule(routeKey, routeKey)) {
    return true;
  }

  return false;
}

export function hasTrustedMfaAmr(amr?: string[] | null): boolean {
  if (!amr || amr.length === 0) {
    return false;
  }
  return amr.some((method) => TRUSTED_MFA_AMR_METHODS.has(method.toLowerCase()));
}

export function evaluateMfaStepUpPolicy(
  identity: BootstrapRequestIdentity,
  actionId: string,
  request: AuthenticatedRequestLike,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): IamStepUpEvaluationResult {
  const routeKey = request.originalUrl || request.url;
  const rule = lookupStepUpPolicyRule(actionId, routeKey) ?? (
    isPrivilegedAction(request.method ?? "POST", request.url ?? "", routeKey)
      ? {
          actionId,
          description: `Default privileged step-up policy for ${actionId}`,
          requiresMfa: true,
          maxAgeSeconds: DEFAULT_MFA_MAX_AGE_SECONDS,
        }
      : null
  );

  if (!rule || !rule.requiresMfa) {
    return {
      allowed: true,
      actionId,
      reason: "PASSED",
    };
  }

  // 1. Client boolean check: Client-provided booleans in request body or headers cannot satisfy policy
  const body = request.body ?? {};
  const hasClientMfaBoolean =
    body.isMfa === true ||
    body.mfaVerified === true ||
    body.clientMfaPassed === true ||
    request.headers["x-mfa-passed"] === "true";

  // Check if trusted AMR is present in session identity or step-up proof
  const sessionAmr = identity.amr;
  const proofAmr = identity.stepUpProof?.amr;
  const effectiveAmr = proofAmr && proofAmr.length > 0 ? proofAmr : sessionAmr;

  const trustedMfa = hasTrustedMfaAmr(effectiveAmr);

  if (!trustedMfa) {
    return {
      allowed: false,
      actionId,
      errorCode: "AUTH_STEP_UP_REQUIRED",
      reason: hasClientMfaBoolean ? "CLIENT_BOOLEAN_DISALLOWED" : "MISSING_MFA",
      message: "Server-trusted MFA proof is required for this privileged action.",
    };
  }

  // 2. Validate explicit step-up proof if provided
  if (identity.stepUpProof) {
    const proof = identity.stepUpProof;

    // Check wrong-principal proof
    const expectedActorId = identity.actorId || identity.subject;
    if (proof.actorId && expectedActorId && proof.actorId !== expectedActorId) {
      return {
        allowed: false,
        actionId,
        errorCode: "AUTH_STEP_UP_REQUIRED",
        reason: "STALE_WRONG_PRINCIPAL",
        message: "Step-up proof is bound to a different principal.",
      };
    }

    // Check wrong-session proof
    if (proof.sessionId && identity.sid && proof.sessionId !== identity.sid) {
      return {
        allowed: false,
        actionId,
        errorCode: "AUTH_STEP_UP_REQUIRED",
        reason: "STALE_WRONG_SESSION",
        message: "Step-up proof is bound to a different session.",
      };
    }

    // Check wrong-action proof
    if (proof.actionId && proof.actionId !== "*" && proof.actionId !== actionId) {
      return {
        allowed: false,
        actionId,
        errorCode: "AUTH_STEP_UP_REQUIRED",
        reason: "STALE_WRONG_ACTION",
        message: `Step-up proof is bound to action '${proof.actionId}', not '${actionId}'.`,
      };
    }

    // Check freshness window
    const freshnessAge = nowSeconds - proof.authTime;
    if (freshnessAge > rule.maxAgeSeconds || freshnessAge < -5) {
      return {
        allowed: false,
        actionId,
        errorCode: "AUTH_STEP_UP_REQUIRED",
        reason: "EXPIRED_FRESHNESS_WINDOW",
        message: `Step-up proof expired (age: ${freshnessAge}s, max: ${rule.maxAgeSeconds}s).`,
        freshnessAgeSeconds: freshnessAge,
      };
    }

    return {
      allowed: true,
      actionId,
      reason: "PASSED",
      freshnessAgeSeconds: freshnessAge,
    };
  }

  // 3. Validate main session auth_time freshness
  if (identity.authTime) {
    const freshnessAge = nowSeconds - identity.authTime;
    if (freshnessAge > rule.maxAgeSeconds || freshnessAge < -5) {
      return {
        allowed: false,
        actionId,
        errorCode: "AUTH_STEP_UP_REQUIRED",
        reason: "EXPIRED_FRESHNESS_WINDOW",
        message: `Session MFA auth_time expired (age: ${freshnessAge}s, max: ${rule.maxAgeSeconds}s).`,
        freshnessAgeSeconds: freshnessAge,
      };
    }

    return {
      allowed: true,
      actionId,
      reason: "PASSED",
      freshnessAgeSeconds: freshnessAge,
    };
  }

  // No authTime or stepUpProof timestamp available
  return {
    allowed: false,
    actionId,
    errorCode: "AUTH_STEP_UP_REQUIRED",
    reason: "MISSING_MFA",
    message: "Missing fresh auth_time timestamp for step-up verification.",
  };
}
