import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CrossAppResourceLink } from "../../../../packages/contracts/src";
import {
  resolvePlatformAdminOrigin,
  buildPlatformAdminAuditUrl,
  sanitizeAuditHref,
  resolveCrossAppHref,
} from "../../../../apps/ops-console-web/components/ops-assistant/cross-app-url";
import {
  buildAssistantActions,
  resolveAssistantActionHref,
} from "../../../../apps/ops-console-web/components/ops-assistant/assistant-actions";
import type { OpsAssistantContext } from "../../../../apps/ops-console-web/components/ops-assistant/context-envelope";

describe("SR-OPS-SHELL-001: Audit and Cross-App Links", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL;
    delete process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN;
    delete process.env.NEXT_PUBLIC_PLATFORM_ADMIN_BASE_URL;
    delete process.env.PLATFORM_ADMIN_BASE_URL;
    delete process.env.DRTS_PLATFORM_ADMIN_URL;
    delete process.env.DRTS_DEV_PLATFORM_ADMIN_BASE_URL;
    delete process.env.DRTS_OPERATIONAL_PLATFORM_ADMIN_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("resolvePlatformAdminOrigin", () => {
    it("returns default local development origin when no env is configured", () => {
      const origin = resolvePlatformAdminOrigin();
      expect(origin).toBe("http://localhost:3002");
    });

    it("prioritizes NEXT_PUBLIC_PLATFORM_ADMIN_URL", () => {
      process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL = "https://admin.dev.drts.example.com/";
      const origin = resolvePlatformAdminOrigin();
      expect(origin).toBe("https://admin.dev.drts.example.com");
    });

    it("respects PLATFORM_ADMIN_BASE_URL if configured", () => {
      process.env.PLATFORM_ADMIN_BASE_URL = "https://platform.internal:8443";
      const origin = resolvePlatformAdminOrigin();
      expect(origin).toBe("https://platform.internal:8443");
    });

    it("respects DRTS_DEV_PLATFORM_ADMIN_BASE_URL", () => {
      process.env.DRTS_DEV_PLATFORM_ADMIN_BASE_URL = "http://127.0.0.1:3102";
      const origin = resolvePlatformAdminOrigin();
      expect(origin).toBe("http://127.0.0.1:3102");
    });
  });

  describe("buildPlatformAdminAuditUrl", () => {
    it("builds a clean /audit URL when no context is provided", () => {
      process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL = "http://localhost:3002";
      const url = buildPlatformAdminAuditUrl();
      expect(url).toBe("http://localhost:3002/audit");
    });

    it("attaches auditId, resourceType, and resourceId context", () => {
      process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL = "http://localhost:3002";
      const url = buildPlatformAdminAuditUrl({
        auditId: "aud-9981",
        resourceType: "incident",
        resourceId: "inc-tpe-0042",
      });

      expect(url).toContain("http://localhost:3002/audit?");
      const parsed = new URL(url);
      expect(parsed.searchParams.get("auditId")).toBe("aud-9981");
      expect(parsed.searchParams.get("resourceType")).toBe("incident");
      expect(parsed.searchParams.get("resourceId")).toBe("inc-tpe-0042");
    });

    it("attaches moduleName and actorId context when supplied", () => {
      process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL = "http://localhost:3002";
      const url = buildPlatformAdminAuditUrl({
        moduleName: "dispatch",
        actorId: "usr-ops-lead",
      });

      const parsed = new URL(url);
      expect(parsed.searchParams.get("module")).toBe("dispatch");
      expect(parsed.searchParams.get("actorId")).toBe("usr-ops-lead");
    });
  });

  describe("sanitizeAuditHref", () => {
    it("resolves relative /audit?auditId=... to platform-admin origin instead of ops-console 404", () => {
      process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL = "http://localhost:3002";
      const sanitized = sanitizeAuditHref("/audit?auditId=aud-123", {
        resourceType: "order",
        resourceId: "ord-555",
      });

      expect(sanitized.startsWith("http://localhost:3002/audit?")).toBe(true);
      const parsed = new URL(sanitized);
      expect(parsed.searchParams.get("auditId")).toBe("aud-123");
      expect(parsed.searchParams.get("resourceType")).toBe("order");
      expect(parsed.searchParams.get("resourceId")).toBe("ord-555");
    });

    it("strips incorrect /platform-admin prefix and points to platform-admin /audit", () => {
      process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL = "http://localhost:3002";
      // This reproduces finding R18: link previously had /platform-admin/audit on ops domain
      const sanitized = sanitizeAuditHref("/platform-admin/audit?auditId=aud-r18", {
        resourceType: "incident",
        resourceId: "inc-r18",
      });

      expect(sanitized.startsWith("http://localhost:3002/audit?")).toBe(true);
      expect(sanitized).not.toContain("/platform-admin/audit");
      const parsed = new URL(sanitized);
      expect(parsed.searchParams.get("auditId")).toBe("aud-r18");
      expect(parsed.searchParams.get("resourceType")).toBe("incident");
      expect(parsed.searchParams.get("resourceId")).toBe("inc-r18");
    });

    it("rewrites absolute URL from ops console domain (port 3000) to platform-admin origin", () => {
      process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL = "http://localhost:3002";
      const opsDomainAudit = "http://localhost:3000/platform-admin/audit?auditId=aud-r18-abs";
      const sanitized = sanitizeAuditHref(opsDomainAudit, {
        resourceType: "incident",
        resourceId: "inc-r18",
      });

      expect(sanitized.startsWith("http://localhost:3002/audit?")).toBe(true);
      expect(sanitized).not.toContain("localhost:3000");
      const parsed = new URL(sanitized);
      expect(parsed.searchParams.get("auditId")).toBe("aud-r18-abs");
      expect(parsed.searchParams.get("resourceType")).toBe("incident");
    });

    it("falls back to buildPlatformAdminAuditUrl if href is empty or null", () => {
      process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL = "http://localhost:3002";
      const sanitized = sanitizeAuditHref(null, {
        auditId: "aud-fallback",
        resourceType: "driver",
        resourceId: "drv-001",
      });

      expect(sanitized).toBe("http://localhost:3002/audit?auditId=aud-fallback&resourceType=driver&resourceId=drv-001");
    });
  });

  describe("resolveCrossAppHref", () => {
    it("resolves payments queue link to platform-admin origin", () => {
      process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL = "http://localhost:3002";
      const link: CrossAppResourceLink = {
        targetApp: "platform-admin",
        route: "/payments",
        resourceType: "payments_queue",
        resourceId: "",
        openMode: "new_tab",
        label: "Payments",
      };

      const resolved = resolveCrossAppHref(link);
      expect(resolved).toBe("http://localhost:3002/payments");
    });

    it("resolves fleet governance offboarding link to platform-admin origin", () => {
      process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL = "http://localhost:3002";
      const link: CrossAppResourceLink = {
        targetApp: "platform-admin",
        route: "/fleet?tab=offboarding",
        resourceType: "fleet_offboarding",
        resourceId: "",
        openMode: "new_tab",
        label: "Fleet",
      };

      const resolved = resolveCrossAppHref(link);
      expect(resolved).toBe("http://localhost:3002/fleet?tab=offboarding");
    });

    it("strips legacy /_apps/platform-admin prefix if present", () => {
      process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL = "http://localhost:3002";
      const link: CrossAppResourceLink = {
        targetApp: "platform-admin",
        route: "/_apps/platform-admin/adapter-registry",
        resourceType: "adapter_registry",
        resourceId: "",
        openMode: "new_tab",
        label: "Adapters",
      };

      const resolved = resolveCrossAppHref(link);
      expect(resolved).toBe("http://localhost:3002/adapter-registry");
    });
  });

  describe("buildAssistantActions for /incidents and cross-app navigation", () => {
    const mockContext: OpsAssistantContext = {
      route: "/incidents",
      locale: "en",
      identity: {
        actorType: "ops_user",
        realm: "ops",
        env: "development",
      },
      health: {
        status: "healthy",
        degradedServices: [],
        lastCheckedAt: "2026-09-06T00:00:00Z",
      },
      selectedEntity: {
        kind: "incident",
        id: "inc-demo-999",
      },
    };

    it("generates cross_app audit action on /incidents route carrying incident resource context", () => {
      process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL = "http://localhost:3002";
      const actions = buildAssistantActions(mockContext);
      const crossAppAction = actions.find((a) => a.kind === "cross_app");

      expect(crossAppAction).toBeDefined();
      if (crossAppAction && crossAppAction.kind === "cross_app") {
        expect(crossAppAction.link.targetApp).toBe("platform-admin");
        expect(crossAppAction.link.resourceType).toBe("incident");
        expect(crossAppAction.link.resourceId).toBe("inc-demo-999");
        expect(crossAppAction.link.openMode).toBe("new_tab");

        const href = resolveAssistantActionHref(crossAppAction);
        expect(href.startsWith("http://localhost:3002/audit?")).toBe(true);
        const parsed = new URL(href);
        expect(parsed.searchParams.get("resourceType")).toBe("incident");
        expect(parsed.searchParams.get("resourceId")).toBe("inc-demo-999");
      }
    });
  });

  describe("Real DRTS Domain ActionReceipt & Contextual Audit Links (R18 / C048 Acceptance)", () => {
    it("serializes dispatch order action receipt with real domain IDs into runtime platform-admin audit URL", () => {
      process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL = "http://localhost:3002";

      const realDispatchReceipt = {
        actionId: "act-disp-assign-20260908-01",
        auditId: "aud-disp-log-20260908-991",
        resourceType: "dispatch_order",
        resourceId: "ord-tpe-2026-8801",
        status: "completed",
        message: "Assigned driver drv-north-0108 to order ord-tpe-2026-8801",
        auditHref: "/audit?auditId=aud-disp-log-20260908-991",
      };

      const resolvedAuditHref = sanitizeAuditHref(realDispatchReceipt.auditHref, {
        auditId: realDispatchReceipt.auditId,
        resourceType: realDispatchReceipt.resourceType,
        resourceId: realDispatchReceipt.resourceId,
      });

      expect(resolvedAuditHref.startsWith("http://localhost:3002/audit?")).toBe(true);
      expect(resolvedAuditHref).not.toContain("localhost:3000"); // Never stays on ops console port 3000
      expect(resolvedAuditHref).not.toContain("/platform-admin/audit"); // No nested 404 path

      const parsed = new URL(resolvedAuditHref);
      expect(parsed.searchParams.get("auditId")).toBe("aud-disp-log-20260908-991");
      expect(parsed.searchParams.get("resourceType")).toBe("dispatch_order");
      expect(parsed.searchParams.get("resourceId")).toBe("ord-tpe-2026-8801");
    });

    it("serializes safety incident action receipt with real domain IDs into runtime audit URL", () => {
      process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL = "http://localhost:3002";

      const realIncidentReceipt = {
        actionId: "act-inc-escalate-20260908-0042",
        auditId: "aud-inc-log-20260908-0042",
        resourceType: "incident",
        resourceId: "inc-tpe-2026-0042",
        status: "completed",
        message: "Incident inc-tpe-2026-0042 escalated to supervisor review",
        auditHref: "/platform-admin/audit?auditId=aud-inc-log-20260908-0042",
      };

      const resolvedAuditHref = sanitizeAuditHref(realIncidentReceipt.auditHref, {
        auditId: realIncidentReceipt.auditId,
        resourceType: realIncidentReceipt.resourceType,
        resourceId: realIncidentReceipt.resourceId,
      });

      expect(resolvedAuditHref.startsWith("http://localhost:3002/audit?")).toBe(true);
      const parsed = new URL(resolvedAuditHref);
      expect(parsed.searchParams.get("auditId")).toBe("aud-inc-log-20260908-0042");
      expect(parsed.searchParams.get("resourceType")).toBe("incident");
      expect(parsed.searchParams.get("resourceId")).toBe("inc-tpe-2026-0042");
    });

    it("ensures all cross-app links mandate new_tab openMode to prevent disrupting operator session", () => {
      process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL = "http://localhost:3002";

      const routes = ["/dispatch", "/vehicles", "/revenue", "/contracts", "/incidents"] as const;
      for (const route of routes) {
        const context: OpsAssistantContext = {
          route,
          locale: "zh",
          identity: {
            actorType: "ops_user",
            realm: "ops",
            env: "development",
          },
          health: {
            status: "healthy",
            degradedServices: [],
            lastCheckedAt: "2026-09-08T14:00:00Z",
          },
          selectedEntity: {
            kind: route === "/incidents" ? "incident" : "order",
            id: route === "/incidents" ? "inc-tpe-2026-0042" : "ord-tpe-2026-8801",
          },
        };

        const actions = buildAssistantActions(context);
        const crossAppActions = actions.filter((a) => a.kind === "cross_app");
        for (const action of crossAppActions) {
          if (action.kind === "cross_app") {
            expect(action.link.openMode).toBe("new_tab");
            const resolved = resolveAssistantActionHref(action);
            expect(resolved.startsWith("http://localhost:3002/")).toBe(true);
            expect(resolved).not.toContain("localhost:3000");
          }
        }
      }
    });
  });
});
