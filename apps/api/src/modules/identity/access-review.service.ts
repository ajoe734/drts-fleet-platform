import { randomUUID } from "node:crypto";

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";

import type {
  AccessReviewCampaignRecord,
  AccessReviewEvidenceRecord,
  AccessReviewItemRecord,
  CreateAccessReviewCampaignCommand,
  IamAccessReviewDecisionCommand,
  IdentityContext,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";
import { SecurityEventsService } from "../security-events/security-events.service";
import { IdentityRepository } from "./identity.repository";

export interface AccessReviewCampaignQuery {
  realm?: string | undefined;
  tenantId?: string | undefined;
  status?: string | undefined;
  limit?: number | undefined;
}

export interface AccessReviewEvidenceQuery {
  campaignId?: string | undefined;
  reviewId?: string | undefined;
  actorPrincipalId?: string | undefined;
  targetPrincipalId?: string | undefined;
  tenantId?: string | undefined;
  decision?: string | undefined;
  limit?: number | undefined;
}

type PersistedCampaignRow = {
  campaign_id: string;
  title: string;
  realm: string;
  tenant_id: string | null;
  target_role_family: string | null;
  reviewer_principal_id: string;
  status: string;
  deadline_at: string;
  overdue_policy: string;
  created_at: string;
  updated_at: string;
  record: unknown;
};

type PersistedItemRow = {
  review_id: string;
  campaign_id: string;
  target_principal_id: string;
  membership_id: string | null;
  role_binding_id: string | null;
  tenant_id: string | null;
  role_code: string;
  status: string;
  decision: string | null;
  reduced_role_code: string | null;
  decision_by_principal_id: string | null;
  decided_at: string | null;
  remediated_at: string | null;
  session_revoked: boolean;
  version: number | string;
  created_at: string;
  updated_at: string;
  record: unknown;
};

type PersistedEvidenceRow = {
  evidence_id: string;
  campaign_id: string;
  review_id: string;
  actor_principal_id: string;
  target_principal_id: string;
  tenant_id: string | null;
  decision: string;
  before_state: unknown;
  after_state: unknown;
  session_revoked: boolean;
  reason_code: string;
  reason_text: string | null;
  created_at: string;
  record: unknown;
};

@Injectable()
export class AccessReviewService {
  private readonly logger = new Logger(AccessReviewService.name);

  private readonly fallbackCampaigns = new Map<
    string,
    AccessReviewCampaignRecord
  >();
  private readonly fallbackItems = new Map<string, AccessReviewItemRecord>();
  private readonly fallbackEvidence = new Map<
    string,
    AccessReviewEvidenceRecord
  >();

  constructor(
    private readonly identityRepository: IdentityRepository,
    @Optional() private readonly databaseService?: DatabaseService,
    @Optional() private readonly securityEventsService?: SecurityEventsService,
  ) {}

  private isEnabled(): boolean {
    return this.databaseService?.isEnabled() ?? false;
  }

  /**
   * Enforce tenant boundary rules.
   * If targetTenantId is specified, actor cannot mutate/view across tenants unless actor is platform admin.
   */
  private checkTenantBoundary(
    actor: IdentityContext | null,
    targetTenantId?: string | null,
  ): void {
    if (!actor) {
      return;
    }
    if (actor.realm === "platform" || !targetTenantId) {
      return;
    }
    if (actor.tenantId && actor.tenantId !== targetTenantId) {
      throw new ForbiddenException(
        `Cross-tenant access review operation denied. Actor tenant (${actor.tenantId}) does not match target tenant (${targetTenantId}).`,
      );
    }
  }

  async createCampaign(
    command: CreateAccessReviewCampaignCommand,
    actor: IdentityContext | null,
  ): Promise<{
    campaign: AccessReviewCampaignRecord;
    items: AccessReviewItemRecord[];
  }> {
    const tenantId = command.tenantId || (actor?.tenantId ?? null);
    this.checkTenantBoundary(actor, tenantId);

    const now = new Date().toISOString();
    const campaignId = `arc_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

    const campaign: AccessReviewCampaignRecord = {
      campaignId,
      title: command.title,
      realm: command.realm,
      tenantId: tenantId || null,
      targetRoleFamily: command.targetRoleFamily || null,
      reviewerPrincipalId: command.reviewerPrincipalId,
      status: "active",
      deadlineAt: command.deadlineAt,
      overduePolicy: command.overduePolicy || "alert_only",
      createdAt: now,
      updatedAt: now,
    };

    // Auto-populate campaign items from existing principals / memberships
    const principals = this.identityRepository.listPrincipals();
    const memberships = this.identityRepository.listMemberships();
    const roleBindings = this.identityRepository.listRoleBindings();

    const items: AccessReviewItemRecord[] = [];

    // Filter memberships/role bindings within scope
    const scopedMemberships = memberships.filter((m) => {
      if (tenantId && m.tenantId !== tenantId) {
        return false;
      }
      if (m.status !== "active") {
        return false;
      }
      return true;
    });

    if (scopedMemberships.length > 0) {
      for (const m of scopedMemberships) {
        const binding = roleBindings.find(
          (b) => b.membershipId === m.membershipId,
        );
        const reviewId = `ar_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
        items.push({
          reviewId,
          campaignId,
          targetPrincipalId: m.principalId,
          membershipId: m.membershipId,
          roleBindingId: binding?.roleBindingId || null,
          tenantId: m.tenantId || tenantId || null,
          roleCode: binding?.roleCode || "member",
          status: "pending",
          sessionRevoked: false,
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
      }
    } else if (principals.length > 0) {
      // Fallback to principals if no specific memberships match
      for (const p of principals) {
        const reviewId = `ar_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
        items.push({
          reviewId,
          campaignId,
          targetPrincipalId: p.principalId,
          membershipId: null,
          roleBindingId: null,
          tenantId: tenantId || null,
          roleCode: "privileged_user",
          status: "pending",
          sessionRevoked: false,
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    if (!this.isEnabled()) {
      this.fallbackCampaigns.set(campaignId, campaign);
      for (const item of items) {
        this.fallbackItems.set(item.reviewId, item);
      }
    } else {
      const client = await this.databaseService!.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `
            INSERT INTO iam.access_review_campaigns (
              campaign_id, title, realm, tenant_id, target_role_family,
              reviewer_principal_id, status, deadline_at, overdue_policy,
              created_at, updated_at, record
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `,
          [
            campaign.campaignId,
            campaign.title,
            campaign.realm,
            campaign.tenantId,
            campaign.targetRoleFamily,
            campaign.reviewerPrincipalId,
            campaign.status,
            campaign.deadlineAt,
            campaign.overduePolicy,
            campaign.createdAt,
            campaign.updatedAt,
            JSON.stringify(campaign),
          ],
        );

        for (const item of items) {
          await client.query(
            `
              INSERT INTO iam.access_review_items (
                review_id, campaign_id, target_principal_id, membership_id,
                role_binding_id, tenant_id, role_code, status, session_revoked,
                version, created_at, updated_at, record
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            `,
            [
              item.reviewId,
              item.campaignId,
              item.targetPrincipalId,
              item.membershipId,
              item.roleBindingId,
              item.tenantId,
              item.roleCode,
              item.status,
              item.sessionRevoked,
              item.version,
              item.createdAt,
              item.updatedAt,
              JSON.stringify(item),
            ],
          );
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    if (this.securityEventsService) {
      this.securityEventsService.recordEvent({
        eventType: "access_review.campaign_created",
        eventFamily: "policy",
        outcome: "success",
        severity: "medium",
        actorId: actor?.actorId || "system",
        actorType: actor?.actorType || "platform_admin",
        realm: actor?.realm || "platform",
        tenantId: actor?.tenantId ?? null,
        partnerId: null,
        targetType: "access_review_campaign",
        targetId: campaignId,
        subjectId: null,
        sessionId: null,
        tokenId: null,
        authMethods: [],
        sourceIp: null,
        userAgent: null,
        requestId: null,
        traceId: null,
        reasonCode: "CAMPAIGN_CREATION",
        approvalId: null,
      });
    }

    return { campaign, items };
  }

  async getCampaign(
    campaignId: string,
    actor: IdentityContext | null,
  ): Promise<{
    campaign: AccessReviewCampaignRecord;
    items: AccessReviewItemRecord[];
  }> {
    let campaign: AccessReviewCampaignRecord | null = null;
    let items: AccessReviewItemRecord[] = [];

    if (!this.isEnabled()) {
      campaign = this.fallbackCampaigns.get(campaignId) || null;
      if (campaign) {
        items = Array.from(this.fallbackItems.values()).filter(
          (i) => i.campaignId === campaignId,
        );
      }
    } else {
      const client = await this.databaseService!.connect();
      try {
        const campRes = await client.query<PersistedCampaignRow>(
          `SELECT * FROM iam.access_review_campaigns WHERE campaign_id = $1`,
          [campaignId],
        );
        const row = campRes.rows[0];
        if (row) {
          campaign = (row.record as AccessReviewCampaignRecord) || {
            campaignId: row.campaign_id,
            title: row.title,
            realm: row.realm as any,
            tenantId: row.tenant_id,
            targetRoleFamily: row.target_role_family,
            reviewerPrincipalId: row.reviewer_principal_id,
            status: row.status as any,
            deadlineAt: row.deadline_at,
            overduePolicy: row.overdue_policy as any,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          };

          const itemsRes = await client.query<PersistedItemRow>(
            `SELECT * FROM iam.access_review_items WHERE campaign_id = $1`,
            [campaignId],
          );
          items = itemsRes.rows
            .map((r) => {
              if (!r) return null;
              return (
                (r.record as AccessReviewItemRecord) || {
                  reviewId: r.review_id,
                  campaignId: r.campaign_id,
                  targetPrincipalId: r.target_principal_id,
                  membershipId: r.membership_id,
                  roleBindingId: r.role_binding_id,
                  tenantId: r.tenant_id,
                  roleCode: r.role_code,
                  status: r.status as any,
                  decision: r.decision as any,
                  reducedRoleCode: r.reduced_role_code,
                  decisionByPrincipalId: r.decision_by_principal_id,
                  decidedAt: r.decided_at,
                  remediatedAt: r.remediated_at,
                  sessionRevoked: r.session_revoked,
                  version: Number(r.version),
                  createdAt: r.created_at,
                  updatedAt: r.updated_at,
                }
              );
            })
            .filter((i): i is AccessReviewItemRecord => i !== null);
        }
      } finally {
        client.release();
      }
    }

    if (!campaign) {
      throw new NotFoundException(
        `Access review campaign with id ${campaignId} not found.`,
      );
    }

    this.checkTenantBoundary(actor, campaign.tenantId);

    return { campaign, items };
  }

  async listCampaigns(
    query: AccessReviewCampaignQuery,
    actor: IdentityContext | null,
  ): Promise<AccessReviewCampaignRecord[]> {
    const tenantId = query.tenantId || (actor?.tenantId ?? undefined);
    if (tenantId) {
      this.checkTenantBoundary(actor, tenantId);
    }

    if (!this.isEnabled()) {
      let list = Array.from(this.fallbackCampaigns.values());
      if (tenantId) {
        list = list.filter((c) => c.tenantId === tenantId);
      }
      if (query.realm) {
        list = list.filter((c) => c.realm === query.realm);
      }
      if (query.status) {
        list = list.filter((c) => c.status === query.status);
      }
      if (query.limit) {
        list = list.slice(0, query.limit);
      }
      return list;
    }

    const client = await this.databaseService!.connect();
    try {
      const conditions: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (tenantId) {
        conditions.push(`tenant_id = $${idx++}`);
        values.push(tenantId);
      }
      if (query.realm) {
        conditions.push(`realm = $${idx++}`);
        values.push(query.realm);
      }
      if (query.status) {
        conditions.push(`status = $${idx++}`);
        values.push(query.status);
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const limitClause = query.limit ? `LIMIT ${Number(query.limit)}` : "";

      const res = await client.query<PersistedCampaignRow>(
        `SELECT * FROM iam.access_review_campaigns ${whereClause} ORDER BY created_at DESC ${limitClause}`,
        values,
      );

      return res.rows.map(
        (r) =>
          (r.record as AccessReviewCampaignRecord) || {
            campaignId: r.campaign_id,
            title: r.title,
            realm: r.realm as any,
            tenantId: r.tenant_id,
            targetRoleFamily: r.target_role_family,
            reviewerPrincipalId: r.reviewer_principal_id,
            status: r.status as any,
            deadlineAt: r.deadline_at,
            overduePolicy: r.overdue_policy as any,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          },
      );
    } finally {
      client.release();
    }
  }

  async decideReviewItem(
    reviewId: string,
    command: IamAccessReviewDecisionCommand,
    actor: IdentityContext | null,
  ): Promise<{
    item: AccessReviewItemRecord;
    evidence: AccessReviewEvidenceRecord;
  }> {
    let item: AccessReviewItemRecord | null = null;
    let campaign: AccessReviewCampaignRecord | null = null;

    if (!this.isEnabled()) {
      item = this.fallbackItems.get(reviewId) || null;
      if (item) {
        campaign = this.fallbackCampaigns.get(item.campaignId) || null;
      }
    } else {
      const client = await this.databaseService!.connect();
      try {
        const itemRes = await client.query<PersistedItemRow>(
          `SELECT * FROM iam.access_review_items WHERE review_id = $1`,
          [reviewId],
        );
        const r = itemRes.rows[0];
        if (r) {
          item = (r.record as AccessReviewItemRecord) || {
            reviewId: r.review_id,
            campaignId: r.campaign_id,
            targetPrincipalId: r.target_principal_id,
            membershipId: r.membership_id,
            roleBindingId: r.role_binding_id,
            tenantId: r.tenant_id,
            roleCode: r.role_code,
            status: r.status as any,
            decision: r.decision as any,
            reducedRoleCode: r.reduced_role_code,
            decisionByPrincipalId: r.decision_by_principal_id,
            decidedAt: r.decided_at,
            remediatedAt: r.remediated_at,
            sessionRevoked: r.session_revoked,
            version: Number(r.version),
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          };
          const campRes = await client.query<PersistedCampaignRow>(
            `SELECT * FROM iam.access_review_campaigns WHERE campaign_id = $1`,
            [item.campaignId],
          );
          const cr = campRes.rows[0];
          if (cr) {
            campaign = (cr.record as AccessReviewCampaignRecord) || {
              campaignId: cr.campaign_id,
              title: cr.title,
              realm: cr.realm as any,
              tenantId: cr.tenant_id,
              targetRoleFamily: cr.target_role_family,
              reviewerPrincipalId: cr.reviewer_principal_id,
              status: cr.status as any,
              deadlineAt: cr.deadline_at,
              overduePolicy: cr.overdue_policy as any,
              createdAt: cr.created_at,
              updatedAt: cr.updated_at,
            };
          }
        }
      } finally {
        client.release();
      }
    }

    if (!item) {
      throw new NotFoundException(
        `Access review item with id ${reviewId} not found.`,
      );
    }

    // Tenant Boundary check
    this.checkTenantBoundary(actor, item.tenantId);

    // Concurrency version check
    if (command.mutation.expectedVersion !== item.version) {
      throw new ConflictException(
        `Concurrency conflict: item version is ${item.version}, expected ${command.mutation.expectedVersion}.`,
      );
    }

    const beforeState: Record<string, unknown> = {
      status: item.status,
      decision: item.decision,
      roleCode: item.roleCode,
      sessionRevoked: item.sessionRevoked,
    };

    const now = new Date().toISOString();
    const actorId = actor?.actorId || "reviewer";

    let newStatus: AccessReviewItemRecord["status"] = "certified";
    let sessionRevoked = false;
    let reducedRoleCode: string | null = null;

    const decisionKey = command.decision;

    if (decisionKey === "certify") {
      newStatus = "certified";
    } else if (decisionKey === "reduce") {
      newStatus = "reduced";
      reducedRoleCode = command.reducedRoleCode || "viewer";
    } else if (decisionKey === "remove" || decisionKey === "revoke") {
      newStatus = "removed";
      // Perform session revocation authority call
      const revokedCount = await this.identityRepository.revokeSessionsForPrincipal(
        item.targetPrincipalId,
        `ACCESS_REVIEW_REVOCATION:${command.mutation.reasonCode}`,
        actorId,
      );
      sessionRevoked = true;
      this.logger.log(
        `Revoked ${revokedCount} active sessions for target principal ${item.targetPrincipalId} upon access review removal decision.`,
      );
    } else if (decisionKey === "defer") {
      newStatus = "pending";
    }

    const updatedItem: AccessReviewItemRecord = {
      ...item,
      status: newStatus,
      decision: decisionKey,
      reducedRoleCode: reducedRoleCode || item.reducedRoleCode || null,
      decisionByPrincipalId: actorId,
      decidedAt: now,
      remediatedAt: (decisionKey === "remove" || decisionKey === "revoke" || decisionKey === "reduce" ? now : item.remediatedAt) ?? null,
      sessionRevoked: item.sessionRevoked || sessionRevoked,
      version: item.version + 1,
      updatedAt: now,
    };

    const afterState: Record<string, unknown> = {
      status: updatedItem.status,
      decision: updatedItem.decision,
      roleCode: updatedItem.roleCode,
      reducedRoleCode: updatedItem.reducedRoleCode,
      sessionRevoked: updatedItem.sessionRevoked,
    };

    const evidenceId = `evd_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const evidence: AccessReviewEvidenceRecord = {
      evidenceId,
      campaignId: item.campaignId,
      reviewId: item.reviewId,
      actorPrincipalId: actorId,
      targetPrincipalId: item.targetPrincipalId,
      tenantId: item.tenantId ?? null,
      decision: decisionKey,
      beforeState,
      afterState,
      sessionRevoked: updatedItem.sessionRevoked,
      reasonCode: command.mutation.reasonCode,
      reasonText: command.mutation.note ?? null,
      createdAt: now,
    };

    if (!this.isEnabled()) {
      this.fallbackItems.set(reviewId, updatedItem);
      this.fallbackEvidence.set(evidenceId, evidence);

      // Check if all items in campaign completed
      const campaignItems = Array.from(this.fallbackItems.values()).filter(
        (i) => i.campaignId === item!.campaignId,
      );
      const allDone = campaignItems.every((i) => i.status !== "pending");
      if (allDone && campaign) {
        this.fallbackCampaigns.set(item.campaignId, {
          ...campaign,
          status: "completed",
          updatedAt: now,
        });
      }
    } else {
      const client = await this.databaseService!.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `
            UPDATE iam.access_review_items
            SET status = $2, decision = $3, reduced_role_code = $4,
                decision_by_principal_id = $5, decided_at = $6, remediated_at = $7,
                session_revoked = $8, version = $9, updated_at = $10, record = $11
            WHERE review_id = $1
          `,
          [
            updatedItem.reviewId,
            updatedItem.status,
            updatedItem.decision,
            updatedItem.reducedRoleCode,
            updatedItem.decisionByPrincipalId,
            updatedItem.decidedAt,
            updatedItem.remediatedAt,
            updatedItem.sessionRevoked,
            updatedItem.version,
            updatedItem.updatedAt,
            JSON.stringify(updatedItem),
          ],
        );

        await client.query(
          `
            INSERT INTO iam.access_review_evidence (
              evidence_id, campaign_id, review_id, actor_principal_id,
              target_principal_id, tenant_id, decision, before_state,
              after_state, session_revoked, reason_code, reason_text,
              created_at, record
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          `,
          [
            evidence.evidenceId,
            evidence.campaignId,
            evidence.reviewId,
            evidence.actorPrincipalId,
            evidence.targetPrincipalId,
            evidence.tenantId,
            evidence.decision,
            JSON.stringify(evidence.beforeState),
            JSON.stringify(evidence.afterState),
            evidence.sessionRevoked,
            evidence.reasonCode,
            evidence.reasonText,
            evidence.createdAt,
            JSON.stringify(evidence),
          ],
        );

        // Check if all items in campaign completed
        const itemsRes = await client.query(
          `SELECT status FROM iam.access_review_items WHERE campaign_id = $1 AND status = 'pending'`,
          [item.campaignId],
        );
        if (itemsRes.rows.length === 0 && campaign) {
          await client.query(
            `UPDATE iam.access_review_campaigns SET status = 'completed', updated_at = $2 WHERE campaign_id = $1`,
            [item.campaignId, now],
          );
        }

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    if (this.securityEventsService) {
      this.securityEventsService.recordEvent({
        eventType: "access_review.decision_made",
        eventFamily: "policy",
        outcome: "success",
        severity: "medium",
        actorId: actor?.actorId || "reviewer",
        actorType: actor?.actorType || "platform_admin",
        realm: actor?.realm || "platform",
        tenantId: actor?.tenantId ?? null,
        partnerId: null,
        targetType: "access_review_item",
        targetId: reviewId,
        subjectId: null,
        sessionId: null,
        tokenId: null,
        authMethods: [],
        sourceIp: null,
        userAgent: null,
        requestId: null,
        traceId: null,
        reasonCode: command.mutation.reasonCode,
        approvalId: null,
      });
    }

    return { item: updatedItem, evidence };
  }

  async evaluateOverdueCampaigns(): Promise<{
    overdueCampaignCount: number;
    overdueItemCount: number;
    remediatedItemCount: number;
  }> {
    const now = new Date();
    const nowIso = now.toISOString();

    let overdueCampaignCount = 0;
    let overdueItemCount = 0;
    let remediatedItemCount = 0;

    if (!this.isEnabled()) {
      for (const [campaignId, campaign] of this.fallbackCampaigns.entries()) {
        if (
          campaign.status === "active" &&
          new Date(campaign.deadlineAt) < now
        ) {
          overdueCampaignCount++;
          campaign.status = "overdue";
          campaign.updatedAt = nowIso;
          this.fallbackCampaigns.set(campaignId, campaign);

          for (const [reviewId, item] of this.fallbackItems.entries()) {
            if (
              item.campaignId === campaignId &&
              item.status === "pending"
            ) {
              overdueItemCount++;
              item.status = "overdue";
              item.updatedAt = nowIso;

              if (campaign.overduePolicy === "auto_revoke") {
                const revoked = await this.identityRepository.revokeSessionsForPrincipal(
                  item.targetPrincipalId,
                  "ACCESS_REVIEW_OVERDUE_AUTO_REVOKE",
                  "system_overdue_sweep",
                );
                item.sessionRevoked = true;
                item.status = "removed";
                item.decision = "remove";
                item.remediatedAt = nowIso;
                remediatedItemCount++;

                const evidenceId = `evd_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
                this.fallbackEvidence.set(evidenceId, {
                  evidenceId,
                  campaignId,
                  reviewId,
                  actorPrincipalId: "system_overdue_sweep",
                  targetPrincipalId: item.targetPrincipalId,
                  tenantId: item.tenantId ?? null,
                  decision: "auto_revoke_overdue",
                  beforeState: { status: "pending" },
                  afterState: { status: "removed", sessionRevoked: true },
                  sessionRevoked: true,
                  reasonCode: "ACCESS_REVIEW_OVERDUE_POLICY",
                  reasonText: "Campaign overdue auto-revoke policy enforced",
                  createdAt: nowIso,
                });
              }

              this.fallbackItems.set(reviewId, item);
            }
          }

          if (this.securityEventsService) {
            this.securityEventsService.recordEvent({
              eventType: "access_review.overdue_alert",
              eventFamily: "policy",
              outcome: "success",
              severity: "high",
              actorId: "system_overdue_sweep",
              actorType: "system",
              realm: "platform",
              tenantId: null,
              partnerId: null,
              targetType: "access_review_campaign",
              targetId: campaignId,
              subjectId: null,
              sessionId: null,
              tokenId: null,
              authMethods: [],
              sourceIp: null,
              userAgent: null,
              requestId: null,
              traceId: null,
              reasonCode: "CAMPAIGN_OVERDUE",
              approvalId: null,
            });
          }
        }
      }
      return { overdueCampaignCount, overdueItemCount, remediatedItemCount };
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");

      const overdueCamps = await client.query<PersistedCampaignRow>(
        `
          SELECT * FROM iam.access_review_campaigns
          WHERE status = 'active' AND deadline_at < $1
        `,
        [nowIso],
      );

      for (const row of overdueCamps.rows) {
        const campaignId = row.campaign_id;
        overdueCampaignCount++;

        await client.query(
          `UPDATE iam.access_review_campaigns SET status = 'overdue', updated_at = $2 WHERE campaign_id = $1`,
          [campaignId, nowIso],
        );

        const pendingItems = await client.query<PersistedItemRow>(
          `SELECT * FROM iam.access_review_items WHERE campaign_id = $1 AND status = 'pending'`,
          [campaignId],
        );

        for (const itemRow of pendingItems.rows) {
          overdueItemCount++;
          const reviewId = itemRow.review_id;
          const targetPrincipalId = itemRow.target_principal_id;

          if (row.overdue_policy === "auto_revoke") {
            await this.identityRepository.revokeSessionsForPrincipal(
              targetPrincipalId,
              "ACCESS_REVIEW_OVERDUE_AUTO_REVOKE",
              "system_overdue_sweep",
            );
            remediatedItemCount++;

            await client.query(
              `
                UPDATE iam.access_review_items
                SET status = 'removed', decision = 'remove', remediated_at = $2,
                    session_revoked = true, updated_at = $2
                WHERE review_id = $1
              `,
              [reviewId, nowIso],
            );

            const evidenceId = `evd_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
            const evidenceRec: AccessReviewEvidenceRecord = {
              evidenceId,
              campaignId,
              reviewId,
              actorPrincipalId: "system_overdue_sweep",
              targetPrincipalId,
              tenantId: itemRow.tenant_id,
              decision: "auto_revoke_overdue",
              beforeState: { status: "pending" },
              afterState: { status: "removed", sessionRevoked: true },
              sessionRevoked: true,
              reasonCode: "ACCESS_REVIEW_OVERDUE_POLICY",
              reasonText: "Campaign overdue auto-revoke policy enforced",
              createdAt: nowIso,
            };

            await client.query(
              `
                INSERT INTO iam.access_review_evidence (
                  evidence_id, campaign_id, review_id, actor_principal_id,
                  target_principal_id, tenant_id, decision, before_state,
                  after_state, session_revoked, reason_code, reason_text,
                  created_at, record
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
              `,
              [
                evidenceRec.evidenceId,
                evidenceRec.campaignId,
                evidenceRec.reviewId,
                evidenceRec.actorPrincipalId,
                evidenceRec.targetPrincipalId,
                evidenceRec.tenantId,
                evidenceRec.decision,
                JSON.stringify(evidenceRec.beforeState),
                JSON.stringify(evidenceRec.afterState),
                evidenceRec.sessionRevoked,
                evidenceRec.reasonCode,
                evidenceRec.reasonText,
                evidenceRec.createdAt,
                JSON.stringify(evidenceRec),
              ],
            );
          } else {
            await client.query(
              `UPDATE iam.access_review_items SET status = 'overdue', updated_at = $2 WHERE review_id = $1`,
              [reviewId, nowIso],
            );
          }
        }

        if (this.securityEventsService) {
          this.securityEventsService.recordEvent({
            eventType: "access_review.overdue_alert",
            eventFamily: "policy",
            outcome: "success",
            severity: "high",
            actorId: "system_overdue_sweep",
            actorType: "system",
            realm: "platform",
            tenantId: null,
            partnerId: null,
            targetType: "access_review_campaign",
            targetId: campaignId,
            subjectId: null,
            sessionId: null,
            tokenId: null,
            authMethods: [],
            sourceIp: null,
            userAgent: null,
            requestId: null,
            traceId: null,
            reasonCode: "CAMPAIGN_OVERDUE",
            approvalId: null,
          });
        }
      }

      await client.query("COMMIT");
      return { overdueCampaignCount, overdueItemCount, remediatedItemCount };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async listEvidence(
    query: AccessReviewEvidenceQuery,
    actor: IdentityContext | null,
  ): Promise<AccessReviewEvidenceRecord[]> {
    const tenantId = query.tenantId || (actor?.tenantId ?? undefined);
    if (tenantId) {
      this.checkTenantBoundary(actor, tenantId);
    }

    if (!this.isEnabled()) {
      let list = Array.from(this.fallbackEvidence.values());
      if (tenantId) {
        list = list.filter((e) => e.tenantId === tenantId);
      }
      if (query.campaignId) {
        list = list.filter((e) => e.campaignId === query.campaignId);
      }
      if (query.reviewId) {
        list = list.filter((e) => e.reviewId === query.reviewId);
      }
      if (query.actorPrincipalId) {
        list = list.filter((e) => e.actorPrincipalId === query.actorPrincipalId);
      }
      if (query.targetPrincipalId) {
        list = list.filter(
          (e) => e.targetPrincipalId === query.targetPrincipalId,
        );
      }
      if (query.decision) {
        list = list.filter((e) => e.decision === query.decision);
      }
      if (query.limit) {
        list = list.slice(0, query.limit);
      }
      return list;
    }

    const client = await this.databaseService!.connect();
    try {
      const conditions: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (tenantId) {
        conditions.push(`tenant_id = $${idx++}`);
        values.push(tenantId);
      }
      if (query.campaignId) {
        conditions.push(`campaign_id = $${idx++}`);
        values.push(query.campaignId);
      }
      if (query.reviewId) {
        conditions.push(`review_id = $${idx++}`);
        values.push(query.reviewId);
      }
      if (query.actorPrincipalId) {
        conditions.push(`actor_principal_id = $${idx++}`);
        values.push(query.actorPrincipalId);
      }
      if (query.targetPrincipalId) {
        conditions.push(`target_principal_id = $${idx++}`);
        values.push(query.targetPrincipalId);
      }
      if (query.decision) {
        conditions.push(`decision = $${idx++}`);
        values.push(query.decision);
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const limitClause = query.limit ? `LIMIT ${Number(query.limit)}` : "";

      const res = await client.query<PersistedEvidenceRow>(
        `SELECT * FROM iam.access_review_evidence ${whereClause} ORDER BY created_at DESC ${limitClause}`,
        values,
      );

      return res.rows.map(
        (r) =>
          (r.record as AccessReviewEvidenceRecord) || {
            evidenceId: r.evidence_id,
            campaignId: r.campaign_id,
            reviewId: r.review_id,
            actorPrincipalId: r.actor_principal_id,
            targetPrincipalId: r.target_principal_id,
            tenantId: r.tenant_id,
            decision: r.decision,
            beforeState: r.before_state as Record<string, unknown>,
            afterState: r.after_state as Record<string, unknown>,
            sessionRevoked: r.session_revoked,
            reasonCode: r.reason_code,
            reasonText: r.reason_text,
            createdAt: r.created_at,
          },
      );
    } finally {
      client.release();
    }
  }
}
