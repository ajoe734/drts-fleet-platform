import { ForbiddenException, ConflictException, NotFoundException } from "../../apps/api/node_modules/@nestjs/common";
import { describe, beforeEach, it, expect } from "vitest";

import { AccessReviewService } from "../../apps/api/src/modules/identity/access-review.service";
import { AccessReviewController } from "../../apps/api/src/modules/identity/access-review.controller";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { SecurityEventsService } from "../../apps/api/src/modules/security-events/security-events.service";

describe("Privileged Access Review Campaigns Integration Tests (IAM-GOV-001)", () => {
  let service: AccessReviewService;
  let controller: AccessReviewController;
  let identityRepo: IdentityRepository;
  let securityEventsService: SecurityEventsService;

  beforeEach(() => {
    identityRepo = new IdentityRepository();
    securityEventsService = new SecurityEventsService();
    service = new AccessReviewService(identityRepo, undefined, securityEventsService);
    controller = new AccessReviewController(service);

    // Seed test principal and membership into fallback repository
    identityRepo.ensurePrincipalRecord({
      principalId: "usr_target_01",
      sourceRef: "test_target_01",
      issuer: "test_idp",
      subject: "sub_target_01",
      principalType: "human",
      emailNormalized: "target01@example.com",
      emailVerified: true,
      displayName: "Target User 01",
      accountStatus: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      record: {},
    });

    identityRepo.ensureMembershipRecord({
      membershipId: "mem_target_01",
      sourceRef: "test_mem_target_01",
      principalId: "usr_target_01",
      realm: "tenant",
      scopeRef: "tenant_alpha",
      tenantId: "tenant_alpha",
      membershipStatus: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      record: {},
    });
  });

  describe("1. Durable Campaign Scope and Reviewer Ownership", () => {
    it("creates a campaign with durable scope, assigned reviewer, and auto-populated review items", async () => {
      const actor = {
        actorType: "user",
        actorId: "usr_reviewer_01",
        realm: "platform",
        roles: ["platform_admin"],
        scopes: ["identity:access-reviews:manage"],
      };

      const result = await service.createCampaign(
        {
          title: "Q3 Privileged Access Review",
          realm: "tenant",
          tenantId: "tenant_alpha",
          reviewerPrincipalId: "usr_reviewer_01",
          deadlineAt: new Date(Date.now() + 86400000).toISOString(),
          overduePolicy: "alert_only",
        },
        actor as any,
      );

      expect(result.campaign).toBeDefined();
      expect(result.campaign.campaignId).toMatch(/^arc_/);
      expect(result.campaign.title).toBe("Q3 Privileged Access Review");
      expect(result.campaign.reviewerPrincipalId).toBe("usr_reviewer_01");
      expect(result.campaign.tenantId).toBe("tenant_alpha");
      expect(result.campaign.status).toBe("active");

      expect(result.items.length).toBeGreaterThan(0);
      const targetItem = result.items.find(
        (i) => i.targetPrincipalId === "usr_target_01",
      );
      expect(targetItem).toBeDefined();
      expect(targetItem?.status).toBe("pending");
      expect(targetItem?.sessionRevoked).toBe(false);

      // Verify campaign is queryable via controller
      const fetched = await controller.getPlatformCampaignDetail(
        result.campaign.campaignId,
        actor as any,
      );
      expect(fetched.data.campaign.campaignId).toBe(result.campaign.campaignId);
      expect(fetched.data.items.length).toBe(result.items.length);
    });
  });

  describe("2. Tenant Bounded Certify, Reduce, and Remove Decisions", () => {
    it("allows valid certify, reduce, and remove decisions within tenant boundary", async () => {
      const actor = {
        actorType: "user",
        actorId: "usr_reviewer_01",
        realm: "tenant",
        tenantId: "tenant_alpha",
        roles: ["tenant_admin"],
        scopes: ["identity:access-reviews:certify"],
      };

      const { campaign, items } = await service.createCampaign(
        {
          title: "Tenant Alpha Security Review",
          realm: "tenant",
          tenantId: "tenant_alpha",
          reviewerPrincipalId: "usr_reviewer_01",
          deadlineAt: new Date(Date.now() + 86400000).toISOString(),
        },
        actor as any,
      );

      const item = items[0];

      // Certify decision
      const certifyResult = await service.decideReviewItem(
        item.reviewId,
        {
          reviewId: item.reviewId,
          decision: "certify",
          mutation: {
            reasonCode: "ANNUAL_CERTIFICATION",
            expectedVersion: item.version,
          },
        },
        actor as any,
      );
      expect(certifyResult.item.status).toBe("certified");
      expect(certifyResult.item.decision).toBe("certify");

      // Reduce decision
      const reduceResult = await service.decideReviewItem(
        item.reviewId,
        {
          reviewId: item.reviewId,
          decision: "reduce",
          reducedRoleCode: "operator_viewer",
          mutation: {
            reasonCode: "EXCESSIVE_PRIVILEGE_REDUCTION",
            expectedVersion: certifyResult.item.version,
          },
        },
        actor as any,
      );
      expect(reduceResult.item.status).toBe("reduced");
      expect(reduceResult.item.reducedRoleCode).toBe("operator_viewer");

      // Remove decision
      const removeResult = await service.decideReviewItem(
        item.reviewId,
        {
          reviewId: item.reviewId,
          decision: "remove",
          mutation: {
            reasonCode: "ACCESS_REVOCATION",
            expectedVersion: reduceResult.item.version,
          },
        },
        actor as any,
      );
      expect(removeResult.item.status).toBe("removed");
      expect(removeResult.item.sessionRevoked).toBe(true);
    });

    it("rejects cross-tenant review decision attempts", async () => {
      const actorTenantA = {
        actorType: "user",
        actorId: "usr_admin_a",
        realm: "tenant",
        tenantId: "tenant_alpha",
      };

      const actorTenantB = {
        actorType: "user",
        actorId: "usr_admin_b",
        realm: "tenant",
        tenantId: "tenant_beta",
      };

      const { items } = await service.createCampaign(
        {
          title: "Tenant Alpha Campaign",
          realm: "tenant",
          tenantId: "tenant_alpha",
          reviewerPrincipalId: "usr_admin_a",
          deadlineAt: new Date(Date.now() + 86400000).toISOString(),
        },
        actorTenantA as any,
      );

      const targetReviewId = items[0].reviewId;

      await expect(
        service.decideReviewItem(
          targetReviewId,
          {
            reviewId: targetReviewId,
            decision: "certify",
            mutation: {
              reasonCode: "ILLEGAL_CROSS_TENANT_ATTEMPT",
              expectedVersion: items[0].version,
            },
          },
          actorTenantB as any,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("3. Overdue State Alerts & Declared Policy Execution", () => {
    it("transitions past-deadline active campaigns to overdue and executes auto-revoke policy", async () => {
      const actor = {
        actorType: "user",
        actorId: "usr_reviewer_01",
        realm: "platform",
      };

      const pastDeadline = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
      const { campaign, items } = await service.createCampaign(
        {
          title: "Urgent Expired Campaign",
          realm: "platform",
          reviewerPrincipalId: "usr_reviewer_01",
          deadlineAt: pastDeadline,
          overduePolicy: "auto_revoke",
        },
        actor as any,
      );

      const summary = await service.evaluateOverdueCampaigns();
      expect(summary.overdueCampaignCount).toBeGreaterThanOrEqual(1);
      expect(summary.overdueItemCount).toBeGreaterThanOrEqual(1);
      expect(summary.remediatedItemCount).toBeGreaterThanOrEqual(1);

      const detail = await service.getCampaign(campaign.campaignId, actor as any);
      expect(detail.campaign.status).toBe("overdue");
      expect(detail.items[0].status).toBe("removed");
      expect(detail.items[0].sessionRevoked).toBe(true);

      // Verify security event was recorded
      const events = await securityEventsService.listEvents(null, {});
      const overdueEvent = events.find(
        (e) => e.eventType === "access_review.overdue_alert",
      );
      expect(overdueEvent).toBeDefined();
    });
  });

  describe("4. Removal Revokes Active Sessions", () => {
    it("immediately invalidates active sessions for target principal on removal", async () => {
      const targetPrincipalId = "usr_target_01";
      const now = new Date().toISOString();
      const session = await identityRepo.createSession({
        sessionId: "ses_target_01",
        sourceRef: "test_ses_01",
        principalId: targetPrincipalId,
        membershipId: "mem_target_01",
        realm: "tenant",
        status: "active",
        authTime: now,
        authMethods: ["oidc"],
        tokenVersion: 1,
        idleExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        absoluteExpiresAt: new Date(Date.now() + 86400000).toISOString(),
        revokedAt: null,
        revokedByPrincipalId: null,
        revokeReason: null,
        deviceSummary: null,
        riskSummary: null,
        createdAt: now,
        updatedAt: now,
      });

      expect(session.status).toBe("active");

      const actor = {
        actorType: "user",
        actorId: "usr_admin",
        realm: "platform",
      };

      const { items } = await service.createCampaign(
        {
          title: "Revocation Drill Campaign",
          realm: "platform",
          reviewerPrincipalId: "usr_admin",
          deadlineAt: new Date(Date.now() + 86400000).toISOString(),
        },
        actor as any,
      );

      const item = items.find((i) => i.targetPrincipalId === targetPrincipalId)!;

      await service.decideReviewItem(
        item.reviewId,
        {
          reviewId: item.reviewId,
          decision: "remove",
          mutation: {
            reasonCode: "SECURITY_OFFBOARDING",
            expectedVersion: item.version,
          },
        },
        actor as any,
      );

      // Verify session was revoked in identity repository
      const targetSessions = await identityRepo.listSessionsByPrincipal(targetPrincipalId);
      const revokedSession = targetSessions.find((s) => s.sessionId === session.sessionId);
      expect(revokedSession).toBeDefined();
      expect(revokedSession?.status).toBe("revoked");
      expect(revokedSession?.revokeReason).toContain("ACCESS_REVIEW_REVOCATION");
    });
  });

  describe("5. Evidence is Immutable and Queryable", () => {
    it("produces immutable evidence records queryable by campaign, tenant, and decision", async () => {
      const actor = {
        actorType: "user",
        actorId: "usr_auditor",
        realm: "platform",
      };

      const { items } = await service.createCampaign(
        {
          title: "Audit Evidence Verification Campaign",
          realm: "platform",
          reviewerPrincipalId: "usr_auditor",
          deadlineAt: new Date(Date.now() + 86400000).toISOString(),
        },
        actor as any,
      );

      const item = items[0];

      await service.decideReviewItem(
        item.reviewId,
        {
          reviewId: item.reviewId,
          decision: "certify",
          mutation: {
            reasonCode: "AUDIT_TEST_CERTIFY",
            expectedVersion: item.version,
            note: "Verified compliance requirements",
          },
        },
        actor as any,
      );

      const evidenceList = await service.listEvidence(
        { campaignId: item.campaignId },
        actor as any,
      );

      expect(evidenceList.length).toBeGreaterThanOrEqual(1);
      const record = evidenceList[0];
      expect(record.campaignId).toBe(item.campaignId);
      expect(record.reviewId).toBe(item.reviewId);
      expect(record.decision).toBe("certify");
      expect(record.reasonCode).toBe("AUDIT_TEST_CERTIFY");
      expect(record.beforeState).toBeDefined();
      expect(record.afterState).toBeDefined();
      expect(record.createdAt).toBeDefined();
    });
  });
});
