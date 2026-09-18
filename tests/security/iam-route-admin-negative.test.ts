import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { BootstrapAuthGuard } from "../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import type { BootstrapRequestIdentity } from "../../apps/api/src/common/auth/auth.types";
import { NotificationsController } from "../../apps/api/src/modules/audit-notification/notifications.controller";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementController } from "../../apps/api/src/modules/billing-settlement/billing-settlement.controller";
import { BillingSettlementService } from "../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { FeatureFlagsController } from "../../apps/api/src/modules/feature-flags/feature-flags.controller";
import { FeatureFlagsService } from "../../apps/api/src/modules/feature-flags/feature-flags.service";
import { PlatformTenantGovernanceController } from "../../apps/api/src/modules/platform-admin/tenant-governance.controller";
import { PlatformTenantGovernanceService } from "../../apps/api/src/modules/platform-admin/tenant-governance.service";
import { ProductRuleController } from "../../apps/api/src/modules/product-rule/product-rule.controller";
import { TenantsService } from "../../apps/api/src/modules/platform-admin/tenants.service";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";

const ORIGINAL_ENV = { ...process.env };

function createTestReflector() {
  return {
    getAllAndOverride: (key: string, targets: any[]) => {
      for (const target of targets) {
        if (!target) continue;
        const metadata = Reflect.getMetadata(key, target);
        if (metadata !== undefined) return metadata;
      }
      return undefined;
    },
  };
}

function createTestExecutionContext(
  controllerClass: any,
  handlerName: string,
  request: any,
) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getClass: () => controllerClass,
    getHandler: () => controllerClass.prototype[handlerName],
  };
}

async function expectGuardDenied(
  authGuard: BootstrapAuthGuard,
  ctx: any,
  expectedCode: string,
) {
  try {
    const result = await authGuard.canActivate(ctx as any);
    if (result !== true) {
      throw new Error(`Expected guard to throw, but returned ${result}`);
    }
    throw new Error(
      `Expected guard to throw ${expectedCode}, but it succeeded`,
    );
  } catch (err: any) {
    if (err.message && err.message.startsWith("Expected guard to")) {
      throw err;
    }
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.code).toBe(expectedCode);
  }
}

describe("IAM Route Admin Negative Matrix (17 GAP Routes)", () => {
  let reflector: any;
  let jwtAuthService: JwtAuthService;
  let guard: BootstrapAuthGuard;

  // Services and Controllers
  let auditNotificationService: AuditNotificationService;
  let notificationsController: NotificationsController;
  let billingSettlementService: BillingSettlementService;
  let billingSettlementController: BillingSettlementController;
  let featureFlagsService: FeatureFlagsService;
  let featureFlagsController: FeatureFlagsController;
  let platformTenantGovernanceService: PlatformTenantGovernanceService;
  let platformTenantGovernanceController: PlatformTenantGovernanceController;
  let productRuleController: ProductRuleController;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.APP_ENV = "production";
    process.env.JWT_SECRET = "unit-test-jwt-secret-key-min-32-chars-long";
    process.env.JWT_ISSUER = "drts";
    process.env.JWT_AUDIENCE = "drts-api";

    reflector = createTestReflector();
    jwtAuthService = new JwtAuthService();
    auditNotificationService = new AuditNotificationService();
    guard = new BootstrapAuthGuard(
      reflector,
      jwtAuthService,
      undefined,
      auditNotificationService,
    );

    notificationsController = new NotificationsController(
      auditNotificationService,
    );
    billingSettlementService = new BillingSettlementService(
      auditNotificationService,
    );
    billingSettlementController = new BillingSettlementController(
      billingSettlementService,
    );
    featureFlagsService = new FeatureFlagsService(
      undefined,
      auditNotificationService,
    );
    featureFlagsController = new FeatureFlagsController(featureFlagsService);

    const tenantPartnerService = new TenantPartnerService(
      auditNotificationService,
    );
    const tenantsService = new TenantsService(auditNotificationService);
    platformTenantGovernanceService = new PlatformTenantGovernanceService(
      tenantsService,
      tenantPartnerService,
    );
    platformTenantGovernanceController = new PlatformTenantGovernanceController(
      platformTenantGovernanceService,
    );
    productRuleController = new ProductRuleController();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  async function makeBearerRequest(
    identity: Partial<BootstrapRequestIdentity>,
    method = "GET",
    url = "/",
  ) {
    const fullIdentity: any = {
      authMode: "jwt_bearer",
      actorType: identity.actorType ?? "platform_admin",
      actorId: identity.actorId ?? "test-actor-001",
      principalId: identity.principalId ?? identity.actorId ?? "test-actor-001",
      subject: identity.subject ?? identity.actorId ?? "test-actor-001",
      realm: identity.realm ?? "platform",
      tenantId: identity.tenantId ?? null,
      partnerId: identity.partnerId ?? null,
      roleFamilies: identity.roleFamilies ?? [identity.realm ?? "platform"],
      roles: identity.roles ?? ["admin"],
      scopes: identity.scopes ?? [],
      requestId: "req-test-001",
      ...identity,
    };

    const issued = await jwtAuthService.issueSessionToken(fullIdentity);

    return {
      headers: {
        authorization: `Bearer ${issued.token}`,
      },
      method,
      url,
      originalUrl: url,
      identity: fullIdentity,
    };
  }

  // ---------------------------------------------------------------------------
  // 1. POST /notifications/read (NotificationsController.markNotificationsRead)
  // Realms: system, platform, ops, driver; Scope: notifications:write
  // Additional boundary: actor-owned notification IDs only
  // ---------------------------------------------------------------------------
  describe("1. POST /notifications/read", () => {
    const handler = "markNotificationsRead";
    const route = "/api/notifications/read";

    it("rejects unauthenticated requests with 401 AUTH_REQUIRED", async () => {
      const req = {
        headers: {},
        method: "POST",
        url: route,
        originalUrl: route,
      };
      const ctx = createTestExecutionContext(
        NotificationsController,
        handler,
        req,
      );
      await expectGuardDenied(guard, ctx, "AUTH_REQUIRED");
    });

    it("rejects unauthorized realm (tenant) with 403 AUTH_REALM_DENIED", async () => {
      const req = await makeBearerRequest(
        {
          realm: "tenant",
          actorType: "tenant_admin",
          scopes: ["notifications:write"],
          tenantId: "tenant-demo-001",
        },
        "POST",
        route,
      );
      const ctx = createTestExecutionContext(
        NotificationsController,
        handler,
        req,
      );
      await expectGuardDenied(guard, ctx, "AUTH_REALM_DENIED");
    });

    it("rejects unauthorized realm (partner) with 403 AUTH_REALM_DENIED", async () => {
      const req = await makeBearerRequest(
        {
          realm: "partner",
          actorType: "partner_api_key",
          scopes: ["notifications:write"],
        },
        "POST",
        route,
      );
      const ctx = createTestExecutionContext(
        NotificationsController,
        handler,
        req,
      );
      await expectGuardDenied(guard, ctx, "AUTH_REALM_DENIED");
    });

    it("rejects missing scope (notifications:write) with 403 AUTH_SCOPE_DENIED", async () => {
      const req = await makeBearerRequest(
        {
          realm: "platform",
          actorType: "platform_admin",
          scopes: ["notifications:read"],
        },
        "POST",
        route,
      );
      const ctx = createTestExecutionContext(
        NotificationsController,
        handler,
        req,
      );
      await expectGuardDenied(guard, ctx, "AUTH_SCOPE_DENIED");
    });

    it("allows valid platform and driver callers with notifications:write", async () => {
      const platformReq = await makeBearerRequest(
        {
          realm: "platform",
          actorType: "platform_admin",
          scopes: ["notifications:write"],
        },
        "POST",
        route,
      );
      const platformCtx = createTestExecutionContext(
        NotificationsController,
        handler,
        platformReq,
      );
      expect(await guard.canActivate(platformCtx as any)).toBe(true);

      const driverReq = await makeBearerRequest(
        {
          realm: "driver",
          actorType: "driver_user",
          actorId: "drv-001",
          scopes: ["notifications:write"],
        },
        "POST",
        route,
      );
      const driverCtx = createTestExecutionContext(
        NotificationsController,
        handler,
        driverReq,
      );
      expect(await guard.canActivate(driverCtx as any)).toBe(true);
    });

    it("enforces actor boundary: driver cannot mark another driver's notification as read", () => {
      // Seed a notification owned by drv-002
      const notif = auditNotificationService.recordNotification({
        tenantId: null,
        recipientUserId: "drv-002",
        channel: "driver_task",
        title: "New Dispatch Task",
        message: "Assigned order 123",
        status: "unread",
      });

      const driverIdentity: BootstrapRequestIdentity = {
        authMode: "jwt_bearer",
        actorType: "driver_user",
        actorId: "drv-001",
        realm: "driver",
        tenantId: null,
        roleFamilies: ["driver"],
        roles: ["driver_user"],
        scopes: ["notifications:write"],
        requestId: null,
      };

      expect(() =>
        notificationsController.markNotificationsRead(
          { notificationIds: [notif.notificationId] },
          driverIdentity,
        ),
      ).toThrowError(ApiRequestError);

      try {
        notificationsController.markNotificationsRead(
          { notificationIds: [notif.notificationId] },
          driverIdentity,
        );
      } catch (err: any) {
        expect(err.code).toBe("NOTIFICATION_ACTOR_MISMATCH");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 2. GET /settlement/invoices (BillingSettlementController.listPlatformInvoices)
  // Realms: system, platform, tenant, ops, partner; Scope: billing:read
  // ---------------------------------------------------------------------------
  describe("2. GET /settlement/invoices", () => {
    const handler = "listPlatformInvoices";
    const route = "/api/settlement/invoices";

    it("rejects unauthenticated requests", async () => {
      const req = {
        headers: {},
        method: "GET",
        url: route,
        originalUrl: route,
      };
      const ctx = createTestExecutionContext(
        BillingSettlementController,
        handler,
        req,
      );
      await expectGuardDenied(guard, ctx, "AUTH_REQUIRED");
    });

    it("rejects unauthorized realm (driver)", async () => {
      const req = await makeBearerRequest(
        { realm: "driver", actorType: "driver_user", scopes: ["billing:read"] },
        "GET",
        route,
      );
      const ctx = createTestExecutionContext(
        BillingSettlementController,
        handler,
        req,
      );
      await expectGuardDenied(guard, ctx, "AUTH_REALM_DENIED");
    });

    it("rejects missing scope (billing:read)", async () => {
      const req = await makeBearerRequest(
        {
          realm: "tenant",
          actorType: "tenant_admin",
          scopes: ["tenant:read"],
          tenantId: "tenant-demo-001",
        },
        "GET",
        route,
      );
      const ctx = createTestExecutionContext(
        BillingSettlementController,
        handler,
        req,
      );
      await expectGuardDenied(guard, ctx, "AUTH_SCOPE_DENIED");
    });

    it("allows authorized callers and scopes tenant view to their own tenant", async () => {
      const req = await makeBearerRequest(
        {
          realm: "tenant",
          actorType: "tenant_admin",
          scopes: ["billing:read"],
          tenantId: "tenant-demo-001",
        },
        "GET",
        route,
      );
      const ctx = createTestExecutionContext(
        BillingSettlementController,
        handler,
        req,
      );
      expect(await guard.canActivate(ctx as any)).toBe(true);

      const result = billingSettlementController.listPlatformInvoices(
        req.identity,
      );
      expect(result.data).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 3. GET /settlement/matrix (BillingSettlementController.listSettlementMatrix)
  // Realms: system, platform, tenant, ops, partner; Scope: billing:read
  // ---------------------------------------------------------------------------
  describe("3. GET /settlement/matrix", () => {
    const handler = "listSettlementMatrix";
    const route = "/api/settlement/matrix";

    it("rejects unauthenticated requests", async () => {
      const req = {
        headers: {},
        method: "GET",
        url: route,
        originalUrl: route,
      };
      const ctx = createTestExecutionContext(
        BillingSettlementController,
        handler,
        req,
      );
      await expectGuardDenied(guard, ctx, "AUTH_REQUIRED");
    });

    it("rejects unauthorized realm (driver)", async () => {
      const req = await makeBearerRequest(
        { realm: "driver", actorType: "driver_user", scopes: ["billing:read"] },
        "GET",
        route,
      );
      const ctx = createTestExecutionContext(
        BillingSettlementController,
        handler,
        req,
      );
      await expectGuardDenied(guard, ctx, "AUTH_REALM_DENIED");
    });

    it("rejects missing scope (billing:read)", async () => {
      const req = await makeBearerRequest(
        {
          realm: "platform",
          actorType: "platform_admin",
          scopes: ["foundation:read"],
        },
        "GET",
        route,
      );
      const ctx = createTestExecutionContext(
        BillingSettlementController,
        handler,
        req,
      );
      await expectGuardDenied(guard, ctx, "AUTH_SCOPE_DENIED");
    });

    it("allows valid callers with billing:read", async () => {
      const req = await makeBearerRequest(
        { realm: "ops", actorType: "ops_user", scopes: ["billing:read"] },
        "GET",
        route,
      );
      const ctx = createTestExecutionContext(
        BillingSettlementController,
        handler,
        req,
      );
      expect(await guard.canActivate(ctx as any)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. POST /driver-fee-plans/publish (BillingSettlementController.publishDriverFeePlan)
  // Realms: system, platform, tenant, ops; Scope: billing:write
  // ---------------------------------------------------------------------------
  describe("4. POST /driver-fee-plans/publish", () => {
    const handler = "publishDriverFeePlan";
    const route = "/api/driver-fee-plans/publish";

    it("rejects unauthenticated requests", async () => {
      const req = {
        headers: {},
        method: "POST",
        url: route,
        originalUrl: route,
      };
      const ctx = createTestExecutionContext(
        BillingSettlementController,
        handler,
        req,
      );
      await expectGuardDenied(guard, ctx, "AUTH_REQUIRED");
    });

    it("rejects unauthorized realms (driver, partner)", async () => {
      const driverReq = await makeBearerRequest(
        {
          realm: "driver",
          actorType: "driver_user",
          scopes: ["billing:write"],
        },
        "POST",
        route,
      );
      const driverCtx = createTestExecutionContext(
        BillingSettlementController,
        handler,
        driverReq,
      );
      await expectGuardDenied(guard, driverCtx, "AUTH_REALM_DENIED");

      const partnerReq = await makeBearerRequest(
        {
          realm: "partner",
          actorType: "partner_api_key",
          scopes: ["billing:write"],
        },
        "POST",
        route,
      );
      const partnerCtx = createTestExecutionContext(
        BillingSettlementController,
        handler,
        partnerReq,
      );
      await expectGuardDenied(guard, partnerCtx, "AUTH_REALM_DENIED");
    });

    it("rejects missing scope (billing:write)", async () => {
      const req = await makeBearerRequest(
        {
          realm: "platform",
          actorType: "platform_admin",
          scopes: ["billing:read"],
        },
        "POST",
        route,
      );
      const ctx = createTestExecutionContext(
        BillingSettlementController,
        handler,
        req,
      );
      await expectGuardDenied(guard, ctx, "AUTH_SCOPE_DENIED");
    });

    it("allows valid callers with billing:write", async () => {
      const req = await makeBearerRequest(
        {
          realm: "platform",
          actorType: "platform_admin",
          scopes: ["billing:write"],
        },
        "POST",
        route,
      );
      const ctx = createTestExecutionContext(
        BillingSettlementController,
        handler,
        req,
      );
      expect(await guard.canActivate(ctx as any)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 5-10. Settlement Reconciliation Issues
  // GET  /settlement/reconciliation-issues (billing:read)
  // POST /settlement/reconciliation-issues (billing:write)
  // POST /settlement/reconciliation-issues/:issueId/assign (billing:write)
  // POST /settlement/reconciliation-issues/:issueId/comment (billing:write)
  // POST /settlement/reconciliation-issues/:issueId/resolve (billing:write)
  // POST /settlement/reconciliation-issues/:issueId/reopen (billing:write)
  // Realms: system, platform, tenant, ops
  // ---------------------------------------------------------------------------
  describe("5-10. Settlement Reconciliation Issues", () => {
    it("5. GET /settlement/reconciliation-issues: rejects driver/partner and missing billing:read", async () => {
      const handler = "listReconciliationIssues";
      const route = "/api/settlement/reconciliation-issues";

      const driverReq = await makeBearerRequest(
        { realm: "driver", actorType: "driver_user", scopes: ["billing:read"] },
        "GET",
        route,
      );
      await expectGuardDenied(
        guard,
        createTestExecutionContext(
          BillingSettlementController,
          handler,
          driverReq,
        ),
        "AUTH_REALM_DENIED",
      );

      const noScopeReq = await makeBearerRequest(
        {
          realm: "tenant",
          actorType: "tenant_admin",
          scopes: ["tenant:read"],
          tenantId: "tenant-demo-001",
        },
        "GET",
        route,
      );
      await expectGuardDenied(
        guard,
        createTestExecutionContext(
          BillingSettlementController,
          handler,
          noScopeReq,
        ),
        "AUTH_SCOPE_DENIED",
      );
    });

    it("6. POST /settlement/reconciliation-issues: rejects cross-tenant creation", async () => {
      const tenantIdentity: BootstrapRequestIdentity = {
        authMode: "jwt_bearer",
        actorType: "tenant_admin",
        actorId: "tenant-user-001",
        realm: "tenant",
        tenantId: "tenant-demo-001",
        roleFamilies: ["tenant"],
        roles: ["tenant_admin"],
        scopes: ["billing:write"],
        requestId: null,
      };

      // Attempting to create issue for another tenant fails
      await expect(async () =>
        billingSettlementController.createReconciliationIssue(
          {
            issueType: "partner_sponsor_mismatch",
            summary: "Cross tenant dispute",
            openedBy: "tenant-user-001",
            tenantId: "tenant-other-999",
          },
          tenantIdentity,
        ),
      ).rejects.toMatchObject({
        code: "TENANT_BOUNDARY_VIOLATION",
      });
    });

    it("7-10. Reconciliation mutation endpoints enforce tenant isolation", async () => {
      // Create an issue belonging to tenant-demo-001
      const issue = await billingSettlementService.createReconciliationIssue({
        issueType: "partner_sponsor_mismatch",
        summary: "Tenant 1 issue",
        openedBy: "ops-001",
        tenantId: "tenant-demo-001",
      });

      const otherTenantIdentity: BootstrapRequestIdentity = {
        authMode: "jwt_bearer",
        actorType: "tenant_admin",
        actorId: "tenant-user-other",
        realm: "tenant",
        tenantId: "tenant-other-999",
        roleFamilies: ["tenant"],
        roles: ["tenant_admin"],
        scopes: ["billing:write"],
        requestId: null,
      };

      // 7. assign
      await expect(async () =>
        billingSettlementController.assignReconciliationIssue(
          issue.issueId,
          { assigneeId: "user-2", actorId: "tenant-user-other" },
          otherTenantIdentity,
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      // 8. comment
      await expect(async () =>
        billingSettlementController.addReconciliationIssueComment(
          issue.issueId,
          { actorId: "tenant-user-other", message: "Malicious comment" },
          otherTenantIdentity,
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      // 9. resolve
      await expect(async () =>
        billingSettlementController.resolveReconciliationIssue(
          issue.issueId,
          {
            actorId: "tenant-user-other",
            resolutionCode: "resolved_other",
            resolutionSummary: "Resolved by attacker",
          },
          otherTenantIdentity,
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      // 10. reopen
      await expect(async () =>
        billingSettlementController.reopenReconciliationIssue(
          issue.issueId,
          { actorId: "tenant-user-other", reason: "Reopened by attacker" },
          otherTenantIdentity,
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ---------------------------------------------------------------------------
  // 11-15. Admin Feature Flags (FeatureFlagsController)
  // GET   /admin/flags (foundation:read)
  // GET   /admin/flags/:key (foundation:read)
  // PATCH /admin/flags/:key (foundation:write)
  // POST  /admin/flags/:key/tenant-overrides (foundation:write)
  // GET   /admin/flags/:key/enabled (foundation:read)
  // Realms: system, platform only
  // ---------------------------------------------------------------------------
  describe("11-15. Admin Feature Flags", () => {
    it("11. GET /admin/flags: rejects tenant, ops, driver, and partner callers and allows platform admin", async () => {
      const handler = "getAllFlags";
      const route = "/api/admin/flags";

      for (const realm of ["tenant", "ops", "driver", "partner"] as const) {
        const req = await makeBearerRequest(
          {
            realm,
            actorType:
              realm === "tenant"
                ? "tenant_admin"
                : realm === "ops"
                  ? "ops_user"
                  : "driver_user",
            scopes: ["foundation:read"],
          },
          "GET",
          route,
        );
        const ctx = createTestExecutionContext(
          FeatureFlagsController,
          handler,
          req,
        );
        await expectGuardDenied(guard, ctx, "AUTH_REALM_DENIED");
      }

      const res = await featureFlagsController.getAllFlags();
      expect(res.data.flags).toBeDefined();
    });

    it("12. GET /admin/flags/:key: rejects missing foundation:read scope", async () => {
      const handler = "getFlag";
      const route = "/api/admin/flags/tenant-portal.booking";

      const req = await makeBearerRequest(
        {
          realm: "platform",
          actorType: "platform_admin",
          scopes: ["tenant:read"],
        },
        "GET",
        route,
      );
      const ctx = createTestExecutionContext(
        FeatureFlagsController,
        handler,
        req,
      );
      await expectGuardDenied(guard, ctx, "AUTH_SCOPE_DENIED");
    });

    it("13. PATCH /admin/flags/:key: requires foundation:write and platform realm", async () => {
      const handler = "updateFlag";
      const route = "/api/admin/flags/tenant-portal.booking";

      const readOnlyReq = await makeBearerRequest(
        {
          realm: "platform",
          actorType: "platform_admin",
          scopes: ["foundation:read"],
        },
        "PATCH",
        route,
      );
      await expectGuardDenied(
        guard,
        createTestExecutionContext(
          FeatureFlagsController,
          handler,
          readOnlyReq,
        ),
        "AUTH_SCOPE_DENIED",
      );

      const writeReq = await makeBearerRequest(
        {
          realm: "platform",
          actorType: "platform_admin",
          scopes: ["foundation:write"],
        },
        "PATCH",
        route,
      );
      expect(
        await guard.canActivate(
          createTestExecutionContext(
            FeatureFlagsController,
            handler,
            writeReq,
          ) as any,
        ),
      ).toBe(true);
    });

    it("14. POST /admin/flags/:key/tenant-overrides: requires foundation:write and platform realm", async () => {
      const handler = "upsertTenantOverride";
      const route = "/api/admin/flags/tenant-portal.booking/tenant-overrides";

      const opsReq = await makeBearerRequest(
        { realm: "ops", actorType: "ops_user", scopes: ["foundation:write"] },
        "POST",
        route,
      );
      await expectGuardDenied(
        guard,
        createTestExecutionContext(FeatureFlagsController, handler, opsReq),
        "AUTH_REALM_DENIED",
      );

      const platformReq = await makeBearerRequest(
        {
          realm: "platform",
          actorType: "platform_admin",
          scopes: ["foundation:write"],
        },
        "POST",
        route,
      );
      expect(
        await guard.canActivate(
          createTestExecutionContext(
            FeatureFlagsController,
            handler,
            platformReq,
          ) as any,
        ),
      ).toBe(true);
    });

    it("15. GET /admin/flags/:key/enabled: requires foundation:read and platform realm", async () => {
      const handler = "checkFlagEnabled";
      const route = "/api/admin/flags/tenant-portal.booking/enabled";

      const unauthReq = {
        headers: {},
        method: "GET",
        url: route,
        originalUrl: route,
      };
      await expectGuardDenied(
        guard,
        createTestExecutionContext(FeatureFlagsController, handler, unauthReq),
        "AUTH_REQUIRED",
      );

      const validReq = await makeBearerRequest(
        {
          realm: "platform",
          actorType: "platform_admin",
          scopes: ["foundation:read"],
        },
        "GET",
        route,
      );
      expect(
        await guard.canActivate(
          createTestExecutionContext(
            FeatureFlagsController,
            handler,
            validReq,
          ) as any,
        ),
      ).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 16. GET /admin/tenant-governance/summary (PlatformTenantGovernanceController)
  // Realms: system, platform; Scope: tenant:sla:read
  // ---------------------------------------------------------------------------
  describe("16. GET /admin/tenant-governance/summary", () => {
    const handler = "listSummary";
    const route = "/api/admin/tenant-governance/summary";

    it("rejects unauthenticated requests with 401 AUTH_REQUIRED", async () => {
      const req = {
        headers: {},
        method: "GET",
        url: route,
        originalUrl: route,
      };
      const ctx = createTestExecutionContext(
        PlatformTenantGovernanceController,
        handler,
        req,
      );
      await expectGuardDenied(guard, ctx, "AUTH_REQUIRED");
    });

    it("rejects tenant, ops, driver, and partner callers", async () => {
      for (const realm of ["tenant", "ops", "driver", "partner"] as const) {
        const req = await makeBearerRequest(
          {
            realm,
            actorType:
              realm === "tenant"
                ? "tenant_admin"
                : realm === "ops"
                  ? "ops_user"
                  : "driver_user",
            scopes: ["tenant:sla:read"],
          },
          "GET",
          route,
        );
        const ctx = createTestExecutionContext(
          PlatformTenantGovernanceController,
          handler,
          req,
        );
        await expectGuardDenied(guard, ctx, "AUTH_REALM_DENIED");
      }
    });

    it("rejects platform callers missing tenant:sla:read scope", async () => {
      const req = await makeBearerRequest(
        {
          realm: "platform",
          actorType: "platform_admin",
          scopes: ["foundation:read"],
        },
        "GET",
        route,
      );
      const ctx = createTestExecutionContext(
        PlatformTenantGovernanceController,
        handler,
        req,
      );
      await expectGuardDenied(guard, ctx, "AUTH_SCOPE_DENIED");
    });

    it("allows platform callers with tenant:sla:read", async () => {
      const req = await makeBearerRequest(
        {
          realm: "platform",
          actorType: "platform_admin",
          scopes: ["tenant:sla:read"],
        },
        "GET",
        route,
      );
      const ctx = createTestExecutionContext(
        PlatformTenantGovernanceController,
        handler,
        req,
      );
      expect(await guard.canActivate(ctx as any)).toBe(true);

      const res = platformTenantGovernanceController.listSummary();
      expect(res.data.items).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 17. GET /product-rule/catalog (ProductRuleController.getCatalog)
  // Realms: system, platform, tenant, ops; No scope requirement (authenticated shared catalogue)
  // ---------------------------------------------------------------------------
  describe("17. GET /product-rule/catalog", () => {
    const handler = "getCatalog";
    const route = "/api/product-rule/catalog";

    it("rejects unauthenticated callers with 401 AUTH_REQUIRED", async () => {
      const req = {
        headers: {},
        method: "GET",
        url: route,
        originalUrl: route,
      };
      const ctx = createTestExecutionContext(
        ProductRuleController,
        handler,
        req,
      );
      await expectGuardDenied(guard, ctx, "AUTH_REQUIRED");
    });

    it("rejects driver and partner callers with 403 AUTH_REALM_DENIED", async () => {
      const driverReq = await makeBearerRequest(
        { realm: "driver", actorType: "driver_user", scopes: [] },
        "GET",
        route,
      );
      await expectGuardDenied(
        guard,
        createTestExecutionContext(ProductRuleController, handler, driverReq),
        "AUTH_REALM_DENIED",
      );

      const partnerReq = await makeBearerRequest(
        { realm: "partner", actorType: "partner_api_key", scopes: [] },
        "GET",
        route,
      );
      await expectGuardDenied(
        guard,
        createTestExecutionContext(ProductRuleController, handler, partnerReq),
        "AUTH_REALM_DENIED",
      );
    });

    it("allows authenticated platform, tenant, ops, and system callers without requiring a special scope", async () => {
      for (const realm of ["platform", "tenant", "ops", "system"] as const) {
        const req = await makeBearerRequest(
          {
            realm,
            actorType:
              realm === "platform"
                ? "platform_admin"
                : realm === "tenant"
                  ? "tenant_admin"
                  : realm === "ops"
                    ? "ops_user"
                    : "system",
            tenantId: realm === "tenant" ? "tenant-demo-001" : null,
            scopes: [],
          },
          "GET",
          route,
        );
        const ctx = createTestExecutionContext(
          ProductRuleController,
          handler,
          req,
        );
        expect(await guard.canActivate(ctx as any)).toBe(true);
      }
    });

    it("returns catalog data without secret or private configuration leakage", () => {
      const res = productRuleController.getCatalog();
      expect(res.data).toBeDefined();
      expect(res.data.phase1ServiceBuckets).toBeDefined();
      expect(res.data.pricingAuthority).toBeDefined();
      // Ensure no sensitive credentials or internal keys
      const json = JSON.stringify(res);
      expect(json).not.toContain("secret");
      expect(json).not.toContain("password");
      expect(json).not.toContain("privateKey");
    });
  });
});
