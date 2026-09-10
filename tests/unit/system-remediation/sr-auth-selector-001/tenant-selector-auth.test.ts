import { afterEach, describe, expect, it } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { BootstrapAuthGuard } from "../../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { extractBootstrapRequestIdentity } from "../../../../apps/api/src/common/auth/auth.extractor";
import { JwtAuthService } from "../../../../apps/api/src/common/auth/jwt-auth.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantPartnerController } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

// SR-AUTH-SELECTOR-001: x-tenant-id is a tenant *resource selector*, never
// authentication/role/identity proof. These tests pin the two proven
// conflicts: (1) a selector-only request must not be treated as an
// authenticated bootstrap actor (it previously defaulted to actorType
// "system", which bypasses tenant scoping entirely), and (2) a verified
// Bearer JWT carrying the same selector header must not be rejected before
// the token is even checked in strict environments.

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function makeContext(request: unknown) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as never;
}

async function expectApiRequestError(
  action: () => unknown | Promise<unknown>,
): Promise<ApiRequestError> {
  try {
    await action();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    return error as ApiRequestError;
  }
  throw new Error("Expected ApiRequestError");
}

describe("SR-AUTH-SELECTOR-001: auth.extractor treats x-tenant-id as a selector, not identity", () => {
  it("does not treat a lone x-tenant-id header as bootstrap identity on protected routes", () => {
    const identity = extractBootstrapRequestIdentity(
      { "x-tenant-id": "selector-only-tenant" },
      { allowAnonymous: false },
    );
    expect(identity).toBeNull();
  });

  it("does not leak the selector value into the anonymous identity fallback", () => {
    const identity = extractBootstrapRequestIdentity(
      { "x-tenant-id": "selector-only-tenant" },
      { allowAnonymous: true },
    );
    expect(identity).not.toBeNull();
    expect(identity?.actorType).toBe("system");
    expect(identity?.tenantId).toBeNull();
  });

  it("still builds a full bootstrap identity when a real actor-type signal accompanies the selector (dev bootstrap unaffected)", () => {
    const identity = extractBootstrapRequestIdentity(
      { "x-actor-type": "tenant_admin", "x-tenant-id": "acme-tenant" },
      { allowAnonymous: false },
    );
    expect(identity).not.toBeNull();
    expect(identity?.actorType).toBe("tenant_admin");
    expect(identity?.tenantId).toBe("acme-tenant");
  });
});

describe("SR-AUTH-SELECTOR-001: BootstrapAuthGuard selector-vs-identity conflict", () => {
  it.each(["local", "test", "staging", "production"])(
    "rejects a request carrying only x-tenant-id with 401 AUTH_REQUIRED in %s environment",
    async (env) => {
      process.env.APP_ENV = env;
      const guard = new BootstrapAuthGuard({
        getAllAndOverride: () => undefined,
      } as never);
      const request: Record<string, unknown> = {
        headers: { "x-tenant-id": "selector-only-tenant" },
        method: "GET",
        url: "/api/tenant/api-keys",
      };

      const error = await expectApiRequestError(() =>
        guard.canActivate(makeContext(request)),
      );
      expect(error.getStatus()).toBe(401);
      expect(error.code).toBe("AUTH_REQUIRED");
      expect(request.identity).toBeUndefined();
    },
  );

  it("lets a verified bearer token through in staging when only the tenant selector header accompanies it", async () => {
    process.env.APP_ENV = "staging";
    process.env.JWT_SECRET = "unit-test-jwt-secret";
    process.env.JWT_ISSUER = "drts";
    process.env.JWT_AUDIENCE = "drts-api";

    const jwtAuthService = new JwtAuthService();
    const token = jwtAuthService.sign({
      authMode: "jwt_bearer",
      actorType: "tenant_admin",
      actorId: "tenant-a-admin",
      realm: "tenant",
      tenantId: "tenant-a",
      roles: ["tenant_admin"],
      scopes: ["tenant:read", "tenant:write"],
      roleFamilies: ["tenant"],
      requestId: null,
      sessionId: "sess-selector-fix-a",
      tokenId: "jti-selector-fix-a",
      tokenVersion: 1,
      authTime: new Date().toISOString(),
      amr: ["tenant_bootstrap_fixture"],
      acr: "aal1",
      policyVersion: "v1",
    });

    const guard = new BootstrapAuthGuard(
      { getAllAndOverride: () => undefined } as never,
      jwtAuthService,
    );
    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${token}`, "x-tenant-id": "tenant-a" },
      method: "GET",
      url: "/api/tenant/api-keys",
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    const identity = request.identity as { tenantId: string; actorType: string };
    expect(identity.tenantId).toBe("tenant-a");
    expect(identity.actorType).toBe("tenant_admin");
  });

  it("still rejects real identity-spoofing headers in staging even alongside a tenant selector and a verified bearer token", async () => {
    process.env.APP_ENV = "staging";
    process.env.JWT_SECRET = "unit-test-jwt-secret";
    process.env.JWT_ISSUER = "drts";
    process.env.JWT_AUDIENCE = "drts-api";

    const jwtAuthService = new JwtAuthService();
    const token = jwtAuthService.sign({
      authMode: "jwt_bearer",
      actorType: "platform_admin",
      actorId: "platform-admin-001",
      realm: "platform",
      tenantId: null,
      roles: ["superadmin"],
      scopes: ["foundation:read"],
      roleFamilies: ["platform"],
      requestId: null,
      sessionId: "sess-selector-fix-spoof",
      tokenId: "jti-selector-fix-spoof",
      tokenVersion: 1,
      authTime: new Date().toISOString(),
      amr: ["verified_iap_workforce"],
      acr: "aal2",
      policyVersion: "v1",
    });

    const guard = new BootstrapAuthGuard(
      { getAllAndOverride: () => undefined } as never,
      jwtAuthService,
    );
    const request: Record<string, unknown> = {
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": "tenant-a",
        "x-actor-type": "platform_admin",
        "x-actor-id": "spoofed-admin",
        "x-realm": "platform",
      },
      method: "GET",
      url: "/api/platform-admin/tenants",
    };

    const error = await expectApiRequestError(() =>
      guard.canActivate(makeContext(request)),
    );
    expect(error.code).toBe("AUTH_BOOTSTRAP_HEADERS_FORBIDDEN");
  });

  it("does not let a selector-only header grant tenant-scoped identity on an open route", async () => {
    process.env.APP_ENV = "test";
    const guard = new BootstrapAuthGuard({
      getAllAndOverride: () => true, // simulate @OpenRoute()
    } as never);
    const request: Record<string, unknown> = {
      headers: { "x-tenant-id": "selector-only-tenant" },
      method: "POST",
      url: "/api/partner/ingress/handoff",
    };

    expect(await guard.canActivate(makeContext(request))).toBe(true);
    const identity = request.identity as
      | { tenantId: string | null; actorType: string }
      | undefined;
    expect(identity?.tenantId ?? null).toBeNull();
  });
});

describe("SR-AUTH-SELECTOR-001: end-to-end guard + tenant-partner controller acceptance", () => {
  const TENANT_A = "sr-auth-selector-tenant-a";
  const TENANT_B = "sr-auth-selector-tenant-b";

  function createHarness() {
    const auditService = new AuditNotificationService();
    const service = new TenantPartnerService(auditService);
    const controller = new TenantPartnerController(
      service,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );
    return { service, controller };
  }

  function signTenantAdminToken(
    jwtAuthService: JwtAuthService,
    tenantId: string,
    actorId: string,
  ) {
    return jwtAuthService.sign({
      authMode: "jwt_bearer",
      actorType: "tenant_admin",
      actorId,
      realm: "tenant",
      tenantId,
      roles: ["tenant_admin"],
      scopes: ["tenant:read", "tenant:write"],
      roleFamilies: ["tenant"],
      requestId: null,
      sessionId: `sess-${actorId}`,
      tokenId: `jti-${actorId}`,
      tokenVersion: 1,
      authTime: new Date().toISOString(),
      amr: ["tenant_bootstrap_fixture"],
      acr: "aal1",
      policyVersion: "v1",
    });
  }

  it("selector-only request never reaches the controller (401 before any service/SQL call)", async () => {
    process.env.APP_ENV = "test";
    const guard = new BootstrapAuthGuard({
      getAllAndOverride: () => undefined,
    } as never);
    const request: Record<string, unknown> = {
      headers: { "x-tenant-id": TENANT_A },
      method: "GET",
      url: "/api/tenant/api-keys",
    };

    const error = await expectApiRequestError(() =>
      guard.canActivate(makeContext(request)),
    );
    expect(error.code).toBe("AUTH_REQUIRED");
    expect(request.identity).toBeUndefined();
  });

  it("valid same-tenant JWT + matching selector reaches the controller and returns only that tenant's keys", async () => {
    process.env.APP_ENV = "test";
    process.env.JWT_SECRET = "unit-test-jwt-secret";
    process.env.JWT_ISSUER = "drts";
    process.env.JWT_AUDIENCE = "drts-api";

    const { service, controller } = createHarness();
    const jwtAuthService = new JwtAuthService();
    const issued = await service.issueApiKey(TENANT_A, {
      keyName: "Selector Fix Key",
      scopes: ["tenant:read"],
    });

    const token = signTenantAdminToken(jwtAuthService, TENANT_A, "tenant-a-admin");
    const guard = new BootstrapAuthGuard(
      { getAllAndOverride: () => undefined } as never,
      jwtAuthService,
    );
    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${token}`, "x-tenant-id": TENANT_A },
      method: "GET",
      url: "/api/tenant/api-keys",
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);

    const result = controller.listApiKeys(
      TENANT_A,
      "req-ok",
      request.identity as never,
    );
    const ids = result.data.items.map(
      (key: { apiKeyId: string }) => key.apiKeyId,
    );
    expect(ids).toContain(issued.apiKey.apiKeyId);
  });

  it("valid JWT with a mismatching tenant selector is rejected 403 TENANT_SCOPE_MISMATCH with no data returned", async () => {
    process.env.APP_ENV = "test";
    process.env.JWT_SECRET = "unit-test-jwt-secret";
    process.env.JWT_ISSUER = "drts";
    process.env.JWT_AUDIENCE = "drts-api";

    const { service, controller } = createHarness();
    const jwtAuthService = new JwtAuthService();
    await service.issueApiKey(TENANT_A, {
      keyName: "Victim Key",
      scopes: ["tenant:read"],
    });

    const token = signTenantAdminToken(jwtAuthService, TENANT_B, "tenant-b-admin");
    const guard = new BootstrapAuthGuard(
      { getAllAndOverride: () => undefined } as never,
      jwtAuthService,
    );
    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${token}`, "x-tenant-id": TENANT_A },
      method: "GET",
      url: "/api/tenant/api-keys",
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);

    let error: ApiRequestError | null = null;
    try {
      controller.listApiKeys(TENANT_A, "req-cross", request.identity as never);
    } catch (caught) {
      error = caught as ApiRequestError;
    }
    expect(error).not.toBeNull();
    expect(error?.getStatus()).toBe(403);
    expect(error?.code).toBe("TENANT_SCOPE_MISMATCH");
  });
});
