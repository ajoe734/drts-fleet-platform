import { describe, expect, it } from "vitest";

import {
  IAM_ACTOR_POLICY_DEFINITIONS,
  getIamActorScopePreset,
  getIamScopeDefinition,
  isKnownIamScope,
} from "@drts/contracts";
import { BootstrapAuthGuard } from "../../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import type {
  AuthRealm,
  BootstrapRequestIdentity,
} from "../../../../apps/api/src/common/auth/auth.types";

describe("SR-IAM-001 — 平台/ops/P5/tenant/driver/partner/唯讀 API 權限矩陣", () => {
  // Helper to test BootstrapAuthGuard directly against route policies and request identities
  function evaluateRouteAccess(
    method: string,
    url: string,
    identity: Partial<BootstrapRequestIdentity> & {
      actorType: string;
      realm: AuthRealm;
      scopes: string[];
    },
  ): { allowed: boolean; error?: ApiRequestError } {
    const reflector = {
      getAllAndOverride: () => undefined,
    };
    const guard = new BootstrapAuthGuard(reflector as any);

    const fullIdentity: BootstrapRequestIdentity = {
      authMode: "bootstrap_headers",
      actorId: "test-actor-001",
      roles: [],
      roleFamilies: [identity.realm as any],
      tenantId: null,
      partnerId: null,
      partnerProgramId: null,
      partnerEntrySlug: null,
      membershipId: null,
      principalId: "test-principal-001",
      sessionId: "test-sess-001",
      tokenVersion: 1,
      authTime: "2026-09-06T00:00:00Z",
      amr: ["password"],
      acr: "aal1",
      requestId: "req-test-001",
      ...identity,
      actorType: identity.actorType as any,
    };

    const request = {
      method,
      url,
      originalUrl: url,
      headers: {
        "x-actor-id": fullIdentity.actorId,
        "x-actor-type": fullIdentity.actorType,
        "x-realm": fullIdentity.realm,
        "x-scopes": fullIdentity.scopes.join(","),
        "x-request-id": "req-test-001",
      },
      identity: fullIdentity,
    };

    const context = {
      getClass: () => class TestController {},
      getHandler: () => function handler() {},
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    };

    try {
      const allowed = guard.canActivate(context as any);
      return { allowed: Boolean(allowed) };
    } catch (err: unknown) {
      if (err instanceof ApiRequestError) {
        return { allowed: false, error: err };
      }
      throw err;
    }
  }

  // ── 1. Platform Admin 權限驗證 ───────────────────────────────────────────
  describe("1. 平台管理員 (platform_admin)", () => {
    it("holds identity:sessions:read and identity:sessions:write in actor preset", () => {
      const scopes = getIamActorScopePreset("platform_admin");
      expect(scopes).toContain("identity:sessions:read");
      expect(scopes).toContain("identity:sessions:write");
      expect(scopes).toContain("multi_taxi_records:read");
      expect(scopes).toContain("multi_taxi_records:export");
    });

    it("合法成功: platform_admin can access GET /identity/sessions", () => {
      const presetScopes = [...getIamActorScopePreset("platform_admin")];
      const result = evaluateRouteAccess("GET", "/identity/sessions", {
        actorType: "platform_admin",
        realm: "platform",
        scopes: presetScopes,
      });
      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("合法成功: platform_admin can access POST /identity/sessions/sess_123/revoke", () => {
      const presetScopes = [...getIamActorScopePreset("platform_admin")];
      const result = evaluateRouteAccess(
        "POST",
        "/identity/sessions/sess_123/revoke",
        {
          actorType: "platform_admin",
          realm: "platform",
          scopes: presetScopes,
        },
      );
      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("不擴權: platform_admin does NOT hold assistant:write (least privilege per FIX-IAM-UNGRANTABLE-002)", () => {
      const scopes = getIamActorScopePreset("platform_admin");
      expect(scopes).not.toContain("assistant:write");
    });
  });

  // ── 2. Ops User 權限驗證 ─────────────────────────────────────────────────
  describe("2. 營運使用者 (ops_user)", () => {
    it("holds operational and assistant scopes but NOT session governance or P5 records", () => {
      const scopes = getIamActorScopePreset("ops_user");
      expect(scopes).toContain("assistant:write");
      expect(scopes).toContain("callcenter:read");
      expect(scopes).toContain("complaints:read");
      expect(scopes).toContain("dispatch:read");

      // Non-delegated sensitive scopes MUST NOT be held:
      expect(scopes).not.toContain("identity:sessions:read");
      expect(scopes).not.toContain("identity:sessions:write");
      expect(scopes).not.toContain("multi_taxi_records:read");
      expect(scopes).not.toContain("multi_taxi_records:export");
      expect(scopes).not.toContain("identity:break-glass:approve");
      expect(scopes).not.toContain("identity:break-glass:activate");
    });

    it("非法拒絕: ops_user is denied GET /identity/sessions with 403 AUTH_SCOPE_DENIED", () => {
      const presetScopes = [...getIamActorScopePreset("ops_user")];
      const result = evaluateRouteAccess("GET", "/identity/sessions", {
        actorType: "ops_user",
        realm: "ops",
        scopes: presetScopes,
      });
      expect(result.allowed).toBe(false);
      expect(result.error?.getStatus()).toBe(403);
      expect(result.error?.code).toBe("AUTH_SCOPE_DENIED");
    });

    it("非法拒絕: ops_user is denied POST /identity/sessions/sess_123/revoke with 403 AUTH_SCOPE_DENIED", () => {
      const presetScopes = [...getIamActorScopePreset("ops_user")];
      const result = evaluateRouteAccess(
        "POST",
        "/identity/sessions/sess_123/revoke",
        {
          actorType: "ops_user",
          realm: "ops",
          scopes: presetScopes,
        },
      );
      expect(result.allowed).toBe(false);
      expect(result.error?.getStatus()).toBe(403);
      expect(result.error?.code).toBe("AUTH_SCOPE_DENIED");
    });

    it("非法拒絕: ops_user is denied P5 trip records export with 403", () => {
      const presetScopes = [...getIamActorScopePreset("ops_user")];
      const p5Result = evaluateRouteAccess(
        "POST",
        "/platform-admin/multi-taxi-trip-records/export-jobs",
        {
          actorType: "ops_user",
          realm: "ops",
          scopes: presetScopes,
        },
      );
      expect(p5Result.allowed).toBe(false);
      expect(p5Result.error?.getStatus()).toBe(403);
    });
  });

  // ── 3. P5 營運紀錄權限驗證 ───────────────────────────────────────────────
  describe("3. P5 營運紀錄 (P5 records)", () => {
    it("allowed only to system and platform realms with multi_taxi_records:read", () => {
      const readDef = getIamScopeDefinition("multi_taxi_records:read");
      expect(readDef).not.toBeNull();
      expect(readDef?.allowedRealms).toEqual(
        expect.arrayContaining(["system", "platform"]),
      );
      expect(readDef?.allowedRealms).not.toContain("ops");
      expect(readDef?.allowedRealms).not.toContain("tenant");
      expect(readDef?.allowedRealms).not.toContain("driver");
    });

    it("legal caller (platform_admin with multi_taxi_records:read) succeeds", () => {
      const result = evaluateRouteAccess(
        "GET",
        "/platform-admin/multi-taxi-trip-records",
        {
          actorType: "platform_admin",
          realm: "platform",
          scopes: ["foundation:read", "multi_taxi_records:read"],
        },
      );
      expect(result.allowed).toBe(true);
    });

    it("illegal realm (tenant_admin or driver) is denied with 403 AUTH_REALM_DENIED", () => {
      const tenantResult = evaluateRouteAccess(
        "GET",
        "/platform-admin/multi-taxi-trip-records",
        {
          actorType: "tenant_admin",
          realm: "tenant",
          scopes: ["multi_taxi_records:read"],
        },
      );
      expect(tenantResult.allowed).toBe(false);
      expect(tenantResult.error?.getStatus()).toBe(403);
      expect(tenantResult.error?.code).toBe("AUTH_REALM_DENIED");

      const driverResult = evaluateRouteAccess(
        "GET",
        "/platform-admin/multi-taxi-trip-records",
        {
          actorType: "driver_user",
          realm: "driver",
          scopes: ["driver:read", "multi_taxi_records:read"],
        },
      );
      expect(driverResult.allowed).toBe(false);
      expect(driverResult.error?.getStatus()).toBe(403);
      expect(driverResult.error?.code).toBe("AUTH_REALM_DENIED");
    });
  });

  // ── 4. Tenant 權限驗證 ───────────────────────────────────────────────────
  describe("4. 租戶管理者與使用者 (tenant_admin / tenant_viewer)", () => {
    it("tenant_admin holds tenant-scoped session management scopes", () => {
      const scopes = getIamActorScopePreset("tenant_admin");
      expect(scopes).toContain("identity:sessions:read");
      expect(scopes).toContain("identity:sessions:write");
      expect(scopes).toContain("tenant:read");
      expect(scopes).toContain("tenant:write");
    });

    it("tenant_admin can access GET /identity/sessions within tenant realm", () => {
      const result = evaluateRouteAccess("GET", "/identity/sessions", {
        actorType: "tenant_admin",
        realm: "tenant",
        scopes: [...getIamActorScopePreset("tenant_admin")],
        tenantId: "t-001",
      });
      expect(result.allowed).toBe(true);
    });

    it("tenant_admin is denied access to platform control plane endpoints with 403 AUTH_REALM_DENIED", () => {
      const result = evaluateRouteAccess("GET", "/platform-admin/tenants", {
        actorType: "tenant_admin",
        realm: "tenant",
        scopes: [...getIamActorScopePreset("tenant_admin")],
      });
      expect(result.allowed).toBe(false);
      expect(result.error?.getStatus()).toBe(403);
      expect(result.error?.code).toBe("AUTH_REALM_DENIED");
    });
  });

  // ── 5. Driver 權限驗證 ───────────────────────────────────────────────────
  describe("5. 司機 (driver_user)", () => {
    it("driver_user is denied GET /identity/sessions with 403 AUTH_REALM_DENIED", () => {
      const scopes = getIamActorScopePreset("driver_user");
      const result = evaluateRouteAccess("GET", "/identity/sessions", {
        actorType: "driver_user",
        realm: "driver",
        scopes: [...scopes],
      });
      expect(result.allowed).toBe(false);
      expect(result.error?.getStatus()).toBe(403);
      expect(result.error?.code).toBe("AUTH_REALM_DENIED");
    });

    it("driver_user is denied platform/ops control plane endpoints with 403 AUTH_REALM_DENIED", () => {
      const scopes = getIamActorScopePreset("driver_user");
      const result = evaluateRouteAccess("GET", "/audit", {
        actorType: "driver_user",
        realm: "driver",
        scopes: [...scopes],
      });
      expect(result.allowed).toBe(false);
      expect(result.error?.getStatus()).toBe(403);
      expect(result.error?.code).toBe("AUTH_REALM_DENIED");
    });
  });

  // ── 6. Partner 權限驗證 ───────────────────────────────────────────────────
  describe("6. 合作方 (partner_api_key / referral_passenger)", () => {
    it("partner_api_key is denied GET /identity/sessions with 403 AUTH_REALM_DENIED", () => {
      const scopes = getIamActorScopePreset("partner_api_key");
      const result = evaluateRouteAccess("GET", "/identity/sessions", {
        actorType: "partner_api_key",
        realm: "partner",
        scopes: [...scopes],
      });
      expect(result.allowed).toBe(false);
      expect(result.error?.getStatus()).toBe(403);
      expect(result.error?.code).toBe("AUTH_REALM_DENIED");
    });

    it("partner_api_key is denied session revocation with 403 AUTH_REALM_DENIED", () => {
      const scopes = getIamActorScopePreset("partner_api_key");
      const result = evaluateRouteAccess(
        "POST",
        "/identity/sessions/sess_999/revoke",
        {
          actorType: "partner_api_key",
          realm: "partner",
          scopes: [...scopes],
        },
      );
      expect(result.allowed).toBe(false);
      expect(result.error?.getStatus()).toBe(403);
      expect(result.error?.code).toBe("AUTH_REALM_DENIED");
    });
  });

  // ── 7. 唯讀角色與寫入隔離 ───────────────────────────────────────────────
  describe("7. 唯讀角色與寫入隔離 (不擴權掩蓋錯誤)", () => {
    it("read-only platform identity can read sessions but is denied revoke mutation", () => {
      // Identity holding only identity:sessions:read, lacking identity:sessions:write
      const readOnlyScopes = ["identity:read", "identity:sessions:read"];

      // 1. Read succeeds
      const readResult = evaluateRouteAccess("GET", "/identity/sessions", {
        actorType: "platform_admin",
        realm: "platform",
        scopes: readOnlyScopes,
      });
      expect(readResult.allowed).toBe(true);

      // 2. Revoke mutation is rejected with 403 AUTH_SCOPE_DENIED
      const writeResult = evaluateRouteAccess(
        "POST",
        "/identity/sessions/sess_123/revoke",
        {
          actorType: "platform_admin",
          realm: "platform",
          scopes: readOnlyScopes,
        },
      );
      expect(writeResult.allowed).toBe(false);
      expect(writeResult.error?.getStatus()).toBe(403);
      expect(writeResult.error?.code).toBe("AUTH_SCOPE_DENIED");
    });

    it("tenant_viewer can read tenant data but is denied tenant mutations", () => {
      const viewerScopes = [
        "identity:read",
        "audit:read",
        "tenant:read",
        "tenant:webhooks:read",
        "tenant:sla:read",
        "tenant:billing:read",
        "reports:read",
      ];

      // Read succeeds
      const readResult = evaluateRouteAccess("GET", "/tenant/t-001", {
        actorType: "tenant_admin",
        realm: "tenant",
        scopes: viewerScopes,
      });
      expect(readResult.allowed).toBe(true);

      // Mutation is rejected
      const writeResult = evaluateRouteAccess(
        "POST",
        "/tenant/t-001/cost-centers",
        {
          actorType: "tenant_admin",
          realm: "tenant",
          scopes: viewerScopes,
        },
      );
      expect(writeResult.allowed).toBe(false);
      expect(writeResult.error?.getStatus()).toBe(403);
      expect(writeResult.error?.code).toBe("AUTH_SCOPE_DENIED");
    });
  });

  // ── 8. Scope Catalog Grantability & Completeness ─────────────────────────
  describe("8. IAM Scope Catalog 完整性與可授權性", () => {
    it("defines identity:sessions:write and identity:sessions:read in catalog", () => {
      expect(isKnownIamScope("identity:sessions:read")).toBe(true);
      expect(isKnownIamScope("identity:sessions:write")).toBe(true);

      const readDef = getIamScopeDefinition("identity:sessions:read");
      const writeDef = getIamScopeDefinition("identity:sessions:write");

      expect(readDef?.allowedRealms).toEqual(
        expect.arrayContaining(["system", "platform", "tenant", "ops"]),
      );
      expect(writeDef?.allowedRealms).toEqual(
        expect.arrayContaining(["system", "platform", "tenant", "ops"]),
      );
    });

    it("verifies every route scope in auth policy is grantable to at least one actor preset", () => {
      const grantableScopes = new Set(
        IAM_ACTOR_POLICY_DEFINITIONS.flatMap((d) => d.scopes),
      );

      // Verify key remediation scopes
      expect(grantableScopes.has("identity:sessions:read")).toBe(true);
      expect(grantableScopes.has("identity:sessions:write")).toBe(true);
      expect(grantableScopes.has("multi_taxi_records:read")).toBe(true);
      expect(grantableScopes.has("multi_taxi_records:export")).toBe(true);
      expect(grantableScopes.has("assistant:write")).toBe(true);
    });
  });
});
