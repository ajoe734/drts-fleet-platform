import { afterEach, describe, expect, it } from "vitest";

import { Reflector } from "../../apps/api/node_modules/@nestjs/core";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import {
  AUTH_OPEN_ROUTE_KEY,
  BootstrapAuthGuard,
  type AuthenticatedRequestLike,
  type BootstrapRequestIdentity,
} from "../../apps/api/src/common/auth";
import { resolveRouteStepUpPolicy } from "../../apps/api/src/common/auth/step-up.policy";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { NotificationsController } from "../../apps/api/src/modules/audit-notification/notifications.controller";
import { BillingSettlementController } from "../../apps/api/src/modules/billing-settlement/billing-settlement.controller";
import { BillingSettlementService } from "../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { FeatureFlagsController } from "../../apps/api/src/modules/feature-flags/feature-flags.controller";
import { FeatureFlagsService } from "../../apps/api/src/modules/feature-flags/feature-flags.service";
import { PlatformTenantGovernanceController } from "../../apps/api/src/modules/platform-admin/tenant-governance.controller";
import { ProductRuleController } from "../../apps/api/src/modules/product-rule/product-rule.controller";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function createExecutionContext(
  request: AuthenticatedRequestLike,
  handler: unknown,
  target: unknown,
) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => handler,
    getClass: () => target,
  } as never;
}

function makeHeaders(identity: {
  actorType?: string;
  actorId?: string;
  realm?: string;
  tenantId?: string | null;
  scopes?: string[];
}): Record<string, string> {
  return {
    "x-actor-type": identity.actorType ?? "platform_admin",
    "x-actor-id": identity.actorId ?? "actor-001",
    "x-realm": identity.realm ?? "platform",
    ...(identity.tenantId ? { "x-tenant-id": identity.tenantId } : {}),
    "x-scopes": (identity.scopes ?? []).join(" "),
  };
}

function makeIdentity(
  overrides: Partial<BootstrapRequestIdentity> = {},
): BootstrapRequestIdentity {
  return {
    authMode: "jwt_bearer",
    actorType: "platform_admin",
    actorId: "actor-platform-001",
    realm: "platform",
    tenantId: null,
    roleFamilies: ["platform"],
    roles: ["platform_admin"],
    scopes: [
      "foundation:read",
      "foundation:write",
      "billing:read",
      "billing:write",
      "notifications:read",
      "notifications:write",
      "tenant:sla:read",
    ],
    requestId: "req-test-001",
    ...overrides,
  };
}

describe("IAM admin and tenant operations negative matrix", () => {
  const reflector = new Reflector();
  const guard = new BootstrapAuthGuard(reflector);

  const routeDescriptors: Array<{
    name: string;
    method: string;
    url: string;
    controllerClass: any;
    handlerName: string;
  }> = [
    {
      name: "POST /notifications/read",
      method: "POST",
      url: "/api/notifications/read",
      controllerClass: NotificationsController,
      handlerName: "markNotificationsRead",
    },
    {
      name: "GET /settlement/invoices",
      method: "GET",
      url: "/api/settlement/invoices",
      controllerClass: BillingSettlementController,
      handlerName: "listPlatformInvoices",
    },
    {
      name: "GET /settlement/matrix",
      method: "GET",
      url: "/api/settlement/matrix",
      controllerClass: BillingSettlementController,
      handlerName: "listSettlementMatrix",
    },
    {
      name: "POST /driver-fee-plans/publish",
      method: "POST",
      url: "/api/driver-fee-plans/publish",
      controllerClass: BillingSettlementController,
      handlerName: "publishDriverFeePlan",
    },
    {
      name: "GET /settlement/reconciliation-issues",
      method: "GET",
      url: "/api/settlement/reconciliation-issues",
      controllerClass: BillingSettlementController,
      handlerName: "listReconciliationIssues",
    },
    {
      name: "POST /settlement/reconciliation-issues",
      method: "POST",
      url: "/api/settlement/reconciliation-issues",
      controllerClass: BillingSettlementController,
      handlerName: "createReconciliationIssue",
    },
    {
      name: "POST /settlement/reconciliation-issues/:issueId/assign",
      method: "POST",
      url: "/api/settlement/reconciliation-issues/recon-1/assign",
      controllerClass: BillingSettlementController,
      handlerName: "assignReconciliationIssue",
    },
    {
      name: "POST /settlement/reconciliation-issues/:issueId/comment",
      method: "POST",
      url: "/api/settlement/reconciliation-issues/recon-1/comment",
      controllerClass: BillingSettlementController,
      handlerName: "addReconciliationIssueComment",
    },
    {
      name: "POST /settlement/reconciliation-issues/:issueId/resolve",
      method: "POST",
      url: "/api/settlement/reconciliation-issues/recon-1/resolve",
      controllerClass: BillingSettlementController,
      handlerName: "resolveReconciliationIssue",
    },
    {
      name: "POST /settlement/reconciliation-issues/:issueId/reopen",
      method: "POST",
      url: "/api/settlement/reconciliation-issues/recon-1/reopen",
      controllerClass: BillingSettlementController,
      handlerName: "reopenReconciliationIssue",
    },
    {
      name: "GET /admin/flags",
      method: "GET",
      url: "/api/admin/flags",
      controllerClass: FeatureFlagsController,
      handlerName: "getAllFlags",
    },
    {
      name: "GET /admin/flags/:key",
      method: "GET",
      url: "/api/admin/flags/tenant-portal.booking",
      controllerClass: FeatureFlagsController,
      handlerName: "getFlag",
    },
    {
      name: "PATCH /admin/flags/:key",
      method: "PATCH",
      url: "/api/admin/flags/tenant-portal.booking",
      controllerClass: FeatureFlagsController,
      handlerName: "updateFlag",
    },
    {
      name: "POST /admin/flags/:key/tenant-overrides",
      method: "POST",
      url: "/api/admin/flags/tenant-portal.booking/tenant-overrides",
      controllerClass: FeatureFlagsController,
      handlerName: "upsertTenantOverride",
    },
    {
      name: "GET /admin/flags/:key/enabled",
      method: "GET",
      url: "/api/admin/flags/tenant-portal.booking/enabled",
      controllerClass: FeatureFlagsController,
      handlerName: "checkFlagEnabled",
    },
    {
      name: "GET /admin/tenant-governance/summary",
      method: "GET",
      url: "/api/admin/tenant-governance/summary",
      controllerClass: PlatformTenantGovernanceController,
      handlerName: "listSummary",
    },
    {
      name: "GET /product-rule/catalog",
      method: "GET",
      url: "/api/product-rule/catalog",
      controllerClass: ProductRuleController,
      handlerName: "getCatalog",
    },
  ];

  describe("1. Strict unauthenticated rejection for all 17 GAP routes", () => {
    for (const route of routeDescriptors) {
      it(`denies unauthenticated request on ${route.name} in strict environment`, () => {
        process.env.APP_ENV = "production";

        const request: AuthenticatedRequestLike = {
          headers: {},
          method: route.method,
          originalUrl: route.url,
          url: route.url,
        };

        const handler = (route.controllerClass.prototype as Record<string, (...args: unknown[]) => unknown>)[route.handlerName]!;
        const context = createExecutionContext(request, handler, route.controllerClass);

        expect(() => guard.canActivate(context)).toThrow(ApiRequestError);
        try {
          guard.canActivate(context);
        } catch (error) {
          expect(error).toBeInstanceOf(ApiRequestError);
          expect((error as ApiRequestError).getStatus()).toBe(401);
        }
      });
    }
  });

  describe("2. Wrong realm rejection", () => {
    it("rejects partner realm callers on /notifications/read", () => {
      const partnerIdentity = {
        realm: "partner",
        actorType: "partner_api_key",
        actorId: "partner-001",
        scopes: ["notifications:write"],
      };
      const request: AuthenticatedRequestLike = {
        headers: makeHeaders(partnerIdentity),
        method: "POST",
        originalUrl: "/api/notifications/read",
      };
      const context = createExecutionContext(
        request,
        NotificationsController.prototype.markNotificationsRead,
        NotificationsController,
      );
      expect(() => guard.canActivate(context)).toThrow(ApiRequestError);
      try {
        guard.canActivate(context);
      } catch (error) {
        expect((error as ApiRequestError).code).toBe("AUTH_REALM_DENIED");
      }
    });

    it("rejects tenant realm callers on /admin/flags and /admin/flags/:key", () => {
      const tenantIdentity = {
        realm: "tenant",
        actorType: "tenant_admin",
        actorId: "tenant-admin-001",
        tenantId: "tenant-demo-001",
        scopes: ["foundation:read"],
      };
      const request: AuthenticatedRequestLike = {
        headers: makeHeaders(tenantIdentity),
        method: "GET",
        originalUrl: "/api/admin/flags",
      };
      const context = createExecutionContext(
        request,
        FeatureFlagsController.prototype.getAllFlags,
        FeatureFlagsController,
      );
      expect(() => guard.canActivate(context)).toThrow(ApiRequestError);
      try {
        guard.canActivate(context);
      } catch (error) {
        expect((error as ApiRequestError).code).toBe("AUTH_REALM_DENIED");
      }
    });

    it("rejects ops realm callers on PATCH /admin/flags/:key", () => {
      const opsIdentity = {
        realm: "ops",
        actorType: "ops_user",
        actorId: "ops-001",
        scopes: ["foundation:write"],
      };
      const request: AuthenticatedRequestLike = {
        headers: makeHeaders(opsIdentity),
        method: "PATCH",
        originalUrl: "/api/admin/flags/tenant-portal.booking",
      };
      const context = createExecutionContext(
        request,
        FeatureFlagsController.prototype.updateFlag,
        FeatureFlagsController,
      );
      expect(() => guard.canActivate(context)).toThrow(ApiRequestError);
      try {
        guard.canActivate(context);
      } catch (error) {
        expect((error as ApiRequestError).code).toBe("AUTH_REALM_DENIED");
      }
    });

    it("rejects tenant realm callers on /admin/tenant-governance/summary", () => {
      const tenantIdentity = {
        realm: "tenant",
        actorType: "tenant_admin",
        actorId: "tenant-admin-001",
        tenantId: "tenant-demo-001",
        scopes: ["tenant:sla:read"],
      };
      const request: AuthenticatedRequestLike = {
        headers: makeHeaders(tenantIdentity),
        method: "GET",
        originalUrl: "/api/admin/tenant-governance/summary",
      };
      const context = createExecutionContext(
        request,
        PlatformTenantGovernanceController.prototype.listSummary,
        PlatformTenantGovernanceController,
      );
      expect(() => guard.canActivate(context)).toThrow(ApiRequestError);
      try {
        guard.canActivate(context);
      } catch (error) {
        expect((error as ApiRequestError).code).toBe("AUTH_REALM_DENIED");
      }
    });

    it("rejects driver and partner realm callers on GET /product-rule/catalog", () => {
      const driverIdentity = {
        realm: "driver",
        actorType: "driver_user",
        actorId: "driver-001",
        scopes: [],
      };
      const request: AuthenticatedRequestLike = {
        headers: makeHeaders(driverIdentity),
        method: "GET",
        originalUrl: "/api/product-rule/catalog",
      };
      const context = createExecutionContext(
        request,
        ProductRuleController.prototype.getCatalog,
        ProductRuleController,
      );
      expect(() => guard.canActivate(context)).toThrow(ApiRequestError);
      try {
        guard.canActivate(context);
      } catch (error) {
        expect((error as ApiRequestError).code).toBe("AUTH_REALM_DENIED");
      }
    });
  });

  describe("3. Missing scope rejection", () => {
    it("rejects platform admin without notifications:write on POST /notifications/read", () => {
      const identity = {
        realm: "platform",
        actorType: "platform_admin",
        scopes: ["notifications:read"],
      };
      const request: AuthenticatedRequestLike = {
        headers: makeHeaders(identity),
        method: "POST",
        originalUrl: "/api/notifications/read",
      };
      const context = createExecutionContext(
        request,
        NotificationsController.prototype.markNotificationsRead,
        NotificationsController,
      );
      expect(() => guard.canActivate(context)).toThrow(ApiRequestError);
      try {
        guard.canActivate(context);
      } catch (error) {
        expect((error as ApiRequestError).code).toBe("AUTH_SCOPE_DENIED");
      }
    });

    it("rejects platform admin without billing:read on GET /settlement/invoices", () => {
      const identity = {
        realm: "platform",
        actorType: "platform_admin",
        scopes: ["foundation:read"],
      };
      const request: AuthenticatedRequestLike = {
        headers: makeHeaders(identity),
        method: "GET",
        originalUrl: "/api/settlement/invoices",
      };
      const context = createExecutionContext(
        request,
        BillingSettlementController.prototype.listPlatformInvoices,
        BillingSettlementController,
      );
      expect(() => guard.canActivate(context)).toThrow(ApiRequestError);
      try {
        guard.canActivate(context);
      } catch (error) {
        expect((error as ApiRequestError).code).toBe("AUTH_SCOPE_DENIED");
      }
    });

    it("rejects platform admin without billing:write on POST /driver-fee-plans/publish", () => {
      const identity = {
        realm: "platform",
        actorType: "platform_admin",
        scopes: ["billing:read"],
      };
      const request: AuthenticatedRequestLike = {
        headers: makeHeaders(identity),
        method: "POST",
        originalUrl: "/api/driver-fee-plans/publish",
      };
      const context = createExecutionContext(
        request,
        BillingSettlementController.prototype.publishDriverFeePlan,
        BillingSettlementController,
      );
      expect(() => guard.canActivate(context)).toThrow(ApiRequestError);
      try {
        guard.canActivate(context);
      } catch (error) {
        expect((error as ApiRequestError).code).toBe("AUTH_SCOPE_DENIED");
      }
    });

    it("rejects caller without foundation:write on PATCH /admin/flags/:key", () => {
      const identity = {
        realm: "platform",
        actorType: "platform_admin",
        scopes: ["foundation:read"],
      };
      const request: AuthenticatedRequestLike = {
        headers: makeHeaders(identity),
        method: "PATCH",
        originalUrl: "/api/admin/flags/tenant-portal.booking",
      };
      const context = createExecutionContext(
        request,
        FeatureFlagsController.prototype.updateFlag,
        FeatureFlagsController,
      );
      expect(() => guard.canActivate(context)).toThrow(ApiRequestError);
      try {
        guard.canActivate(context);
      } catch (error) {
        expect((error as ApiRequestError).code).toBe("AUTH_SCOPE_DENIED");
      }
    });

    it("rejects platform caller without tenant:sla:read on GET /admin/tenant-governance/summary", () => {
      const identity = {
        realm: "platform",
        actorType: "platform_admin",
        scopes: ["foundation:read"],
      };
      const request: AuthenticatedRequestLike = {
        headers: makeHeaders(identity),
        method: "GET",
        originalUrl: "/api/admin/tenant-governance/summary",
      };
      const context = createExecutionContext(
        request,
        PlatformTenantGovernanceController.prototype.listSummary,
        PlatformTenantGovernanceController,
      );
      expect(() => guard.canActivate(context)).toThrow(ApiRequestError);
      try {
        guard.canActivate(context);
      } catch (error) {
        expect((error as ApiRequestError).code).toBe("AUTH_SCOPE_DENIED");
      }
    });
  });

  describe("4. Driver notification actor ownership boundary", () => {
    it("allows driver to acknowledge their own notification but denies cross-driver notification acknowledgement", () => {
      const service = new AuditNotificationService();

      const notif1 = service.recordNotification({
        tenantId: null,
        recipientUserId: "drv-001",
        channel: "driver_task",
        title: "Task Assigned",
        message: "New order assigned to drv-001",
        status: "unread",
      });

      const notif2 = service.recordNotification({
        tenantId: null,
        recipientUserId: "drv-002",
        channel: "driver_task",
        title: "Task Assigned",
        message: "New order assigned to drv-002",
        status: "unread",
      });

      const driver1Identity = makeIdentity({
        realm: "driver",
        actorType: "driver_user",
        actorId: "drv-001",
        scopes: ["notifications:write"],
      });

      // Driver 1 acknowledging driver 1's notification succeeds
      const success = service.markNotificationsRead(
        { notificationIds: [notif1.notificationId] },
        driver1Identity,
      );
      expect(success.updated).toBe(1);

      // Driver 1 attempting to acknowledge driver 2's notification fails
      expect(() =>
        service.markNotificationsRead(
          { notificationIds: [notif2.notificationId] },
          driver1Identity,
        ),
      ).toThrow(ApiRequestError);

      try {
        service.markNotificationsRead(
          { notificationIds: [notif2.notificationId] },
          driver1Identity,
        );
      } catch (error) {
        expect(error).toBeInstanceOf(ApiRequestError);
        expect((error as ApiRequestError).getStatus()).toBe(403);
        expect((error as ApiRequestError).code).toBe("NOTIFICATION_ACTOR_FORBIDDEN");
      }
    });
  });

  describe("5. Tenant reconciliation issue boundary", () => {
    it("enforces tenant boundary on reconciliation issue creation and mutations", async () => {
      const auditService = new AuditNotificationService();
      const service = new BillingSettlementService(auditService);

      const tenant1Identity = makeIdentity({
        realm: "tenant",
        actorType: "tenant_admin",
        actorId: "tenant-user-001",
        tenantId: "tenant-001",
        scopes: ["billing:read", "billing:write"],
      });

      // Tenant 1 creating issue for tenant 1 succeeds
      const issue1 = await service.createReconciliationIssue(
        {
          issueType: "partner_sponsor_mismatch",
          summary: "Tenant 1 sponsor mismatch",
          openedBy: "tenant-user-001",
          tenantId: "tenant-001",
        },
        tenant1Identity,
      );
      expect(issue1.tenantId).toBe("tenant-001");

      // Tenant 1 creating issue for tenant 2 fails
      await expect(
        service.createReconciliationIssue(
          {
            issueType: "partner_sponsor_mismatch",
            summary: "Cross tenant attempt",
            openedBy: "tenant-user-001",
            tenantId: "tenant-002",
          },
          tenant1Identity,
        ),
      ).rejects.toThrow(ApiRequestError);

      // Platform admin creating issue for tenant 2
      const platformIdentity = makeIdentity({
        realm: "platform",
        actorType: "platform_admin",
        actorId: "platform-user-001",
        scopes: ["billing:write"],
      });
      const issue2 = await service.createReconciliationIssue(
        {
          issueType: "forwarder_status_mismatch",
          summary: "Tenant 2 forwarder mismatch",
          openedBy: "platform-user-001",
          tenantId: "tenant-002",
        },
        platformIdentity,
      );

      // Tenant 1 commenting on Tenant 2 issue fails
      await expect(
        service.addReconciliationIssueComment(
          issue2.issueId,
          {
            actorId: "tenant-user-001",
            message: "Unauthorized comment attempt",
          },
          tenant1Identity,
        ),
      ).rejects.toThrow(ApiRequestError);

      // Tenant 1 resolving Tenant 2 issue fails
      await expect(
        service.resolveReconciliationIssue(
          issue2.issueId,
          {
            actorId: "tenant-user-001",
            resolutionCode: "sponsor_corrected",
            resolutionSummary: "Unauthorized resolve attempt",
          },
          tenant1Identity,
        ),
      ).rejects.toThrow(ApiRequestError);
    });
  });

  describe("6. Step-up policy and audit controls", () => {
    it("ensures admin feature flag tenant override matches step-up policy", () => {
      const stepUp = resolveRouteStepUpPolicy(
        "POST",
        "/api/admin/flags/tenant-portal.booking/tenant-overrides",
        "platform",
      );
      expect(stepUp).not.toBeNull();
      expect(stepUp?.actionId).toBe("platform:feature-flags:tenant-override:update");
      expect(stepUp?.enforcedRealms).toContain("platform");
    });

    it("records audit logs when tenant feature flag override is mutated", async () => {
      const auditService = new AuditNotificationService();
      const service = new FeatureFlagsService(undefined, auditService);

      await service.upsertTenantOverride(
        "tenant-portal.booking",
        "tenant-demo-001",
        true,
        "Custom description for tenant",
      );

      const logs = auditService.listAuditLogs();
      const overrideLog = logs.find(
        (log) => log.actionName === "upsert_tenant_feature_flag",
      );
      expect(overrideLog).toBeDefined();
      expect(overrideLog?.tenantId).toBe("tenant-demo-001");
      expect(overrideLog?.resourceType).toBe("tenant_feature_flag");
    });
  });

  describe("7. Shared product-rule catalog access and secret safety", () => {
    it("allows system, platform, tenant, ops without specific scope", () => {
      for (const realm of ["system", "platform", "tenant", "ops"] as const) {
        const identity = {
          realm,
          actorType: realm === "tenant" ? "tenant_admin" : realm === "ops" ? "ops_user" : "platform_admin",
          actorId: `${realm}-001`,
          tenantId: realm === "tenant" ? "tenant-001" : null,
          scopes: [],
        };
        const request: AuthenticatedRequestLike = {
          headers: makeHeaders(identity),
          method: "GET",
          originalUrl: "/api/product-rule/catalog",
        };
        const context = createExecutionContext(
          request,
          ProductRuleController.prototype.getCatalog,
          ProductRuleController,
        );
        expect(guard.canActivate(context)).toBe(true);
      }
    });

    it("ensures product rule catalog response does not expose secrets or sensitive config", () => {
      const controller = new ProductRuleController();
      const envelope = controller.getCatalog("req-test-001");
      const jsonString = JSON.stringify(envelope);

      expect(jsonString).not.toContain("secret");
      expect(jsonString).not.toContain("password");
      expect(jsonString).not.toContain("privateKey");
      expect(jsonString).not.toContain("apiKey");
      expect(envelope.data.phase1ServiceBuckets).toBeDefined();
      expect(envelope.data.pricingAuthority).toBeDefined();
    });
  });

  describe("8. No route is made public (@OpenRoute) to bypass classification", () => {
    const controllers: unknown[] = [
      NotificationsController,
      BillingSettlementController,
      FeatureFlagsController,
      PlatformTenantGovernanceController,
      ProductRuleController,
    ];

    for (const controller of controllers as Array<{ name: string; prototype: Record<string, unknown> }>) {
      it(`verifies ${controller.name} has no @OpenRoute decorators on class or methods`, () => {
        expect(reflector.get(AUTH_OPEN_ROUTE_KEY, controller as never)).toBeUndefined();

        const methodNames = Object.getOwnPropertyNames(controller.prototype).filter(
          (name) => name !== "constructor" && typeof controller.prototype[name] === "function",
        );

        for (const methodName of methodNames) {
          const handler = controller.prototype[methodName] as (...args: unknown[]) => unknown;
          expect(reflector.get(AUTH_OPEN_ROUTE_KEY, handler)).toBeUndefined();
        }
      });
    }
  });
});
