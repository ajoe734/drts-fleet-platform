import type {
  IamStepUpEvaluationResult,
  IamStepUpPolicyRule,
} from "@drts/contracts";

import type {
  AuthenticatedRequestLike,
  BootstrapRequestIdentity,
} from "./auth.types";
import {
  resolveRouteStepUpPolicy,
  resolveStepUpActionPolicy,
} from "./step-up.policy";

export const TRUSTED_MFA_AMR_METHODS = new Set([
  "mfa",
  "otp",
  "totp",
  "fido2",
  "hwk",
  "webauthn",
  "duo",
  "verified_iap_workforce",
]);

export const DEFAULT_MFA_MAX_AGE_SECONDS = 300; // 5 minutes

export const DECLARED_STEP_UP_POLICY_RULES: Record<
  string,
  IamStepUpPolicyRule
> = {
  // Platform admin & break glass
  createBreakGlassRequest: {
    actionId: "createBreakGlassRequest",
    description: "Create platform break-glass request",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  approveBreakGlassRequest: {
    actionId: "approveBreakGlassRequest",
    description: "Approve platform break-glass request",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  decideAccessReview: {
    actionId: "decideAccessReview",
    description: "Submit quarterly access review decision",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  issuePartnerIngressCredential: {
    actionId: "issuePartnerIngressCredential",
    description: "Issue partner ingress credential",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  revokePartnerIngressCredential: {
    actionId: "revokePartnerIngressCredential",
    description: "Revoke partner ingress credential",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  exportMultiTaxiRecords: {
    actionId: "exportMultiTaxiRecords",
    description: "Export multi-taxi trip operational records",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },

  // Tenant admin & user/role management
  updateTenantUserRole: {
    actionId: "updateTenantUserRole",
    description: "Update tenant user role or permissions",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  createTenantUser: {
    actionId: "createTenantUser",
    description: "Create tenant user membership",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  issueTenantApiKey: {
    actionId: "issueTenantApiKey",
    description: "Issue new tenant API key",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  revokeTenantApiKey: {
    actionId: "revokeTenantApiKey",
    description: "Revoke tenant API key",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  rotateTenantApiKey: {
    actionId: "rotateTenantApiKey",
    description: "Rotate tenant API key",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },

  // Ops, finance & approvals
  approveTenantApprovalRequest: {
    actionId: "approveTenantApprovalRequest",
    description: "Approve tenant approval request",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  rejectTenantApprovalRequest: {
    actionId: "rejectTenantApprovalRequest",
    description: "Reject tenant approval request",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  escalateTenantApprovalRequest: {
    actionId: "escalateTenantApprovalRequest",
    description: "Escalate tenant approval request",
    requiresMfa: true,
    maxAgeSeconds: 300,
  },
  resolvePartnerEligibilityReview: {
    actionId: "resolvePartnerEligibilityReview",
    description: "Resolve partner eligibility review",
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

export function lookupStepUpPolicyRule(
  actionId: string,
  routeKey?: string,
): IamStepUpPolicyRule | null {
  if (DECLARED_STEP_UP_POLICY_RULES[actionId]) {
    return DECLARED_STEP_UP_POLICY_RULES[actionId];
  }
  if (routeKey && DECLARED_STEP_UP_POLICY_RULES[routeKey]) {
    return DECLARED_STEP_UP_POLICY_RULES[routeKey];
  }
  const routePolicy = resolveStepUpActionPolicy(actionId as never);
  if (routePolicy) {
    return {
      actionId: routePolicy.actionId,
      description: routePolicy.description,
      requiresMfa: true,
      maxAgeSeconds: Math.floor(routePolicy.freshnessWindowMs / 1000),
    };
  }

  return null;
}

export function isPrivilegedAction(
  method: string,
  url: string,
  routeKey?: string,
): boolean {
  const upperMethod = method.toUpperCase();
  if (
    upperMethod === "GET" ||
    upperMethod === "HEAD" ||
    upperMethod === "OPTIONS"
  ) {
    return false;
  }

  const rawPath = (url || "").split("?")[0] ?? "";
  const path = rawPath.replace(/^\/+/, "").replace(/^api\/+/, "");

  if (
    path.startsWith("platform-admin/") ||
    path.startsWith("ops/") ||
    path.startsWith("admin/") ||
    path.startsWith("tenant/") ||
    path.startsWith("regulatory-registry/") ||
    path.startsWith("reimbursements/") ||
    path.startsWith("orders/") ||
    path.includes("access-reviews") ||
    path.includes("credentials") ||
    path === "partner/eligibility/verify" ||
    path === "auth/driver/device/revoke" ||
    path === "driver/sos-events"
  ) {
    return true;
  }

  if (resolveRouteStepUpPolicy(method, url)) {
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
  return amr.some((method) =>
    TRUSTED_MFA_AMR_METHODS.has(method.toLowerCase()),
  );
}

function matchesActionId(
  proofActionId: string,
  targetActionId: string,
  ruleActionId?: string,
  rawUrl?: string,
): boolean {
  if (
    proofActionId === "*" ||
    proofActionId === targetActionId ||
    proofActionId === ruleActionId
  ) {
    return true;
  }
  const rawPath =
    (rawUrl || "")
      .split("?")[0]
      ?.replace(/^\/+/, "")
      .replace(/^api\/+/, "") ?? "";

  if (
    (proofActionId === "updateTenantUserRole" ||
      proofActionId === "createTenantUser") &&
    rawPath.startsWith("tenant/users")
  ) {
    return true;
  }
  if (
    (proofActionId === "issueTenantApiKey" ||
      proofActionId === "revokeTenantApiKey" ||
      proofActionId === "rotateTenantApiKey") &&
    rawPath.startsWith("tenant/api-keys")
  ) {
    return true;
  }
  if (
    (proofActionId === "createBreakGlassRequest" ||
      proofActionId === "approveBreakGlassRequest") &&
    rawPath.startsWith("platform-admin/break-glass/requests")
  ) {
    return true;
  }
  if (
    proofActionId === "decideAccessReview" &&
    rawPath.includes("access-reviews")
  ) {
    return true;
  }
  if (
    (proofActionId === "issuePartnerIngressCredential" ||
      proofActionId === "revokePartnerIngressCredential") &&
    rawPath.includes("credentials")
  ) {
    return true;
  }
  if (
    proofActionId === "exportMultiTaxiRecords" &&
    rawPath.startsWith("platform-admin/multi-taxi")
  ) {
    return true;
  }
  if (
    (proofActionId === "approveTenantApprovalRequest" ||
      proofActionId === "rejectTenantApprovalRequest" ||
      proofActionId === "escalateTenantApprovalRequest") &&
    rawPath.startsWith("tenant/approval-requests")
  ) {
    return true;
  }
  if (
    proofActionId === "resolvePartnerEligibilityReview" &&
    rawPath.startsWith("ops/partner/eligibility")
  ) {
    return true;
  }
  if (
    proofActionId === "partner:eligibility:verify" &&
    rawPath === "partner/eligibility/verify"
  ) {
    return true;
  }
  if (
    proofActionId === "auth:driver-device:revoke" &&
    rawPath === "auth/driver/device/revoke"
  ) {
    return true;
  }
  if (
    proofActionId === "driver:sos-events:create" &&
    rawPath === "driver/sos-events"
  ) {
    return true;
  }

  return false;
}

export function evaluateMfaStepUpPolicy(
  identity: BootstrapRequestIdentity,
  actionId: string,
  request: AuthenticatedRequestLike,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): IamStepUpEvaluationResult {
  const routeKey = request.originalUrl || request.url;
  const isPriv = isPrivilegedAction(
    request.method ?? "POST",
    request.url ?? "",
    routeKey,
  );
  const rule =
    lookupStepUpPolicyRule(actionId, routeKey) ??
    (isPriv
      ? {
          actionId,
          description: `Default privileged step-up policy for ${actionId}`,
          requiresMfa: true,
          maxAgeSeconds: DEFAULT_MFA_MAX_AGE_SECONDS,
        }
      : null);

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
      message:
        "Server-trusted MFA proof is required for this privileged action.",
    };
  }

  // 2. Validate explicit step-up proof if provided
  if (identity.stepUpProof) {
    const proof = identity.stepUpProof;

    // Check wrong-principal proof
    if (
      proof.actorId &&
      proof.actorId !== identity.actorId &&
      proof.actorId !== identity.subject
    ) {
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
    if (
      proof.actionId &&
      !matchesActionId(
        proof.actionId,
        actionId,
        rule.actionId,
        request.originalUrl ?? request.url,
      )
    ) {
      return {
        allowed: false,
        actionId,
        errorCode: "AUTH_STEP_UP_REQUIRED",
        reason: "STALE_WRONG_ACTION",
        message: `Step-up proof is bound to action '${proof.actionId}', not '${actionId}'.`,
      };
    }

    // Check freshness window
    const proofAuthTimeSeconds =
      typeof proof.authTime === "number"
        ? proof.authTime < 100000000000
          ? proof.authTime
          : Math.floor(proof.authTime / 1000)
        : typeof proof.authTime === "string"
          ? !isNaN(Number(proof.authTime))
            ? Number(proof.authTime) < 100000000000
              ? Number(proof.authTime)
              : Math.floor(Number(proof.authTime) / 1000)
            : !isNaN(Date.parse(proof.authTime))
              ? Math.floor(Date.parse(proof.authTime) / 1000)
              : nowSeconds
          : nowSeconds;
    const freshnessAge = nowSeconds - proofAuthTimeSeconds;
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
  if (identity.authTime !== null && identity.authTime !== undefined) {
    const authTimeSeconds =
      typeof identity.authTime === "number"
        ? identity.authTime
        : !isNaN(Number(identity.authTime))
          ? Number(identity.authTime)
          : Math.floor(Date.parse(identity.authTime) / 1000);
    const freshnessAge = nowSeconds - authTimeSeconds;
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
