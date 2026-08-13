import type { ApiClient } from "@drts/api-client";
import type {
  AccessReviewCampaignRecord,
  AccessReviewEvidenceRecord,
  AccessReviewItemRecord,
  ApproveBreakGlassRequestCommand,
  ApprovePrivilegedRoleRequestCommand,
  BreakGlassGrantRecord,
  CloseBreakGlassGrantCommand,
  CreateAccessReviewCampaignCommand,
  CreateBreakGlassRequestCommand,
  CreatePrivilegedRoleRequestCommand,
  CreateStepUpProofCommand,
  IamAccessReviewDecisionCommand,
  IamBreakGlassActivationCommand,
  IamSessionInventoryQuery,
  IamSessionRevokeCommand,
  MaskedSessionSummary,
  PrivilegedRoleApprovalRequestRecord,
  RejectPrivilegedRoleRequestCommand,
  RemovePrivilegedRoleGrantCommand,
  StepUpProof,
} from "@drts/contracts";

export interface BreakGlassActivationResult {
  grant: BreakGlassGrantRecord;
  accessToken: string;
  expiresAt: string;
  sessionBanner: "BREAK_GLASS_ACTIVE";
}

export class PlatformAdminIamClient {
  constructor(private readonly client: ApiClient) {}

  // ── Session Inventory & Revocation ──────────────────────────────────────────

  async listSessions(
    query: IamSessionInventoryQuery = {},
  ): Promise<MaskedSessionSummary[]> {
    const searchParams = new URLSearchParams();
    if (query.actorId) searchParams.set("actorId", query.actorId);
    if (query.principalId) searchParams.set("principalId", query.principalId);
    if (query.realm) searchParams.set("realm", query.realm);
    if (query.tenantId) searchParams.set("tenantId", query.tenantId);
    if (query.status) searchParams.set("status", query.status);
    if (query.includeRevoked) searchParams.set("includeRevoked", "true");
    if (query.limit) searchParams.set("limit", String(query.limit));

    const qs = searchParams.toString();
    const path = `/identity/sessions${qs ? `?${qs}` : ""}`;
    return this.client.get<MaskedSessionSummary[]>(path);
  }

  async revokeSession(
    sessionId: string,
    command: IamSessionRevokeCommand = {},
  ): Promise<{ revoked: boolean; sessionId: string; session: MaskedSessionSummary | null }> {
    return this.client.post<{ revoked: boolean; sessionId: string; session: MaskedSessionSummary | null }>(
      `/identity/sessions/${encodeURIComponent(sessionId)}/revoke`,
      { body: command },
    );
  }

  async createStepUpProof(
    command: CreateStepUpProofCommand,
  ): Promise<StepUpProof> {
    return this.client.post<StepUpProof>("/identity/step-up-proofs", {
      body: command,
    });
  }

  // ── Privileged Role Requests & Approvals ────────────────────────────────────

  async listPrivilegedRoleRequests(
    tenantId?: string,
  ): Promise<PrivilegedRoleApprovalRequestRecord[]> {
    const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
    const response = await this.client.get<{ items: PrivilegedRoleApprovalRequestRecord[] }>(
      `/identity/privileged-role-requests${qs}`,
    );
    return response?.items ?? [];
  }

  async getPrivilegedRoleRequest(
    requestId: string,
  ): Promise<PrivilegedRoleApprovalRequestRecord> {
    return this.client.get<PrivilegedRoleApprovalRequestRecord>(
      `/identity/privileged-role-requests/${encodeURIComponent(requestId)}`,
    );
  }

  async createPrivilegedRoleRequest(
    command: CreatePrivilegedRoleRequestCommand,
  ): Promise<PrivilegedRoleApprovalRequestRecord> {
    return this.client.post<PrivilegedRoleApprovalRequestRecord>(
      "/identity/privileged-role-requests",
      { body: command },
    );
  }

  async approvePrivilegedRoleRequest(
    requestId: string,
    command: ApprovePrivilegedRoleRequestCommand,
  ): Promise<PrivilegedRoleApprovalRequestRecord> {
    return this.client.post<PrivilegedRoleApprovalRequestRecord>(
      `/identity/privileged-role-requests/${encodeURIComponent(requestId)}/approve`,
      { body: command },
    );
  }

  async rejectPrivilegedRoleRequest(
    requestId: string,
    command: RejectPrivilegedRoleRequestCommand,
  ): Promise<PrivilegedRoleApprovalRequestRecord> {
    return this.client.post<PrivilegedRoleApprovalRequestRecord>(
      `/identity/privileged-role-requests/${encodeURIComponent(requestId)}/reject`,
      { body: command },
    );
  }

  async removePrivilegedRoleGrant(
    command: RemovePrivilegedRoleGrantCommand,
  ): Promise<{ removed: boolean; grantId: string }> {
    return this.client.post<{ removed: boolean; grantId: string }>(
      "/identity/privileged-role-grants/remove",
      { body: command },
    );
  }

  // ── Access Reviews ──────────────────────────────────────────────────────────

  async listAccessReviews(params: {
    realm?: string;
    tenantId?: string;
    status?: string;
    limit?: number;
  } = {}): Promise<AccessReviewCampaignRecord[]> {
    const searchParams = new URLSearchParams();
    if (params.realm) searchParams.set("realm", params.realm);
    if (params.tenantId) searchParams.set("tenantId", params.tenantId);
    if (params.status) searchParams.set("status", params.status);
    if (params.limit) searchParams.set("limit", String(params.limit));

    const qs = searchParams.toString();
    const res = await this.client.get<{ campaigns: AccessReviewCampaignRecord[] }>(
      `/platform-admin/access-reviews${qs ? `?${qs}` : ""}`,
    );
    return res?.campaigns ?? [];
  }

  async createAccessReviewCampaign(
    command: CreateAccessReviewCampaignCommand,
  ): Promise<AccessReviewCampaignRecord> {
    return this.client.post<AccessReviewCampaignRecord>(
      "/platform-admin/access-reviews/campaigns",
      { body: command },
    );
  }

  async getAccessReviewCampaignDetail(
    campaignId: string,
  ): Promise<{ campaign: AccessReviewCampaignRecord; items: AccessReviewItemRecord[] }> {
    return this.client.get<{
      campaign: AccessReviewCampaignRecord;
      items: AccessReviewItemRecord[];
    }>(`/platform-admin/access-reviews/campaigns/${encodeURIComponent(campaignId)}`);
  }

  async decideAccessReview(
    reviewId: string,
    command: IamAccessReviewDecisionCommand,
  ): Promise<AccessReviewItemRecord> {
    return this.client.post<AccessReviewItemRecord>(
      `/platform-admin/access-reviews/${encodeURIComponent(reviewId)}/decision`,
      { body: command },
    );
  }

  async triggerOverdueSweep(): Promise<{ swept: number; autoRevoked: number }> {
    return this.client.post<{ swept: number; autoRevoked: number }>(
      "/platform-admin/access-reviews/overdue-sweep",
    );
  }

  async queryAccessReviewEvidence(params: {
    campaignId?: string;
    reviewId?: string;
    decision?: string;
    limit?: number;
  } = {}): Promise<AccessReviewEvidenceRecord[]> {
    const searchParams = new URLSearchParams();
    if (params.campaignId) searchParams.set("campaignId", params.campaignId);
    if (params.reviewId) searchParams.set("reviewId", params.reviewId);
    if (params.decision) searchParams.set("decision", params.decision);
    if (params.limit) searchParams.set("limit", String(params.limit));

    const qs = searchParams.toString();
    const res = await this.client.get<{ evidence: AccessReviewEvidenceRecord[] }>(
      `/platform-admin/access-reviews/evidence${qs ? `?${qs}` : ""}`,
    );
    return res?.evidence ?? [];
  }

  // ── Break-Glass Emergency Access ────────────────────────────────────────────

  async requestBreakGlass(
    command: CreateBreakGlassRequestCommand,
  ): Promise<BreakGlassGrantRecord> {
    return this.client.post<BreakGlassGrantRecord>(
      "/platform-admin/break-glass/requests",
      { body: command },
    );
  }

  async approveBreakGlass(
    requestId: string,
    command: ApproveBreakGlassRequestCommand,
  ): Promise<BreakGlassGrantRecord> {
    return this.client.post<BreakGlassGrantRecord>(
      `/platform-admin/break-glass/requests/${encodeURIComponent(requestId)}/approve`,
      { body: command },
    );
  }

  async activateBreakGlass(
    requestId: string,
    command: IamBreakGlassActivationCommand,
  ): Promise<BreakGlassActivationResult> {
    return this.client.post<BreakGlassActivationResult>(
      `/platform-admin/break-glass/requests/${encodeURIComponent(requestId)}/activate`,
      { body: command },
    );
  }

  async closeBreakGlass(
    requestId: string,
    command: CloseBreakGlassGrantCommand,
  ): Promise<BreakGlassGrantRecord> {
    return this.client.post<BreakGlassGrantRecord>(
      `/platform-admin/break-glass/requests/${encodeURIComponent(requestId)}/close`,
      { body: command },
    );
  }
}

export function createPlatformAdminIamClient(client: ApiClient): PlatformAdminIamClient {
  return new PlatformAdminIamClient(client);
}
