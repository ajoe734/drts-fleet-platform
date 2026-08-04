/**
 * IAM-MFA-001 — server-owned MFA / step-up policy declaration.
 *
 * Architecture: docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md §7.2
 * Execution:    docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md §5.3
 *
 * This module is the *declaration* half of the control. It names every
 * privileged action, the trusted authentication evidence that may satisfy it,
 * and the freshness window inside which that evidence stays valid. The
 * *evaluation* half lives in `apps/api/src/common/auth/mfa-step-up.policy.ts`
 * so that no client-supplied payload can ever participate in the decision.
 */

export const IAM_STEP_UP_ERROR_CODES = [
  "MFA_REQUIRED",
  "STEP_UP_REQUIRED",
] as const;

export type IamStepUpErrorCode = (typeof IAM_STEP_UP_ERROR_CODES)[number];

export const IAM_AUTH_ASSURANCE_LEVELS = ["aal1", "aal2", "aal3"] as const;

export type IamAuthAssuranceLevel = (typeof IAM_AUTH_ASSURANCE_LEVELS)[number];

export const IAM_AUTH_ASSURANCE_RANK: Record<IamAuthAssuranceLevel, number> = {
  aal1: 1,
  aal2: 2,
  aal3: 3,
};

export function isIamAuthAssuranceLevel(
  value: unknown,
): value is IamAuthAssuranceLevel {
  return (
    typeof value === "string" &&
    (IAM_AUTH_ASSURANCE_LEVELS as readonly string[]).includes(value)
  );
}

/**
 * Rank an `acr` claim. Unknown / missing values rank 0 so they can never clear
 * a rule minimum: assurance is proven, never assumed.
 */
export function rankIamAuthAssurance(value: unknown): number {
  return isIamAuthAssuranceLevel(value) ? IAM_AUTH_ASSURANCE_RANK[value] : 0;
}

export type IamAuthEvidenceSource =
  | "idp_claim"
  | "workforce_proxy"
  | "server_device_proof";

export interface IamTrustedAuthMethod {
  /** Canonical `amr` entry. */
  method: string;
  assurance: IamAuthAssuranceLevel;
  phishingResistant: boolean;
  evidenceSource: IamAuthEvidenceSource;
  description: string;
}

/**
 * The closed set of `amr` values the platform is willing to treat as
 * authentication evidence. Anything outside this list is ignored, including
 * values a token happens to carry.
 *
 * `sms` is deliberately present at `aal1`: §7.2 allows it as a transitional
 * fallback but forbids it as the only MFA for a privileged user, and every
 * privileged rule below requires at least `aal2`.
 */
export const IAM_TRUSTED_AUTH_METHODS: readonly IamTrustedAuthMethod[] = [
  {
    method: "webauthn",
    assurance: "aal3",
    phishingResistant: true,
    evidenceSource: "idp_claim",
    description: "WebAuthn authenticator asserted by the managed IdP.",
  },
  {
    method: "passkey",
    assurance: "aal3",
    phishingResistant: true,
    evidenceSource: "idp_claim",
    description: "Synced or device-bound passkey asserted by the managed IdP.",
  },
  {
    method: "hwk",
    assurance: "aal3",
    phishingResistant: true,
    evidenceSource: "idp_claim",
    description: "Hardware security key asserted by the managed IdP.",
  },
  {
    method: "mfa",
    assurance: "aal2",
    phishingResistant: false,
    evidenceSource: "idp_claim",
    description: "Generic multi-factor completion asserted by the managed IdP.",
  },
  {
    method: "otp",
    assurance: "aal2",
    phishingResistant: false,
    evidenceSource: "idp_claim",
    description: "One-time-password factor asserted by the managed IdP.",
  },
  {
    method: "totp",
    assurance: "aal2",
    phishingResistant: false,
    evidenceSource: "idp_claim",
    description: "Time-based one-time password asserted by the managed IdP.",
  },
  {
    method: "oidc_pkce_mfa",
    assurance: "aal2",
    phishingResistant: false,
    evidenceSource: "idp_claim",
    description:
      "Tenant / partner-human OIDC authorization-code + PKCE flow that carried an MFA claim.",
  },
  {
    method: "verified_iap_workforce",
    assurance: "aal2",
    phishingResistant: false,
    evidenceSource: "workforce_proxy",
    description:
      "Cryptographically verified IAP workforce assertion resolved to a durable membership.",
  },
  {
    method: "server_device_proof",
    assurance: "aal2",
    phishingResistant: false,
    evidenceSource: "server_device_proof",
    description: "Server-owned device proof re-verified for this action.",
  },
  {
    method: "driver_device_proof",
    assurance: "aal2",
    phishingResistant: false,
    evidenceSource: "server_device_proof",
    description:
      "Driver device binding proof re-verified against the durable binding record.",
  },
  {
    method: "sms",
    assurance: "aal1",
    phishingResistant: false,
    evidenceSource: "idp_claim",
    description:
      "Transitional SMS fallback. Never sufficient on its own for a privileged action.",
  },
] as const;

export const IAM_TRUSTED_AUTH_METHOD_IDS: readonly string[] =
  IAM_TRUSTED_AUTH_METHODS.map((entry) => entry.method);

export function findIamTrustedAuthMethod(
  method: string,
): IamTrustedAuthMethod | null {
  return (
    IAM_TRUSTED_AUTH_METHODS.find((entry) => entry.method === method) ?? null
  );
}

/**
 * `amr` markers that exist in issued tokens or client payloads but are *not*
 * authentication evidence. They are enumerated so a reviewer can see the
 * exclusion is deliberate rather than an oversight, and so the negative matrix
 * can assert each one fails.
 *
 * `tenant_bootstrap_fixture`, `partner_api_key`, `referral_handoff` and
 * `internal_key` are real issued markers for non-interactive or fixture paths.
 * The `*_flag` entries model what a frontend would like to send.
 */
export const IAM_UNTRUSTED_AUTH_METHOD_MARKERS: readonly string[] = [
  "client_mfa_flag",
  "frontend_mfa",
  "self_reported_mfa",
  "ui_mfa_confirmed",
  "mfa_verified",
  "mfa_completed",
  "bootstrap_headers",
  "tenant_bootstrap_fixture",
  "partner_api_key",
  "referral_handoff",
  "internal_key",
  "driver_device",
  "pwd",
  "password",
] as const;

export type IamStepUpRiskTier = "elevated" | "critical";

export type IamStepUpDomain =
  | "platform_governance"
  | "ops_management"
  | "finance_compliance"
  | "tenant_administration"
  | "partner_administration"
  | "driver_account";

export type IamStepUpRealm =
  | "system"
  | "platform"
  | "tenant"
  | "ops"
  | "driver"
  | "partner";

export interface IamPrivilegedActionRule {
  /** Stable identifier bound into every step-up proof. */
  actionId: string;
  description: string;
  domain: IamStepUpDomain;
  /** HTTP methods this rule applies to. */
  methods: readonly string[];
  /**
   * Normalized route path (no leading slash, no `api/` prefix) with `:name`
   * placeholders for path parameters.
   */
  routePattern: string;
  /** Caller realms the rule applies to. */
  realms: readonly IamStepUpRealm[];
  minimumAssurance: IamAuthAssuranceLevel;
  /** Trusted `amr` values that may satisfy this rule. */
  acceptedAuthMethods: readonly string[];
  /** Whether a phishing-resistant method is mandatory. */
  requiresPhishingResistant: boolean;
  /** Maximum age of the accepted proof, in seconds. */
  freshnessSeconds: number;
  /**
   * When true, a session-level `auth_time` alone never satisfies the rule: a
   * step-up proof bound to principal + session + action must be presented.
   */
  requiresBoundProof: boolean;
  riskTier: IamStepUpRiskTier;
  policyRef: string;
}

const PLATFORM_FRESHNESS_SECONDS = 600;
const OPS_FRESHNESS_SECONDS = 900;
const FINANCE_FRESHNESS_SECONDS = 600;
const TENANT_FRESHNESS_SECONDS = 900;
const DRIVER_FRESHNESS_SECONDS = 900;

const IDP_MFA_METHODS = [
  "webauthn",
  "passkey",
  "hwk",
  "mfa",
  "otp",
  "totp",
  "oidc_pkce_mfa",
] as const;

const WORKFORCE_MFA_METHODS = [
  ...IDP_MFA_METHODS,
  "verified_iap_workforce",
] as const;

const PHISHING_RESISTANT_METHODS = ["webauthn", "passkey", "hwk"] as const;

const DEVICE_PROOF_METHODS = [
  "driver_device_proof",
  "server_device_proof",
  "webauthn",
  "passkey",
] as const;

/**
 * Every privileged action that must clear MFA / step-up before it executes.
 *
 * Coverage is asserted against `IAM_STAGE15_OPERATION_CATALOG` by
 * `tests/unit/mfa-step-up-policy.test.ts`; anything intentionally excluded is
 * listed in `IAM_STEP_UP_EXEMPT_OPERATIONS` with a reason.
 */
export const IAM_PRIVILEGED_ACTION_CATALOG: readonly IamPrivilegedActionRule[] =
  [
    // ---- Platform governance (§7.2 platform_superadmin / platform_user_admin)
    {
      actionId: "platform.access_review.decide",
      description: "Certify, revoke or defer a privileged access review item.",
      domain: "platform_governance",
      methods: ["POST"],
      routePattern: "platform-admin/access-reviews/:reviewId/decision",
      realms: ["platform"],
      minimumAssurance: "aal2",
      acceptedAuthMethods: WORKFORCE_MFA_METHODS,
      requiresPhishingResistant: false,
      freshnessSeconds: PLATFORM_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "critical",
      policyRef: "hardening-plan §7.2 platform row",
    },
    {
      actionId: "platform.break_glass.request",
      description: "Open a break-glass elevation request.",
      domain: "platform_governance",
      methods: ["POST"],
      routePattern: "platform-admin/break-glass/requests",
      realms: ["platform"],
      minimumAssurance: "aal3",
      acceptedAuthMethods: PHISHING_RESISTANT_METHODS,
      requiresPhishingResistant: true,
      freshnessSeconds: PLATFORM_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "critical",
      policyRef: "hardening-plan §16 break-glass hardware MFA",
    },
    {
      actionId: "platform.break_glass.approve",
      description: "Second-person approval of a break-glass elevation.",
      domain: "platform_governance",
      methods: ["POST"],
      routePattern: "platform-admin/break-glass/requests/:requestId/approve",
      realms: ["platform"],
      minimumAssurance: "aal3",
      acceptedAuthMethods: PHISHING_RESISTANT_METHODS,
      requiresPhishingResistant: true,
      freshnessSeconds: PLATFORM_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "critical",
      policyRef: "hardening-plan §16 break-glass hardware MFA",
    },
    {
      actionId: "platform.partner_credential.issue",
      description: "Issue a partner ingress credential.",
      domain: "partner_administration",
      methods: ["POST"],
      routePattern:
        "platform-admin/partner-entries/:entrySlug/credentials/issue",
      realms: ["platform"],
      minimumAssurance: "aal2",
      acceptedAuthMethods: WORKFORCE_MFA_METHODS,
      requiresPhishingResistant: false,
      freshnessSeconds: PLATFORM_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "critical",
      policyRef: "hardening-plan §7.2 partner credential row",
    },
    {
      actionId: "platform.partner_credential.revoke",
      description: "Revoke a partner ingress credential.",
      domain: "partner_administration",
      methods: ["POST"],
      routePattern:
        "platform-admin/partner-entries/:entrySlug/credentials/:keyId/revoke",
      realms: ["platform"],
      minimumAssurance: "aal2",
      acceptedAuthMethods: WORKFORCE_MFA_METHODS,
      requiresPhishingResistant: false,
      freshnessSeconds: PLATFORM_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "elevated",
      policyRef: "hardening-plan §7.2 partner credential row",
    },

    // ---- Finance / compliance (§7.2 finance / compliance / audit)
    {
      actionId: "compliance.legal_hold.release_request",
      description: "Request release of an evidence legal hold.",
      domain: "finance_compliance",
      methods: ["POST"],
      routePattern:
        "platform-admin/evidence/legal-holds/:holdId/release-request",
      realms: ["platform"],
      minimumAssurance: "aal2",
      acceptedAuthMethods: WORKFORCE_MFA_METHODS,
      requiresPhishingResistant: false,
      freshnessSeconds: FINANCE_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "elevated",
      policyRef: "hardening-plan §7.2 legal hold release",
    },
    {
      actionId: "compliance.legal_hold.release_approve",
      description: "Approve release of an evidence legal hold.",
      domain: "finance_compliance",
      methods: ["POST"],
      routePattern:
        "platform-admin/evidence/legal-holds/:holdId/release-approve",
      realms: ["platform"],
      minimumAssurance: "aal2",
      acceptedAuthMethods: WORKFORCE_MFA_METHODS,
      requiresPhishingResistant: false,
      freshnessSeconds: FINANCE_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "critical",
      policyRef: "hardening-plan §7.2 legal hold release",
    },
    {
      actionId: "compliance.multi_taxi_records.export",
      description: "Create a controlled multi-taxi operational-record export.",
      domain: "finance_compliance",
      methods: ["POST"],
      routePattern: "platform-admin/multi-taxi-trip-records/export-jobs",
      realms: ["platform"],
      minimumAssurance: "aal2",
      acceptedAuthMethods: WORKFORCE_MFA_METHODS,
      requiresPhishingResistant: false,
      freshnessSeconds: FINANCE_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "critical",
      policyRef: "hardening-plan §7.2 sensitive export",
    },
    {
      actionId: "finance.reimbursement_batch.approve",
      description: "Approve a driver reimbursement batch.",
      domain: "finance_compliance",
      methods: ["POST"],
      routePattern: "reimbursements/:batchId/approve",
      realms: ["platform", "ops"],
      minimumAssurance: "aal2",
      acceptedAuthMethods: WORKFORCE_MFA_METHODS,
      requiresPhishingResistant: false,
      freshnessSeconds: FINANCE_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "critical",
      policyRef: "hardening-plan §7.2 settlement correction",
    },
    {
      actionId: "finance.reimbursement_batch.pay",
      description: "Release payment for a driver reimbursement batch.",
      domain: "finance_compliance",
      methods: ["POST"],
      routePattern: "reimbursements/:batchId/pay",
      realms: ["platform", "ops"],
      minimumAssurance: "aal2",
      acceptedAuthMethods: WORKFORCE_MFA_METHODS,
      requiresPhishingResistant: false,
      freshnessSeconds: FINANCE_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "critical",
      policyRef: "hardening-plan §7.2 settlement correction",
    },
    {
      actionId: "finance.settlement_issue.resolve",
      description: "Resolve a settlement reconciliation issue.",
      domain: "finance_compliance",
      methods: ["POST"],
      routePattern: "settlement/reconciliation-issues/:issueId/resolve",
      realms: ["platform", "ops"],
      minimumAssurance: "aal2",
      acceptedAuthMethods: WORKFORCE_MFA_METHODS,
      requiresPhishingResistant: false,
      freshnessSeconds: FINANCE_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "elevated",
      policyRef: "hardening-plan §7.2 settlement correction",
    },
    {
      actionId: "finance.driver_fee_plan.publish",
      description: "Publish a driver fee plan version.",
      domain: "finance_compliance",
      methods: ["POST"],
      routePattern: "driver-fee-plans/publish",
      realms: ["platform", "ops"],
      minimumAssurance: "aal2",
      acceptedAuthMethods: WORKFORCE_MFA_METHODS,
      requiresPhishingResistant: false,
      freshnessSeconds: FINANCE_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "elevated",
      policyRef: "hardening-plan §7.2 settlement correction",
    },

    // ---- Ops management (§7.2 ops management / dispatcher override)
    {
      actionId: "ops.driver_device.remote_revoke",
      description: "Remotely revoke a driver device binding.",
      domain: "ops_management",
      methods: ["POST"],
      routePattern: "auth/driver/device/revoke",
      realms: ["platform", "ops"],
      minimumAssurance: "aal2",
      acceptedAuthMethods: WORKFORCE_MFA_METHODS,
      requiresPhishingResistant: false,
      freshnessSeconds: OPS_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "elevated",
      policyRef: "hardening-plan §7.2 driver remote revoke",
    },
    {
      actionId: "ops.partner_eligibility_review.resolve",
      description: "Resolve a partner eligibility review.",
      domain: "ops_management",
      methods: ["POST"],
      routePattern: "ops/partner/eligibility/reviews/resolve",
      realms: ["platform", "ops"],
      minimumAssurance: "aal2",
      acceptedAuthMethods: WORKFORCE_MFA_METHODS,
      requiresPhishingResistant: false,
      freshnessSeconds: OPS_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "elevated",
      policyRef: "hardening-plan §7.2 high-risk override",
    },
    {
      actionId: "ops.approval_request.approve",
      description: "Approve an ops-side approval request.",
      domain: "ops_management",
      methods: ["POST"],
      routePattern: "ops/approval-requests/:approvalRequestId/approve",
      realms: ["platform", "ops"],
      minimumAssurance: "aal2",
      acceptedAuthMethods: WORKFORCE_MFA_METHODS,
      requiresPhishingResistant: false,
      freshnessSeconds: OPS_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "elevated",
      policyRef: "hardening-plan §7.2 high-risk override",
    },
    {
      actionId: "ops.approval_request.reject",
      description: "Reject an ops-side approval request.",
      domain: "ops_management",
      methods: ["POST"],
      routePattern: "ops/approval-requests/:approvalRequestId/reject",
      realms: ["platform", "ops"],
      minimumAssurance: "aal2",
      acceptedAuthMethods: WORKFORCE_MFA_METHODS,
      requiresPhishingResistant: false,
      freshnessSeconds: OPS_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "elevated",
      policyRef: "hardening-plan §7.2 high-risk override",
    },
    {
      actionId: "ops.approval_request.escalate",
      description: "Escalate an ops-side approval request.",
      domain: "ops_management",
      methods: ["POST"],
      routePattern: "ops/approval-requests/:approvalRequestId/escalate",
      realms: ["platform", "ops"],
      minimumAssurance: "aal2",
      acceptedAuthMethods: WORKFORCE_MFA_METHODS,
      requiresPhishingResistant: false,
      freshnessSeconds: OPS_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "elevated",
      policyRef: "hardening-plan §7.2 high-risk override",
    },

    // ---- Tenant administration (§7.2 tenant admin / technical / finance)
    {
      actionId: "tenant.user.create",
      description: "Create or invite a tenant user.",
      domain: "tenant_administration",
      methods: ["POST"],
      routePattern: "tenant/users",
      realms: ["platform", "tenant"],
      minimumAssurance: "aal2",
      acceptedAuthMethods: WORKFORCE_MFA_METHODS,
      requiresPhishingResistant: false,
      freshnessSeconds: TENANT_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "elevated",
      policyRef: "hardening-plan §7.2 tenant role row",
    },
    {
      actionId: "tenant.user_role.update",
      description: "Change a tenant user role or account status.",
      domain: "tenant_administration",
      methods: ["POST"],
      routePattern: "tenant/users/:userId/role",
      realms: ["platform", "tenant"],
      minimumAssurance: "aal2",
      acceptedAuthMethods: WORKFORCE_MFA_METHODS,
      requiresPhishingResistant: false,
      freshnessSeconds: TENANT_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "critical",
      policyRef: "hardening-plan §7.2 tenant role row",
    },
    {
      actionId: "tenant.api_key.issue",
      description: "Issue a tenant API credential.",
      domain: "tenant_administration",
      methods: ["POST"],
      routePattern: "tenant/api-keys",
      realms: ["platform", "tenant"],
      minimumAssurance: "aal2",
      acceptedAuthMethods: WORKFORCE_MFA_METHODS,
      requiresPhishingResistant: false,
      freshnessSeconds: TENANT_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "critical",
      policyRef: "hardening-plan §7.2 tenant API key row",
    },
    {
      actionId: "tenant.api_key.revoke",
      description: "Revoke a tenant API credential.",
      domain: "tenant_administration",
      methods: ["POST"],
      routePattern: "tenant/api-keys/:apiKeyId/revoke",
      realms: ["platform", "tenant"],
      minimumAssurance: "aal2",
      acceptedAuthMethods: WORKFORCE_MFA_METHODS,
      requiresPhishingResistant: false,
      freshnessSeconds: TENANT_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "elevated",
      policyRef: "hardening-plan §7.2 tenant API key row",
    },
    {
      actionId: "tenant.api_key.rotate",
      description: "Rotate a tenant API credential.",
      domain: "tenant_administration",
      methods: ["POST"],
      routePattern: "tenant/api-keys/:apiKeyId/rotate",
      realms: ["platform", "tenant"],
      minimumAssurance: "aal2",
      acceptedAuthMethods: WORKFORCE_MFA_METHODS,
      requiresPhishingResistant: false,
      freshnessSeconds: TENANT_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "critical",
      policyRef: "hardening-plan §7.2 tenant API key row",
    },
    {
      actionId: "tenant.approval_request.approve",
      description: "Approve a tenant approval request.",
      domain: "tenant_administration",
      methods: ["POST"],
      routePattern: "tenant/approval-requests/:approvalRequestId/approve",
      realms: ["platform", "tenant"],
      minimumAssurance: "aal2",
      acceptedAuthMethods: WORKFORCE_MFA_METHODS,
      requiresPhishingResistant: false,
      freshnessSeconds: TENANT_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "elevated",
      policyRef: "hardening-plan §7.2 tenant role row",
    },
    {
      actionId: "tenant.approval_request.reject",
      description: "Reject a tenant approval request.",
      domain: "tenant_administration",
      methods: ["POST"],
      routePattern: "tenant/approval-requests/:approvalRequestId/reject",
      realms: ["platform", "tenant"],
      minimumAssurance: "aal2",
      acceptedAuthMethods: WORKFORCE_MFA_METHODS,
      requiresPhishingResistant: false,
      freshnessSeconds: TENANT_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "elevated",
      policyRef: "hardening-plan §7.2 tenant role row",
    },
    {
      actionId: "tenant.approval_request.escalate",
      description: "Escalate a tenant approval request.",
      domain: "tenant_administration",
      methods: ["POST"],
      routePattern: "tenant/approval-requests/:approvalRequestId/escalate",
      realms: ["platform", "tenant"],
      minimumAssurance: "aal2",
      acceptedAuthMethods: WORKFORCE_MFA_METHODS,
      requiresPhishingResistant: false,
      freshnessSeconds: TENANT_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "elevated",
      policyRef: "hardening-plan §7.2 tenant role row",
    },
    {
      actionId: "tenant.billing_profile.update",
      description: "Update the tenant billing profile.",
      domain: "tenant_administration",
      methods: ["POST"],
      routePattern: "tenant/billing/profile",
      realms: ["platform", "tenant"],
      minimumAssurance: "aal2",
      acceptedAuthMethods: WORKFORCE_MFA_METHODS,
      requiresPhishingResistant: false,
      freshnessSeconds: TENANT_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "elevated",
      policyRef: "hardening-plan §7.2 tenant billing profile row",
    },

    // ---- Driver account (§7.2 driver row: rebind / sensitive data / payout)
    {
      actionId: "driver.profile.sensitive_update",
      description:
        "Change driver personal or payout details from the driver app.",
      domain: "driver_account",
      methods: ["PATCH", "PUT"],
      routePattern: "driver/profile",
      realms: ["driver"],
      // The driver row requires device binding, with interactive MFA staged by
      // rollout; the control is therefore a freshly re-verified device proof
      // rather than a higher session assurance level.
      minimumAssurance: "aal1",
      acceptedAuthMethods: DEVICE_PROOF_METHODS,
      requiresPhishingResistant: false,
      freshnessSeconds: DRIVER_FRESHNESS_SECONDS,
      requiresBoundProof: true,
      riskTier: "elevated",
      policyRef: "hardening-plan §7.2 driver row",
    },
  ] as const;

export interface IamStepUpExemptOperation {
  operationId: string;
  reason: string;
}

/**
 * Stage-1.5 operations that intentionally carry no step-up rule. Reads cannot
 * be stepped up meaningfully, and session-establishment endpoints are the
 * authentication event itself — requiring a prior fresh session there would be
 * circular.
 */
export const IAM_STEP_UP_EXEMPT_OPERATIONS: readonly IamStepUpExemptOperation[] =
  [
    {
      operationId: "exchangeTenantCallbackSession",
      reason:
        "Session establishment. MFA evidence is produced here, not consumed.",
    },
    {
      operationId: "createTenantBootstrapSession",
      reason:
        "Session establishment. MFA evidence is produced here, not consumed.",
    },
    {
      operationId: "createPartnerBootstrapSession",
      reason:
        "Session establishment. MFA evidence is produced here, not consumed.",
    },
    {
      operationId: "registerDriverDeviceSession",
      reason:
        "Pre-session provisioning proved by a single-use invitation, not by an existing session.",
    },
    {
      operationId: "refreshDriverDeviceSession",
      reason:
        "Refresh rotation is governed by the refresh family, not by step-up.",
    },
  ] as const;

export function findIamPrivilegedActionRule(
  actionId: string,
): IamPrivilegedActionRule | null {
  return (
    IAM_PRIVILEGED_ACTION_CATALOG.find((rule) => rule.actionId === actionId) ??
    null
  );
}

/** Reason codes carried on every allow / deny decision and audit event. */
export const IAM_STEP_UP_REASON_CODES = [
  "NO_PRIVILEGED_ACTION",
  "SESSION_AUTH_FRESH",
  "STEP_UP_PROOF_FRESH",
  "UNTRUSTED_AUTH_MODE",
  "MISSING_IDENTITY",
  "NO_TRUSTED_AUTH_METHOD",
  "UNTRUSTED_AUTH_METHOD",
  "PHISHING_RESISTANT_REQUIRED",
  "INSUFFICIENT_ASSURANCE",
  "MISSING_AUTH_TIME",
  "SESSION_AUTH_STALE",
  "BOUND_PROOF_REQUIRED",
  "STEP_UP_PROOF_MISSING",
  "STEP_UP_PROOF_UNKNOWN",
  "STEP_UP_PROOF_PRINCIPAL_MISMATCH",
  "STEP_UP_PROOF_SESSION_MISMATCH",
  "STEP_UP_PROOF_ACTION_MISMATCH",
  "STEP_UP_PROOF_ALREADY_CONSUMED",
  "STEP_UP_PROOF_METHOD_UNTRUSTED",
  "STEP_UP_PROOF_ASSURANCE_INSUFFICIENT",
  "STEP_UP_PROOF_STALE",
] as const;

export type IamStepUpReasonCode = (typeof IAM_STEP_UP_REASON_CODES)[number];

export type IamStepUpOutcome = "allow" | "mfa_required" | "step_up_required";

export interface IamStepUpDecision {
  outcome: IamStepUpOutcome;
  reasonCode: IamStepUpReasonCode;
  actionId: string | null;
  errorCode: IamStepUpErrorCode | null;
  requiredAssurance: IamAuthAssuranceLevel | null;
  acceptedAuthMethods: readonly string[];
  freshnessSeconds: number | null;
  /** Trusted methods actually presented, after untrusted values were dropped. */
  satisfiedByAuthMethods: readonly string[];
  /** Seconds since the accepted evidence was produced, when known. */
  evidenceAgeSeconds: number | null;
}

/**
 * A server-owned step-up proof. It is created only after the server itself
 * verified trusted evidence, and it is bound to the principal, the session and
 * the single action it was raised for.
 */
export interface IamStepUpProofRecord {
  proofId: string;
  principalId: string;
  sessionId: string;
  actionId: string;
  authMethods: string[];
  assurance: IamAuthAssuranceLevel;
  verifiedAt: string;
  expiresAt: string;
  consumedAt: string | null;
  createdByEvidenceSource: IamAuthEvidenceSource;
}

export interface IamStepUpChallenge {
  actionId: string;
  requiredAssurance: IamAuthAssuranceLevel;
  acceptedAuthMethods: readonly string[];
  freshnessSeconds: number;
  riskTier: IamStepUpRiskTier;
}

export function toIamStepUpChallenge(
  rule: IamPrivilegedActionRule,
): IamStepUpChallenge {
  return {
    actionId: rule.actionId,
    requiredAssurance: rule.minimumAssurance,
    acceptedAuthMethods: rule.acceptedAuthMethods,
    freshnessSeconds: rule.freshnessSeconds,
    riskTier: rule.riskTier,
  };
}
