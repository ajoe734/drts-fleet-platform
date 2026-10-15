import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantPartnerController } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { persistenceHarness } from "./persistence-harness";
import { invokeRoute, signedIdentity } from "./route-harness";

beforeEach(() => {
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("JWT_SECRET", "sla-recovery-authority-test-only");
  vi.stubEnv("JWT_ISSUER", "drts-tests");
  vi.stubEnv("JWT_AUDIENCE", "drts-api");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("F3 SLA authorization before canonical recovery", () => {
  const tenantA = "tenant-sla-A";
  const tenantB = "tenant-sla-B";

  function harness() {
    const p = persistenceHarness();
    const audit = new AuditNotificationService();
    const auditSpy = vi.spyOn(audit, "recordAuditLog");
    const service = new TenantPartnerService(audit, p.repository);
    const jwt = new JwtAuthService();
    const controller = new TenantPartnerController(
      service,
      {} as never,
      {} as never,
      jwt,
      {} as never,
    );
    const route = (token: string, waitThresholdMin: number) =>
      invokeRoute(controller, jwt, "updateSlaProfile", {
        token,
        tenantId: tenantB,
        method: "POST",
        url: "/api/tenant/sla",
        body: { waitThresholdMin },
      });
    const tokenB = signedIdentity(jwt, tenantB);
    const leavePending = async () => {
      await route(tokenB, 10);
      p.failInsert(1);
      p.rejectReadbacks();
      await expect(route(tokenB, 20)).rejects.toThrow("SQL rejected");
      expect(() => service.getSlaProfile(tenantB)).toThrowError(
        expect.objectContaining({
          code: "TENANT_CONFIGURATION_READBACK_PENDING",
        }),
      );
      p.query.mockClear();
      auditSpy.mockClear();
    };
    return { p, auditSpy, service, jwt, route, tokenB, leavePending };
  }

  it.each([
    ["mounted", false],
    ["mounted", true],
    ["service", false],
    ["service", true],
  ] as const)(
    "%s denies signed A selecting B with recoverable=%s before any SQL/cache/audit or recovery consumption",
    async (entry, recoverable) => {
      const h = harness();
      try {
        await h.leavePending();
        h.p.rejectReadbacks(!recoverable);
        const before = structuredClone(h.service["slaProfiles"]);
        const tokenA = signedIdentity(h.jwt, tenantA);
        const identityA = h.jwt.toRequestIdentity(
          (await h.jwt.verifyAccessToken(tokenA))!,
        );
        expect(identityA?.tenantId).toBe(tenantA);
        const serviceSpy = vi.spyOn(h.service, "updateSlaProfile");
        // Promise.then also captures the original synchronous service denial.
        await expect(
          Promise.resolve().then(() =>
            entry === "mounted"
              ? h.route(tokenA, 20)
              : h.service.updateSlaProfile(
                  tenantB,
                  { waitThresholdMin: 20 },
                  undefined,
                  undefined,
                  identityA,
                ),
          ),
        ).rejects.toMatchObject({ status: 403, code: "TENANT_SCOPE_MISMATCH" });
        expect(h.p.query).not.toHaveBeenCalled();
        expect(h.auditSpy).not.toHaveBeenCalled();
        expect(h.service["slaProfiles"]).toEqual(before);
        expect(() => h.service.getSlaProfile(tenantB)).toThrowError(
          expect.objectContaining({
            code: "TENANT_CONFIGURATION_READBACK_PENDING",
          }),
        );
        if (entry === "mounted") expect(serviceSpy).not.toHaveBeenCalled();
        h.p.rejectReadbacks(false);
        await h.route(h.tokenB, 30);
        expect(
          h.p.query.mock.calls.some(([sql]) => sql.includes("SELECT")),
        ).toBe(true);
        expect(h.service.getSlaProfile(tenantB).waitThresholdMin).toBe(30);
        expect(
          (await h.p.repository.loadState()).slaProfiles[0]?.waitThresholdMin,
        ).toBe(30);
        expect(h.auditSpy).toHaveBeenCalledOnce();
      } finally {
        h.service.onModuleDestroy();
      }
    },
  );

  it.each(["platform_admin", "system"] as const)(
    "%s retains authorized SLA recovery through the signed mounted route and direct service",
    async (actorType) => {
      const h = harness();
      try {
        const token = h.jwt.sign({
          actorType,
          actorId: `${actorType}-sla`,
          realm: actorType === "system" ? "system" : "platform",
          tenantId: null,
          roles: [actorType],
          roleFamilies: [actorType === "system" ? "system" : "platform"],
          scopes: ["tenant:sla:read", "tenant:sla:write"],
          sessionId: `${actorType}-session`,
          tokenId: `${actorType}-token`,
          tokenVersion: 1,
          authTime: new Date().toISOString(),
          amr: ["pwd"],
          acr: "urn:drts:loa:1",
          policyVersion: "unit-current",
        } as never);
        for (const entry of ["mounted", "service"]) {
          await h.leavePending();
          h.p.rejectReadbacks(false);
          if (entry === "mounted") await h.route(token, 40);
          else
            await h.service.updateSlaProfile(
              tenantB,
              { waitThresholdMin: 40 },
              undefined,
              undefined,
              h.jwt.toRequestIdentity((await h.jwt.verifyAccessToken(token))!),
            );
          expect(
            h.p.query.mock.calls.some(([sql]) => sql.includes("SELECT")),
          ).toBe(true);
          expect(h.service.getSlaProfile(tenantB).waitThresholdMin).toBe(40);
          expect(
            (await h.p.repository.loadState()).slaProfiles[0]?.waitThresholdMin,
          ).toBe(40);
          expect(h.auditSpy).toHaveBeenCalledOnce();
        }
      } finally {
        h.service.onModuleDestroy();
      }
    },
  );
});
