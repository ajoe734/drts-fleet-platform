export const IAM_STAGE15_ERROR_CODES = [
  "AUTH_SESSION_EXCHANGE_DENIED",
  "AUTH_CREDENTIALS_INVALID",
  "AUTH_APPROVAL_REQUIRED",
  "AUTH_STEP_UP_REQUIRED",
  "MFA_REQUIRED",
  "STEP_UP_REQUIRED",
  "AUTHZ_SCOPE_DENIED",
  "AUTHZ_REALM_DENIED",
  "IAM_CONCURRENCY_CONFLICT",
  "IAM_REASON_REQUIRED",
  "IAM_APPROVAL_REFERENCE_REQUIRED",
  "IAM_STEP_UP_REQUIRED",
  "IAM_MEMBERSHIP_NOT_ACTIVE",
  "IAM_INVITATION_INVALID",
  "IAM_CREDENTIAL_NOT_FOUND",
  "IAM_ACCESS_REVIEW_NOT_FOUND",
  "IAM_BREAK_GLASS_NOT_FOUND",
] as const;

export type IamStage15ErrorCode = (typeof IAM_STAGE15_ERROR_CODES)[number];

export const IAM_STEP_UP_ACTION_IDS = [
  "platform:users:create",
  "platform:users:role:update",
  "platform:access-reviews:decide",
  "platform:break-glass:request",
  "platform:break-glass:approve",
  "platform:partner-entries:create",
  "platform:partner-entries:update",
  "platform:partner-entries:activate",
  "platform:partner-entries:deactivate",
  "platform:partner-entries:revoke",
  "platform:partner-credentials:issue",
  "platform:partner-credentials:revoke",
  "platform:tenants:roles:invite",
  "platform:tenants:activate",
  "platform:multi-taxi-trip-records:export",
  "platform:evidence-exports:request",
  "platform:evidence-exports:approve",
  "platform:legal-holds:release-approve",
  "platform:regulatory-exclusivities:approve",
  "platform:regulatory-exclusivities:reject",
  "ops:partner-eligibility:reviews:resolve",
  "ops:approval-requests:acknowledge-breach",
  "ops:approval-requests:approve",
  "ops:approval-requests:reject",
  "ops:approval-requests:escalate",
  "ops:orders:manual-fare-override",
  "ops:orders:approve-override",
  "ops:orders:reject-override",
  "ops:driver-device:revoke",
  "finance:reimbursements:approve",
  "tenant:approval-requests:approve",
  "tenant:approval-requests:reject",
  "tenant:approval-requests:escalate",
  "tenant:users:create",
  "tenant:users:role:update",
  "tenant:api-keys:issue",
  "tenant:api-keys:revoke",
  "tenant:api-keys:rotate",
  "tenant:webhooks:create",
  "tenant:webhooks:update",
  "tenant:webhooks:delete",
  "tenant:webhooks:rotate-secret",
  "tenant:billing:profile:update",
] as const;

export type IamStepUpActionId = (typeof IAM_STEP_UP_ACTION_IDS)[number];

export interface CreateStepUpProofCommand {
  actionId?: IamStepUpActionId | null;
  method?: string | null;
  path?: string | null;
}

export interface StepUpProof {
  required: boolean;
  actionId: IamStepUpActionId | null;
  stepUpReference: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
}

export interface IamMutationMetadata {
  reasonCode: string;
  expectedVersion: number;
  approvalId?: string | null;
  approvalRequestId?: string | null;
  stepUpReference?: string | null;
  note?: string | null;
}

export interface IamCallbackSessionExchangeCommand {
  provider: "oidc";
  callbackUrl: string;
  code: string;
  state: string;
  pkceVerifier: string;
}

export interface IamSessionInventoryQuery {
  actorId?: string | null;
  realm?: string | null;
  tenantId?: string | null;
  includeRevoked?: boolean;
  limit?: number | null;
}

export interface IamAccountMembershipQuery {
  principalId?: string | null;
  tenantId?: string | null;
  status?: string | null;
  limit?: number | null;
}

export interface IamInvitationMutationCommand {
  invitationId?: string | null;
  membershipId?: string | null;
  mutation: IamMutationMetadata;
}

export interface IamRoleMutationCommand {
  membershipId: string;
  roleCode: string;
  mutation: IamMutationMetadata;
}

export interface IamApprovalDecisionCommand {
  approvalRequestId: string;
  decision: "approve" | "reject" | "escalate";
  mutation: IamMutationMetadata;
}

export interface IamAccessReviewDecisionCommand {
  reviewId: string;
  decision: "certify" | "revoke" | "defer";
  mutation: IamMutationMetadata;
}

export interface IamBreakGlassActivationCommand {
  requestId: string;
  requestedScope: string[];
  requestedDurationMinutes: number;
  mutation: IamMutationMetadata;
}

export interface IamCredentialMutationCommand {
  credentialId?: string | null;
  keyName?: string | null;
  scopes?: string[] | null;
  expiresAt?: string | null;
  mutation: IamMutationMetadata;
}

export const IAM_STAGE15_OPERATION_CATALOG = [
  {
    operationId: "exchangeTenantCallbackSession",
    method: "post",
    path: "/api/auth/tenant/callback-session",
    domain: "session",
  },
  {
    operationId: "createTenantBootstrapSession",
    method: "post",
    path: "/api/auth/tenant/bootstrap-session",
    domain: "session",
  },
  {
    operationId: "createPartnerBootstrapSession",
    method: "post",
    path: "/api/auth/partner/bootstrap-session",
    domain: "session",
  },
  {
    operationId: "registerDriverDeviceSession",
    method: "post",
    path: "/api/auth/driver/device/register",
    domain: "device",
  },
  {
    operationId: "refreshDriverDeviceSession",
    method: "post",
    path: "/api/auth/driver/device/refresh",
    domain: "session",
  },
  {
    operationId: "revokeDriverDeviceBinding",
    method: "post",
    path: "/api/auth/driver/device/revoke",
    domain: "device",
  },
  {
    operationId: "getIdentityContext",
    method: "get",
    path: "/api/identity/context",
    domain: "identity",
  },
  {
    operationId: "createStepUpProof",
    method: "post",
    path: "/api/identity/step-up-proofs",
    domain: "identity",
  },
  {
    operationId: "listTenantUsers",
    method: "get",
    path: "/api/tenant/users",
    domain: "account",
  },
  {
    operationId: "createTenantUser",
    method: "post",
    path: "/api/tenant/users",
    domain: "account",
  },
  {
    operationId: "updateTenantUserRole",
    method: "post",
    path: "/api/tenant/users/{userId}/role",
    domain: "role",
  },
  {
    operationId: "listTenantRoles",
    method: "get",
    path: "/api/tenant/roles",
    domain: "role",
  },
  {
    operationId: "listTenantApprovalRequests",
    method: "get",
    path: "/api/tenant/approval-requests",
    domain: "approval",
  },
  {
    operationId: "getTenantApprovalRequest",
    method: "get",
    path: "/api/tenant/approval-requests/{approvalRequestId}",
    domain: "approval",
  },
  {
    operationId: "approveTenantApprovalRequest",
    method: "post",
    path: "/api/tenant/approval-requests/{approvalRequestId}/approve",
    domain: "approval",
  },
  {
    operationId: "rejectTenantApprovalRequest",
    method: "post",
    path: "/api/tenant/approval-requests/{approvalRequestId}/reject",
    domain: "approval",
  },
  {
    operationId: "escalateTenantApprovalRequest",
    method: "post",
    path: "/api/tenant/approval-requests/{approvalRequestId}/escalate",
    domain: "approval",
  },
  {
    operationId: "listOpsApprovalRequests",
    method: "get",
    path: "/api/ops/approval-requests",
    domain: "approval",
  },
  {
    operationId: "resolvePartnerEligibilityReview",
    method: "post",
    path: "/api/ops/partner/eligibility/reviews/resolve",
    domain: "approval",
  },
  {
    operationId: "listTenantApiKeys",
    method: "get",
    path: "/api/tenant/api-keys",
    domain: "credential",
  },
  {
    operationId: "issueTenantApiKey",
    method: "post",
    path: "/api/tenant/api-keys",
    domain: "credential",
  },
  {
    operationId: "revokeTenantApiKey",
    method: "post",
    path: "/api/tenant/api-keys/{apiKeyId}/revoke",
    domain: "credential",
  },
  {
    operationId: "rotateTenantApiKey",
    method: "post",
    path: "/api/tenant/api-keys/{apiKeyId}/rotate",
    domain: "credential",
  },
  {
    operationId: "issuePartnerIngressCredential",
    method: "post",
    path: "/api/platform-admin/partner-entries/{entrySlug}/credentials/issue",
    domain: "credential",
  },
  {
    operationId: "revokePartnerIngressCredential",
    method: "post",
    path: "/api/platform-admin/partner-entries/{entrySlug}/credentials/{keyId}/revoke",
    domain: "credential",
  },
  {
    operationId: "listAccessReviews",
    method: "get",
    path: "/api/platform-admin/access-reviews",
    domain: "access_review",
  },
  {
    operationId: "decideAccessReview",
    method: "post",
    path: "/api/platform-admin/access-reviews/{reviewId}/decision",
    domain: "access_review",
  },
  {
    operationId: "createBreakGlassRequest",
    method: "post",
    path: "/api/platform-admin/break-glass/requests",
    domain: "break_glass",
  },
  {
    operationId: "approveBreakGlassRequest",
    method: "post",
    path: "/api/platform-admin/break-glass/requests/{requestId}/approve",
    domain: "break_glass",
  },
] as const;

export type IamStage15Operation =
  (typeof IAM_STAGE15_OPERATION_CATALOG)[number];
