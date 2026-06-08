import { describe, expect, it, vi } from "vitest";

import { createPlatformAdminAssistantTools } from "../../apps/platform-admin-web/components/assistant/assistant-tools";
import {
  resolveCrossAppHref,
  resolvePlatformAdminRouteByHref,
} from "../../apps/platform-admin-web/components/assistant/route-context";

describe("platform admin assistant tools", () => {
  it("allows only registered platform-admin routes", () => {
    const navigateToHref = vi.fn((href: string) => ({
      ok: true as const,
      code: "route_opened",
      message: href,
    }));
    const tools = createPlatformAdminAssistantTools({
      pageBridge: null,
      navigateToHref,
      openCrossAppLink: vi.fn(),
    });

    const allowed = tools.route.open({ routeId: "pricing" });
    const denied = tools.route.open({ href: "/totally-custom-route" });

    expect(allowed.ok).toBe(true);
    expect(navigateToHref).toHaveBeenCalledWith("/pricing");
    expect(denied).toEqual({
      ok: false,
      code: "route_not_allowed",
      message: "route.open only accepts registered Platform Admin routes.",
    });
  });

  it("opens only page-owned cross-app links in a new tab", () => {
    const openCrossAppLink = vi.fn((link) => ({
      ok: true as const,
      code: "cross_app_opened",
      message: link.label,
    }));
    const tools = createPlatformAdminAssistantTools({
      pageBridge: {
        pageId: "pricing",
        crossAppLinks: {
          allowed: {
            targetApp: "ops-console",
            route: "/dispatch/orders/order-123",
            resourceType: "order",
            resourceId: "order-123",
            openMode: "new_tab",
            label: "Open order",
          },
          disallowedSameTab: {
            targetApp: "tenant-console",
            route: "/bookings/booking-123",
            resourceType: "booking",
            resourceId: "booking-123",
            openMode: "same_tab",
            label: "Open booking",
          },
        },
      },
      navigateToHref: vi.fn(),
      openCrossAppLink,
    });

    const allowed = tools.route.open_cross_app({ linkId: "allowed" });
    const deniedUnknown = tools.route.open_cross_app({ linkId: "missing" });
    const deniedSameTab = tools.route.open_cross_app({
      linkId: "disallowedSameTab",
    });

    expect(allowed.ok).toBe(true);
    expect(openCrossAppLink).toHaveBeenCalledTimes(1);
    expect(deniedUnknown.code).toBe("cross_app_link_not_allowed");
    expect(deniedSameTab.code).toBe("cross_app_new_tab_required");
  });

  it("delegates filters and drafts only to current page adapters", () => {
    const tools = createPlatformAdminAssistantTools({
      pageBridge: {
        pageId: "tenants",
        filters: {
          rollout_stage: {
            apply: (value) => ({
              ok: true,
              code: "filter_applied",
              message: String(value),
            }),
          },
        },
        drafts: {
          pricing_rule_create: {
            fill: (values) => ({
              ok: true,
              code: "draft_filled",
              message: JSON.stringify(values),
            }),
          },
        },
      },
      navigateToHref: vi.fn(),
      openCrossAppLink: vi.fn(),
    });

    expect(
      tools.page.apply_filter({ filterId: "rollout_stage", value: "pilot" }),
    ).toEqual({
      ok: true,
      code: "filter_applied",
      message: "pilot",
    });
    expect(
      tools.page.fill_draft({
        draftId: "pricing_rule_create",
        values: { ruleName: "Night Queue" },
      }),
    ).toEqual({
      ok: true,
      code: "draft_filled",
      message: JSON.stringify({ ruleName: "Night Queue" }),
    });
    expect(
      tools.page.apply_filter({ filterId: "not-registered", value: "pilot" }),
    ).toEqual({
      ok: false,
      code: "filter_not_allowed",
      message: "page.apply_filter only accepts page-owned filter adapters.",
    });
  });
});

describe("platform admin assistant route helpers", () => {
  it("resolves registered hrefs only", () => {
    expect(resolvePlatformAdminRouteByHref("/payments")).toEqual({
      routeId: "payments",
      href: "/payments",
    });
    expect(resolvePlatformAdminRouteByHref("/payments/custom")).toBeNull();
  });

  it("resolves cross-app hrefs from typed links", () => {
    expect(
      resolveCrossAppHref({
        targetApp: "ops-console",
        route: "/dispatch/orders/order-123",
        resourceType: "order",
        resourceId: "order-123",
        openMode: "new_tab",
        label: "Open order",
      }),
    ).toBe("/_apps/ops-console/dispatch/orders/order-123");
  });
});
