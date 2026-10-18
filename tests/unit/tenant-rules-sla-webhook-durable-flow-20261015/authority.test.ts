import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantPartnerController } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { WebhookDispatchService } from "../../../apps/api/src/modules/tenant-partner/webhook-dispatch.service";
import { persistenceHarness } from "./persistence-harness";

import { signedIdentity, invokeRoute } from "./route-harness";

beforeEach(() => {
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("JWT_SECRET", "tenant-durable-authority-test-only");
  vi.stubEnv("JWT_ISSUER", "drts-tests");
  vi.stubEnv("JWT_AUDIENCE", "drts-api");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("C009 original verified principal/resource boundary", () => {
  const tenantA = "tenant-authority-A";
  const tenantB = "tenant-demo-001";
  const routes = [
    ["listApprovalRules", "GET", "/api/tenant/approval-rules"],
    ["getApprovalRule", "GET", "/api/tenant/approval-rules/:ruleId"],
    ["listPassengers", "GET", "/api/tenant/passengers"],
    ["listAddresses", "GET", "/api/tenant/addresses"],
    ["listAddressExportView", "GET", "/api/tenant/addresses/export-view"],
    ["getTenantNotifications", "GET", "/api/tenant/notifications"],
    ["listTenantNotificationFeed", "GET", "/api/tenant/notifications/feed"],
    ["upsertTenantQuotaPolicy", "POST", "/api/tenant/quotas/policies"],
    ["updateTenantNotifications", "POST", "/api/tenant/notifications"],
  ] as const;

  it("mounted authorized status-only webhook API retains test_pending until actual successful verification", async () => {
    const jwt = new JwtAuthService();
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      undefined,
      new WebhookDispatchService(async () => ({ ok: true, status: 204 })),
    );
    const controller = new TenantPartnerController(
      service,
      {} as never,
      {} as never,
      jwt,
      {} as never,
    );
    const token = signedIdentity(jwt, tenantA);
    try {
      const created = (await invokeRoute(
        controller,
        jwt,
        "createWebhookEndpoint",
        {
          token,
          tenantId: tenantA,
          method: "POST",
          url: "/api/tenant/webhooks",
          body: {
            url: "https://unit.example.test/webhook",
            secret: "authorized-hook-secret",
            events: ["dispatch.assigned"],
          },
        },
      )) as { data: { webhookId: string } };
      const webhookId = created.data.webhookId;
      const activated = (await invokeRoute(
        controller,
        jwt,
        "updateWebhookEndpoint",
        {
          token,
          tenantId: tenantA,
          method: "POST",
          url: `/api/tenant/webhooks/${webhookId}`,
          params: { webhookId },
          body: { status: "active" },
        },
      )) as { data: { status: string } };
      expect(activated.data.status).toBe("test_pending");
      await service.sendTestWebhook(tenantA, { webhookId });
      const listed = (await invokeRoute(
        controller,
        jwt,
        "listWebhookEndpoints",
        {
          token,
          tenantId: tenantA,
          method: "GET",
          url: "/api/tenant/webhooks",
        },
      )) as { data: { items: Array<{ status: string }> } };
      expect(listed.data.items[0]?.status).toBe("active");
    } finally {
      service.onModuleDestroy();
    }
  });

  it("does not transfer B's rule id into A through an otherwise same-tenant update", async () => {
    const persistence = persistenceHarness();
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      persistence.repository,
    );
    const jwt = new JwtAuthService();
    const controller = new TenantPartnerController(
      service,
      {} as never,
      {} as never,
      jwt,
      {} as never,
    );
    try {
      const rule = await service.upsertApprovalRule(tenantB, {
        ruleName: "B rule",
        priority: 10,
        action: "allow",
        conditions: [],
      });
      persistence.query.mockClear();
      await expect(
        invokeRoute(controller, jwt, "updateApprovalRule", {
          token: signedIdentity(jwt, tenantA),
          tenantId: tenantA,
          method: "PUT",
          url: `/api/tenant/approval-rules/${rule.ruleId}`,
          params: { ruleId: rule.ruleId },
          body: {
            ruleName: "Attempted transfer",
            priority: 1,
            action: "allow",
            conditions: [],
          },
        }),
      ).rejects.toMatchObject({
        status: 404,
        code: "TENANT_APPROVAL_RULE_NOT_FOUND",
      });
      expect(persistence.query).not.toHaveBeenCalled();
      expect(service.getApprovalRule(tenantB, rule.ruleId)).toEqual(rule);
      expect(service.listApprovalRules(tenantA)).toEqual([]);
    } finally {
      service.onModuleDestroy();
    }
  });

  it.each(routes)(
    "%s denies a verified A identity selecting populated B before reads or writes",
    async (handler, method, url) => {
      const audit = new AuditNotificationService();
      const persistence = persistenceHarness();
      const service = new TenantPartnerService(audit, persistence.repository);
      const jwt = new JwtAuthService();
      const controller = new TenantPartnerController(
        service,
        {} as never,
        {} as never,
        jwt,
        {} as never,
      );
      try {
        const rule = await service.upsertApprovalRule(tenantB, {
          ruleName: "B confidential approval",
          priority: 10,
          action: "allow",
          conditions: [],
        });
        audit.recordNotification({
          tenantId: tenantB,
          recipientUserId: null,
          channel: "ops_notice",
          title: "B private",
          message: "B notification",
          status: "unread",
        });
        expect(service.listApprovalRules(tenantB)).not.toHaveLength(0);
        expect(service.listPassengers(tenantB)).not.toHaveLength(0);
        expect(service.listAddresses(tenantB)).not.toHaveLength(0);
        expect(service.listTenantNotifications(tenantB)).not.toHaveLength(0);
        const beforeRules = service.listApprovalRules(tenantB);
        const beforeQuota = service.listQuotaPolicies(tenantB);
        const beforePreferences = service.getNotificationPreferences(tenantB);
        const auditSpy = vi.spyOn(audit, "recordAuditLog");
        persistence.query.mockClear();
        const body =
          handler === "upsertTenantQuotaPolicy"
            ? {
                period: "monthly",
                limit: {
                  bookingCountLimit: 1,
                  amountMinorLimit: null,
                  currency: "TWD",
                  enforcementMode: "warn_only",
                },
              }
            : {
                subscriptions: [
                  {
                    eventType: "dispatch.assigned",
                    channel: "email",
                    enabled: true,
                  },
                ],
              };
        await expect(
          invokeRoute(controller, jwt, handler, {
            token: signedIdentity(jwt, tenantA),
            tenantId: tenantB,
            method,
            url,
            body,
            params: { ruleId: rule.ruleId },
            query: { search: "confidential" },
          }),
        ).rejects.toMatchObject({ code: "TENANT_SCOPE_MISMATCH", status: 403 });
        expect(service.listApprovalRules(tenantB)).toEqual(beforeRules);
        expect(service.listQuotaPolicies(tenantB)).toEqual(beforeQuota);
        expect(service.getNotificationPreferences(tenantB)).toEqual(
          beforePreferences,
        );
        expect(auditSpy).not.toHaveBeenCalled();
        expect(persistence.query).not.toHaveBeenCalled();
        const ownRule = await service.upsertApprovalRule(tenantA, {
          ruleName: "A confidential approval",
          priority: 10,
          action: "allow",
          conditions: [],
        });
        await service.upsertPassenger(tenantA, {
          fullName: "A passenger",
          mobile: "0912000001",
          roles: ["employee"],
        });
        await service.upsertAddress(tenantA, {
          addressName: "A office",
          addressText: "A office address",
        });
        audit.recordNotification({
          tenantId: tenantA,
          recipientUserId: null,
          channel: "ops_notice",
          title: "A private",
          message: "A notification",
          status: "unread",
        });
        const sameTenant = (await invokeRoute(controller, jwt, handler, {
          token: signedIdentity(jwt, tenantA),
          tenantId: tenantA,
          method,
          url,
          body,
          params: { ruleId: ownRule.ruleId },
          query: { search: "confidential" },
        })) as { data: { items?: unknown[] } };
        expect(sameTenant.data).toBeTruthy();
        if (sameTenant.data.items)
          expect(sameTenant.data.items).not.toHaveLength(0);
        for (const actorType of ["platform_admin", "system"] as const) {
          const token = jwt.sign({
            actorType,
            actorId: actorType + "-authority",
            realm: actorType === "system" ? "system" : "platform",
            tenantId: null,
            roles: [actorType],
            roleFamilies: [actorType === "system" ? "system" : "platform"],
            scopes: ["tenant:read", "tenant:write"],
            sessionId: actorType + "-session",
            tokenId: actorType + "-token",
            tokenVersion: 1,
            authTime: new Date().toISOString(),
            amr: ["pwd"],
            acr: "urn:drts:loa:1",
            policyVersion: "unit-current",
          } as never);
          const positive = (await invokeRoute(controller, jwt, handler, {
            token,
            tenantId: tenantB,
            method,
            url,
            body,
            params: { ruleId: rule.ruleId },
            query: { search: "confidential" },
          })) as { data: unknown };
          expect(positive.data).toBeTruthy();
        }
      } finally {
        service.onModuleDestroy();
      }
    },
  );
});
