/**
 * Unit evidence for PA-AI-FE-002 — Platform Admin assistant route context.
 *
 * Verifies the deterministic route-context registry/adapter:
 *   - all 18 canvas routes have metadata + a resolvable context,
 *   - context is built from route/query/page-owned selection (no DOM scraping),
 *   - the 3 body-parity-pending routes resolve metadata even though their bodies
 *     are owned by separate workers,
 *   - the acceptance-named routes (/, /tenants, /partners/[entrySlug], /payments,
 *     /audit, /feature-flags) produce the expected routeKey/tab/entity/tier.
 */

import { describe, expect, it } from "vitest";

import {
  PLATFORM_ADMIN_ROUTES,
  PLATFORM_ADMIN_ROUTE_KEYS,
  buildRouteContext,
  createStablePageBridgeProxy,
  getRouteDescriptor,
  matchRoute,
} from "../../apps/platform-admin-web/components/assistant/route-context";
import type {
  PageContextSnapshot,
  PlatformAdminRouteKey,
} from "../../apps/platform-admin-web/components/assistant/assistant-types";
import type { PlatformAdminAssistantPageBridge } from "../../apps/platform-admin-web/components/assistant/route-context";

describe("Platform Admin route registry", () => {
  it("registers exactly the 34 current platform-admin routes", () => {
    // 22 existing platform-admin routes plus 9 sandbox compliance /
    // investigation surfaces added in the sandbox governance wave,
    // plus 3 P-5 back-office disclosure/fare surfaces.
    expect(PLATFORM_ADMIN_ROUTES).toHaveLength(34);
    expect(new Set(PLATFORM_ADMIN_ROUTE_KEYS).size).toBe(34);
  });

  it("has a unique, valid descriptor per route key", () => {
    for (const key of PLATFORM_ADMIN_ROUTE_KEYS) {
      const descriptor = getRouteDescriptor(key);
      expect(descriptor.routeKey).toBe(key);
      expect(descriptor.pathTemplate.startsWith("/")).toBe(true);
      // defaultTab, when present, must be one of the route's tabs.
      if (descriptor.defaultTab) {
        expect(descriptor.tabs).toContain(descriptor.defaultTab);
      }
    }
  });

  it("marks exactly the 3 body-parity-pending routes from the audit", () => {
    const pending = PLATFORM_ADMIN_ROUTES.filter(
      (d) => d.bodyParityPending,
    ).map((d) => d.pathTemplate);
    expect(new Set(pending)).toEqual(
      new Set([
        "/tenants/[tenantId]",
        "/payments/reimbursements",
        "/payments/reimbursements/[batchId]",
      ]),
    );
  });
});

describe("matchRoute specificity", () => {
  it("prefers detail routes over their list parent", () => {
    expect(matchRoute("/payments")?.descriptor.routeKey).toBe("payments");
    expect(matchRoute("/payments/reimbursements")?.descriptor.routeKey).toBe(
      "reimbursements",
    );
    expect(
      matchRoute("/payments/reimbursements/batch-99")?.descriptor.routeKey,
    ).toBe("reimbursement-batch-detail");
    expect(matchRoute("/tenants")?.descriptor.routeKey).toBe("tenants");
    expect(matchRoute("/tenants/tnt-1")?.descriptor.routeKey).toBe(
      "tenant-detail",
    );
  });

  it("returns null for an unregistered path", () => {
    expect(matchRoute("/nope/here")).toBeNull();
  });
});

describe("buildRouteContext — every route resolves", () => {
  it("produces a context with a valid refresh tier for all registered routes", () => {
    const validTiers = new Set([
      "fast",
      "medium",
      "slow",
      "manual",
      "push_interrupt",
    ]);
    for (const descriptor of PLATFORM_ADMIN_ROUTES) {
      // Build a concrete path from the template (fill dynamic params).
      const concrete = descriptor.pathTemplate
        .replace("[tenantId]", "tnt-1")
        .replace("[entrySlug]", "acme")
        .replace("[batchId]", "batch-1");
      const ctx = buildRouteContext(concrete);
      expect(ctx.routeKey).toBe(descriptor.routeKey);
      expect(validTiers.has(ctx.refreshTier)).toBe(true);
      expect(ctx.generatedFrom.route).toBe(true);
    }
  });

  it("supports body-parity-pending routes via metadata only", () => {
    const ctx = buildRouteContext("/payments/reimbursements");
    expect(ctx.routeKey).toBe("reimbursements");
    expect(ctx.routeImplemented).toBe(false);
    expect(ctx.warnings.map((w) => w.code)).toContain(
      "route_body_parity_pending",
    );
  });

  it("falls back to home with an unknown_route warning for bad paths", () => {
    const ctx = buildRouteContext("/totally/unknown");
    const homeKey: PlatformAdminRouteKey = "home";
    expect(ctx.routeKey).toBe(homeKey);
    expect(ctx.warnings.map((w) => w.code)).toContain("unknown_route");
  });
});

describe("acceptance-named routes", () => {
  it("/ → home, no tabs, slow tier", () => {
    const ctx = buildRouteContext("/");
    expect(ctx.routeKey).toBe("home");
    expect(ctx.availableTabs).toEqual([]);
    expect(ctx.refreshTier).toBe("slow");
    expect(ctx.routeImplemented).toBe(true);
  });

  it("/tenants → tenants list", () => {
    const ctx = buildRouteContext("/tenants");
    expect(ctx.routeKey).toBe("tenants");
    expect(ctx.visibleEntityRefs).toEqual([]);
  });

  it("/partners/[entrySlug] lifts the slug into a partner-entry ref", () => {
    const ctx = buildRouteContext("/partners/acme-rides");
    expect(ctx.routeKey).toBe("partner-detail");
    expect(ctx.visibleEntityRefs).toEqual([
      { kind: "partner-entry", id: "acme-rides", source: "route-param" },
    ]);
    // Plaintext-once secret guardrail must surface here.
    expect(ctx.warnings.map((w) => w.code)).toContain("plaintext_secret_once");
  });

  it("/payments resolves tabs and honors a page-owned active tab", () => {
    const base = buildRouteContext("/payments");
    expect(base.activeTab).toBe("tenant-invoices");
    expect(base.availableTabs).toContain("reconciliation-issues");

    const withTab = buildRouteContext("/payments", undefined, {
      activeTab: "settlement-matrix",
    });
    expect(withTab.activeTab).toBe("settlement-matrix");
    expect(withTab.generatedFrom.pageSelection).toBe(true);

    // An invalid page tab is ignored (falls back to default).
    const badTab = buildRouteContext("/payments", undefined, {
      activeTab: "not-a-tab",
    });
    expect(badTab.activeTab).toBe("tenant-invoices");
  });

  it("/payments lifts a tenantId query into a tenant ref", () => {
    const fromString = buildRouteContext("/payments", "?tenantId=tnt-7");
    expect(fromString.visibleEntityRefs).toContainEqual({
      kind: "tenant",
      id: "tnt-7",
      source: "query",
    });
    expect(fromString.generatedFrom.query).toBe(true);

    const fromParams = buildRouteContext(
      "/payments",
      new URLSearchParams({ tenantId: "tnt-7" }),
    );
    expect(fromParams.visibleEntityRefs).toContainEqual({
      kind: "tenant",
      id: "tnt-7",
      source: "query",
    });

    const fromRecord = buildRouteContext("/payments", { tenantId: "tnt-7" });
    expect(fromRecord.visibleEntityRefs).toContainEqual({
      kind: "tenant",
      id: "tnt-7",
      source: "query",
    });
  });

  it("/audit → manual tier with legal-hold governance warning", () => {
    const ctx = buildRouteContext("/audit");
    expect(ctx.routeKey).toBe("audit");
    expect(ctx.refreshTier).toBe("manual");
    expect(ctx.warnings.map((w) => w.code)).toContain(
      "legal_hold_evidence_governance",
    );
  });

  it("/feature-flags → platform write-authority warning", () => {
    const ctx = buildRouteContext("/feature-flags");
    expect(ctx.routeKey).toBe("feature-flags");
    expect(ctx.warnings.map((w) => w.code)).toContain(
      "platform_write_authority",
    );
  });
});

describe("page-owned selection — never scraped", () => {
  it("merges page-owned selection refs and labels", () => {
    const ctx = buildRouteContext("/tenants/tnt-1", undefined, {
      selection: [
        {
          kind: "tenant",
          id: "tnt-1",
          label: "Acme Co",
          source: "page-selection",
        },
      ],
    });
    // Route-param ref and page-selection ref for the same tenant dedupe, and the
    // page-owned label wins.
    const tenantRefs = ctx.visibleEntityRefs.filter((r) => r.kind === "tenant");
    expect(tenantRefs).toHaveLength(1);
    expect(tenantRefs[0]?.label).toBe("Acme Co");
    expect(ctx.generatedFrom.pageSelection).toBe(true);
  });
});

describe("createStablePageBridgeProxy", () => {
  it("delegates to the latest page bridge without changing proxy identity", () => {
    let currentSnapshot: PageContextSnapshot = {
      activeTab: "passenger-pricing",
    };
    let currentBridge: PlatformAdminAssistantPageBridge = {
      pageId: "pricing",
      filters: {
        tab: {
          apply: (value: unknown) => ({
            ok: true as const,
            code: "tab_set",
            message: String(value),
          }),
        },
      },
      getContextSnapshot: () => currentSnapshot,
    };

    const proxy = createStablePageBridgeProxy(() => currentBridge);
    const firstFilter = proxy.filters?.tab;

    expect(proxy.pageId).toBe("pricing");
    expect(proxy.getContextSnapshot?.()).toEqual({
      activeTab: "passenger-pricing",
    });
    expect(firstFilter?.apply("history")).toEqual({
      ok: true,
      code: "tab_set",
      message: "history",
    });

    currentSnapshot = {
      activeTab: "placards",
    };
    currentBridge = {
      pageId: "switchboard",
      drafts: {
        create_notice: {
          fill: (values) => ({
            ok: true as const,
            code: "draft_filled",
            message: JSON.stringify(values),
          }),
        },
      },
      crossAppLinks: {
        tenant_console: {
          label: "Tenant users",
          targetApp: "tenant-console",
          route: "/users",
          resourceType: "tenant",
          resourceId: "tnt-1",
          openMode: "new_tab",
        },
      },
      getContextSnapshot: () => currentSnapshot,
    };

    expect(proxy.pageId).toBe("switchboard");
    expect(proxy.filters).toBeUndefined();
    expect(proxy.drafts?.create_notice).toBeDefined();
    expect(proxy.drafts?.create_notice?.fill({ title: "Ops" })).toEqual({
      ok: true,
      code: "draft_filled",
      message: JSON.stringify({ title: "Ops" }),
    });
    expect(proxy.crossAppLinks?.tenant_console).toBeDefined();
    expect(proxy.crossAppLinks?.tenant_console?.route).toBe("/users");
    expect(proxy.getContextSnapshot?.()).toEqual({
      activeTab: "placards",
    });
  });
});
