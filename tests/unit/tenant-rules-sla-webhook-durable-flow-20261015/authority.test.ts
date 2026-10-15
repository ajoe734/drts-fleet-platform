import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantPartnerController } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

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

  it.each(routes)(
    "%s denies a verified A identity selecting populated B before reads or writes",
    async (handler, method, url) => {
      const audit = new AuditNotificationService();
      const service = new TenantPartnerService(audit);
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
        const body =
          handler === "upsertTenantQuotaPolicy"
            ? {
                period: "monthly",
                limit: {
                  bookingCountLimit: 1,
                  amountMinorLimit: null,
                  currency: "TWD",
                  enforcementMode: "warn",
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
