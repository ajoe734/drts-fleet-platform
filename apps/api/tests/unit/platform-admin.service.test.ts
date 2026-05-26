import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { PlatformAdminService } from "../../src/modules/platform-admin/platform-admin.service";

const PLATFORM_ADMIN_ACTOR_ID = "platform-admin-jwt-011";

function createService() {
  let auditSequence = 0;
  const auditNotificationService = {
    recordAuditLog: vi.fn((input) => {
      auditSequence += 1;
      return {
        auditId: `audit-${auditSequence}`,
        actorId: input.actorId ?? null,
        actorType: input.actorType,
        tenantId: input.tenantId,
        moduleName: input.moduleName,
        actionName: input.actionName,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        oldValuesSummary: input.oldValuesSummary,
        newValuesSummary: input.newValuesSummary,
        requestId: input.requestId ?? `req-audit-${auditSequence}`,
        createdAt: `2026-05-26T00:00:0${auditSequence}.000Z`,
      };
    }),
  };
  const platformAdminRepository = {
    persistChanges: vi.fn().mockResolvedValue(undefined),
    reportPersistenceFailure: vi.fn(),
  };

  const service = new PlatformAdminService(
    auditNotificationService as never,
    platformAdminRepository as never,
  );

  return {
    service,
    auditNotificationService,
    platformAdminRepository,
  };
}

function createDraftPricingRule(
  service: PlatformAdminService,
  overrides?: Partial<{
    ruleName: string;
    version: string;
    serviceFeeBps: number;
    reimbursementMode: "platform_funded" | "mixed";
    applicableTo: string;
    notes: string | null;
  }>,
) {
  return service.createPlatformPricingRule({
    ruleName: overrides?.ruleName ?? "Enterprise Summer Pricing",
    version: overrides?.version ?? "2026.07",
    serviceFeeBps: overrides?.serviceFeeBps ?? 1350,
    reimbursementMode: overrides?.reimbursementMode ?? "platform_funded",
    applicableTo: overrides?.applicableTo ?? "all",
    notes: overrides?.notes ?? "summer cutover draft",
  });
}

function requestPricingReview(
  service: PlatformAdminService,
  ruleId: string,
  requestId = "req-pricing-review-001",
  actorId = PLATFORM_ADMIN_ACTOR_ID,
) {
  return service.requestPlatformPricingRuleReview(ruleId, requestId, actorId);
}

function findAction(
  rule: ReturnType<PlatformAdminService["listPlatformPricingRules"]>[number],
  action: string,
) {
  return rule.availableActions.find((candidate) => candidate.action === action);
}

describe("PlatformAdminService.deleteDraftPublicInfoVersion", () => {
  it("deletes only draft public info versions and persists the removal", () => {
    const { service, auditNotificationService, platformAdminRepository } =
      createService();
    const draft = service.createPublicInfoVersion({
      title: "Draft version to delete",
      callPhone: null,
      complaintPhone: null,
      callRateText: null,
      fareText: null,
      paymentMethodText: null,
      effectiveFrom: null,
      effectiveTo: null,
    });

    const deleted = service.deleteDraftPublicInfoVersion(
      draft.versionId,
      "req-delete-draft",
      PLATFORM_ADMIN_ACTOR_ID,
    );

    expect(deleted.versionId).toBe(draft.versionId);
    expect(
      service
        .listPublicInfoVersions()
        .some((version) => version.versionId === draft.versionId),
    ).toBe(false);
    expect(platformAdminRepository.persistChanges).toHaveBeenCalledWith({
      deletedPublicInfoVersionIds: [draft.versionId],
    });
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-delete-draft",
        actorId: PLATFORM_ADMIN_ACTOR_ID,
        actionName: "delete_draft_public_info_version",
        resourceId: draft.versionId,
      }),
    );
  });

  it("rejects deleting published public info versions", () => {
    const { service, platformAdminRepository } = createService();
    const published = service
      .listPublicInfoVersions()
      .find((version) => version.status === "published");

    expect(published).toBeDefined();
    expect(() =>
      service.deleteDraftPublicInfoVersion(published!.versionId),
    ).toThrowError(ApiRequestError);
    expect(platformAdminRepository.persistChanges).not.toHaveBeenCalledWith(
      expect.objectContaining({
        deletedPublicInfoVersionIds: [published!.versionId],
      }),
    );
  });
});

describe("PlatformAdminService.publishPlacardVersion", () => {
  it("records the verified publisher actorId in placard publish audit logs", () => {
    const { service, auditNotificationService, platformAdminRepository } =
      createService();
    const draftPublicInfo = service.createPublicInfoVersion({
      title: "Draft disclosure for placard publish",
      callPhone: null,
      complaintPhone: null,
      callRateText: null,
      fareText: null,
      paymentMethodText: null,
      effectiveFrom: null,
      effectiveTo: null,
    });
    const placard = service.generatePlacardVersion(
      {
        versionCode: "placard-2026-q4",
        publicInfoVersionId: draftPublicInfo.versionId,
        templateName: "seatback-v2",
        publishedAt: null,
      },
      "req-generate-placard",
    );

    const published = service.publishPlacardVersion(
      placard.placardVersionId,
      {},
      "req-publish-placard",
      "platform-admin-jwt-022",
    );

    expect(published.publishedAt).toEqual(expect.any(String));
    expect(platformAdminRepository.persistChanges).toHaveBeenCalledWith({
      placardVersions: [
        expect.objectContaining({ placardVersionId: placard.placardVersionId }),
      ],
    });
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-publish-placard",
        actorId: "platform-admin-jwt-022",
        actionName: "publish_placard_version",
        resourceId: placard.placardVersionId,
      }),
    );
  });
});

describe("PlatformAdminService pricing publish state machine", () => {
  it("transitions draft rules to review_required and exposes publish as a high-risk action requiring a reason", () => {
    const { service, auditNotificationService } = createService();
    const draft = createDraftPricingRule(service, {
      ruleName: "Contract Shuttle Fee",
      version: "2026.08",
    });

    expect(draft.status).toBe("draft");
    expect(findAction(draft, "publish")).toEqual(
      expect.objectContaining({
        enabled: false,
        disabledReasonCode: "pricing_review_required",
        requiresReason: true,
        riskLevel: "high",
      }),
    );

    const reviewed = requestPricingReview(
      service,
      draft.ruleId,
      "req-pricing-review-101",
      "platform-admin-jwt-101",
    );

    expect(reviewed.status).toBe("review_required");
    expect(reviewed.reviewRequestedBy).toBe("platform-admin-jwt-101");
    expect(findAction(reviewed, "publish")).toEqual(
      expect.objectContaining({
        enabled: true,
        requiresReason: true,
        riskLevel: "high",
      }),
    );
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-pricing-review-101",
        actorId: "platform-admin-jwt-101",
        actionName: "request_platform_pricing_rule_review",
        resourceId: draft.ruleId,
      }),
    );
  });

  it("rejects publish attempts from non-review_required states", () => {
    const { service } = createService();
    const draft = createDraftPricingRule(service, {
      ruleName: "Non Reviewed Draft",
      version: "2026.09",
    });

    expect(() =>
      service.publishPlatformPricingRule(
        draft.ruleId,
        {
          reason: "attempting to skip review",
        },
        "req-pricing-publish-rejected",
        PLATFORM_ADMIN_ACTOR_ID,
      ),
    ).toThrowError(ApiRequestError);
  });

  it("transitions review_required rules to scheduled when effectiveFrom is in the future", () => {
    const { service } = createService();
    const reviewed = requestPricingReview(
      service,
      createDraftPricingRule(service, {
        ruleName: "Future Window Publish",
        version: "2026.10",
      }).ruleId,
      "req-pricing-review-102",
      "platform-admin-jwt-102",
    );

    const result = service.publishPlatformPricingRule(
      reviewed.ruleId,
      {
        effectiveFrom: "2099-01-01T00:00:00.000Z",
        effectiveTo: "2099-03-31T23:59:59.000Z",
        reason: "scheduled tenant cutover",
      },
      "req-pricing-publish-scheduled",
      "platform-admin-jwt-102",
    );

    expect(result.data.rule.status).toBe("scheduled");
    expect(result.data.rule.scheduledBy).toBe("platform-admin-jwt-102");
    expect(result.data.receiptStatus).toBe("accepted");
    expect(result.auditLog.auditId).toBe("audit-3");
    expect(result.auditLog.actionName).toBe(
      "schedule_platform_pricing_rule_publish",
    );
    expect(result.auditLog.newValuesSummary).toEqual(
      expect.objectContaining({
        status: "scheduled",
        reason: "scheduled tenant cutover",
      }),
    );
  });

  it("transitions scheduled rules to published once the effective window is reached", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-01T00:00:00.000Z"));
      const { service } = createService();
      const reviewed = requestPricingReview(
        service,
        createDraftPricingRule(service, {
          ruleName: "Timer Activated Publish",
          version: "2026.11",
        }).ruleId,
        "req-pricing-review-103",
        "platform-admin-jwt-103",
      );

      const scheduled = service.publishPlatformPricingRule(
        reviewed.ruleId,
        {
          effectiveFrom: "2026-07-01T01:00:00.000Z",
          reason: "release coordinated with settlement cutover",
        },
        "req-pricing-publish-scheduled-activate",
        "platform-admin-jwt-103",
      );

      expect(scheduled.data.rule.status).toBe("scheduled");

      vi.setSystemTime(new Date("2026-07-01T01:00:00.000Z"));
      const activated = service.activateScheduledPlatformPricingRule(
        reviewed.ruleId,
        "req-pricing-activate-103",
        "platform-admin-jwt-103",
      );

      expect(activated.status).toBe("published");
      expect(activated.publishedBy).toBe("platform-admin-jwt-103");
      expect(activated.scheduledAt).toBeNull();
      expect(findAction(activated, "rollback_hold")).toEqual(
        expect.objectContaining({
          enabled: true,
          requiresReason: true,
          riskLevel: "high",
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("transitions review_required rules directly to published when effectiveFrom is current or past", () => {
    const { service } = createService();
    const reviewed = requestPricingReview(
      service,
      createDraftPricingRule(service, {
        ruleName: "Immediate Publish",
        version: "2026.12",
      }).ruleId,
      "req-pricing-review-104",
      "platform-admin-jwt-104",
    );

    const result = service.publishPlatformPricingRule(
      reviewed.ruleId,
      {
        effectiveFrom: "2000-01-01T00:00:00.000Z",
        reason: "same-day pricing correction",
      },
      "req-pricing-publish-immediate",
      "platform-admin-jwt-104",
    );

    expect(result.data.rule.status).toBe("published");
    expect(result.data.rule.publishedBy).toBe("platform-admin-jwt-104");
    expect(result.data.receiptStatus).toBe("completed");
    expect(result.auditLog.actionName).toBe("publish_platform_pricing_rule");
  });

  it("transitions the previous published rule to superseded when a replacement version publishes", () => {
    const { service } = createService();
    const reviewed = requestPricingReview(
      service,
      createDraftPricingRule(service, {
        ruleName: "Standard Service Fee",
        version: "2026.05",
        applicableTo: "all",
      }).ruleId,
      "req-pricing-review-105",
      "platform-admin-jwt-105",
    );

    const result = service.publishPlatformPricingRule(
      reviewed.ruleId,
      {
        effectiveFrom: "2000-01-01T00:00:00.000Z",
        reason: "q2 fee plan replacement",
      },
      "req-pricing-publish-supersede",
      "platform-admin-jwt-105",
    );

    const superseded = service
      .listPlatformPricingRules()
      .find((rule) => rule.ruleId === "rule-demo-001");

    expect(result.data.rule.status).toBe("published");
    expect(superseded).toEqual(
      expect.objectContaining({
        status: "superseded",
        supersededByRuleId: reviewed.ruleId,
      }),
    );
  });

  it("transitions published rules to rollback_hold with a required reason", () => {
    const { service, auditNotificationService } = createService();

    const held = service.setPlatformPricingRuleRollbackHold(
      "rule-demo-002",
      "manual rollback due to reimbursement regression",
      "req-pricing-hold-001",
      "platform-admin-jwt-106",
    );

    expect(held.status).toBe("rollback_hold");
    expect(held.rollbackHeldBy).toBe("platform-admin-jwt-106");
    expect(held.rollbackHoldReason).toBe(
      "manual rollback due to reimbursement regression",
    );
    expect(findAction(held, "publish")).toEqual(
      expect.objectContaining({
        enabled: false,
        disabledReasonCode: "pricing_rollback_hold_active",
        requiresReason: true,
      }),
    );
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-pricing-hold-001",
        actorId: "platform-admin-jwt-106",
        actionName: "set_platform_pricing_rule_rollback_hold",
        resourceId: "rule-demo-002",
      }),
    );
  });
});
