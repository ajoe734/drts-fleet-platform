import { describe, expect, it, vi } from "vitest";

import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { PlatformAdminController } from "../../src/modules/platform-admin/platform-admin.controller";

function platformAdminIdentity(actorId: string): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "platform_admin",
    actorId,
    realm: "platform",
    tenantId: null,
    roleFamilies: ["platform_admin"],
    roles: ["platform_admin"],
    scopes: [],
    requestId: null,
  };
}

describe("PlatformAdminController", () => {
  it("routes pricing draft review requests through the authenticated actor", () => {
    const platformAdminService = {
      requestPlatformPricingRuleReview: vi.fn(() => ({
        ruleId: "rule-001",
        status: "review_required",
      })),
    };
    const controller = new PlatformAdminController(
      platformAdminService as never,
    );

    const response = controller.requestPlatformPricingRuleReview(
      "rule-001",
      platformAdminIdentity("platform-admin-jwt-200"),
      "req-pricing-controller-review-001",
    );

    expect(
      platformAdminService.requestPlatformPricingRuleReview,
    ).toHaveBeenCalledWith(
      "rule-001",
      "req-pricing-controller-review-001",
      "platform-admin-jwt-200",
    );
    expect(response).toEqual({
      data: {
        ruleId: "rule-001",
        status: "review_required",
      },
      meta: {
        requestId: "req-pricing-controller-review-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("returns an ActionReceipt envelope when publishing a pricing rule", () => {
    const platformAdminService = {
      publishPlatformPricingRule: vi.fn(() => ({
        data: {
          rule: {
            ruleId: "rule-001",
          },
          receiptStatus: "completed",
          receiptMessage: "Pricing rule published.",
        },
        auditLog: {
          auditId: "audit-001",
          requestId: "req-pricing-controller-001",
          resourceType: "platform_pricing_rule",
          resourceId: "rule-001",
        },
      })),
    };
    const controller = new PlatformAdminController(
      platformAdminService as never,
    );

    const response = controller.publishPlatformPricingRule(
      "rule-001",
      {
        effectiveFrom: "2026-05-26T10:00:00.000Z",
        reason: "approved pricing cutover",
      },
      platformAdminIdentity("platform-admin-jwt-201"),
      "req-pricing-controller-001",
    );

    expect(platformAdminService.publishPlatformPricingRule).toHaveBeenCalledWith(
      "rule-001",
      {
        effectiveFrom: "2026-05-26T10:00:00.000Z",
        reason: "approved pricing cutover",
      },
      "req-pricing-controller-001",
      "platform-admin-jwt-201",
    );
    expect(response).toEqual({
      data: {
        actionId: "req-pricing-controller-001",
        auditId: "audit-001",
        resourceType: "platform_pricing_rule",
        resourceId: "rule-001",
        status: "completed",
        message: "Pricing rule published.",
      },
      meta: {
        requestId: "req-pricing-controller-001",
        timestamp: expect.any(String),
      },
    });
  });
});
