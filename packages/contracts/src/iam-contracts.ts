export const IAM_STAGE15_ERROR_CODES = [
  "AUTH_SESSION_EXCHANGE_DENIED",
  "AUTH_CREDENTIALS_INVALID",
  "AUTH_APPROVAL_REQUIRED",
  "AUTH_STEP_UP_REQUIRED",
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
  "IAM_ACCESS_REVIEW_CAMPAIGN_NOT_FOUND",
  "IAM_ACCESS_REVIEW_OVERDUE",
  "IAM_ACCESS_REVIEW_CROSS_TENANT_DENIED",
  "IAM_BREAK_GLASS_NOT_FOUND",
] as const;

export type IamStage15ErrorCode = (typeof IAM_STAGE15_ERROR_CODES)[number];

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

/**
 * Minimum tenant-workforce login exchange. The browser obtains the ID token
 * from the configured OIDC provider and exchanges it for a DRTS session.
 */
export interface TenantOidcSessionExchangeCommand {
  idToken: string;
  tenantId?: string | null;
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

export interface AccessReviewCampaignRecord {
  campaignId: string;
  title: string;
  realm: "platform" | "tenant" | "partner" | "operations";
  tenantId?: string | null;
  targetRoleFamily?: string | null;
  reviewerPrincipalId: string;
  status: "draft" | "active" | "completed" | "overdue" | "cancelled";
  deadlineAt: string;
  overduePolicy: "alert_only" | "auto_revoke";
  createdAt: string;
  updatedAt: string;
}

export interface AccessReviewItemRecord {
  reviewId: string;
  campaignId: string;
  targetPrincipalId: string;
  membershipId?: string | null;
  roleBindingId?: string | null;
  tenantId?: string | null;
  roleCode: string;
  status: "pending" | "certified" | "reduced" | "removed" | "overdue";
  decision?: "certify" | "reduce" | "remove" | "revoke" | "defer" | null;
  reducedRoleCode?: string | null;
  decisionByPrincipalId?: string | null;
  decidedAt?: string | null;
  remediatedAt?: string | null;
  sessionRevoked: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AccessReviewEvidenceRecord {
  evidenceId: string;
  campaignId: string;
  reviewId: string;
  actorPrincipalId: string;
  targetPrincipalId: string;
  tenantId?: string | null;
  decision: string;
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  sessionRevoked: boolean;
  reasonCode: string;
  reasonText?: string | null;
  createdAt: string;
}

export interface CreateAccessReviewCampaignCommand {
  title: string;
  realm: "platform" | "tenant" | "partner" | "operations";
  tenantId?: string | null;
  targetRoleFamily?: string | null;
  reviewerPrincipalId: string;
  deadlineAt: string;
  overduePolicy?: "alert_only" | "auto_revoke" | null;
}

export interface IamAccessReviewDecisionCommand {
  reviewId: string;
  decision: "certify" | "reduce" | "remove" | "revoke" | "defer";
  reducedRoleCode?: string | null;
  mutation: IamMutationMetadata;
}

export interface IamBreakGlassActivationCommand {
  requestId: string;
  requestedScope: string[];
  requestedDurationMinutes: number;
  mutation: IamMutationMetadata;
}

export const BREAK_GLASS_GRANT_STATUSES = [
  "requested",
  "approved",
  "active",
  "closed",
  "expired",
  "revoked",
] as const;

export type BreakGlassGrantStatus = (typeof BREAK_GLASS_GRANT_STATUSES)[number];

export interface BreakGlassGrantRecord {
  grantId: string;
  requesterId: string;
  approverId: string | null;
  requestedScopes: string[];
  grantedScopes: string[];
  reasonCode: string;
  reasonText: string;
  proofReference: string;
  status: BreakGlassGrantStatus;
  requestedAt: string;
  approvedAt: string | null;
  activatedAt: string | null;
  expiresAt: string | null;
  closedAt: string | null;
  closedById: string | null;
  closeReason: string | null;
  sessionId: string | null;
  postUseReviewRequired: boolean;
  postUseReviewedAt: string | null;
  version: number;
}

export interface CreateBreakGlassRequestCommand {
  requestedScopes: string[];
  reasonCode: string;
  reasonText: string;
  proofReference: string;
  mutation: IamMutationMetadata;
}

export interface ApproveBreakGlassRequestCommand {
  mutation: IamMutationMetadata;
}

export interface CloseBreakGlassGrantCommand {
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
    operationId: "exchangeTenantOidcSession",
    method: "post",
    path: "/api/auth/tenant/oidc-session",
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
  {
    operationId: "activateBreakGlassRequest",
    method: "post",
    path: "/api/platform-admin/break-glass/requests/{requestId}/activate",
    domain: "break_glass",
  },
  {
    operationId: "closeBreakGlassGrant",
    method: "post",
    path: "/api/platform-admin/break-glass/requests/{requestId}/close",
    domain: "break_glass",
  },
] as const;

export type IamStage15Operation =
  (typeof IAM_STAGE15_OPERATION_CATALOG)[number];
