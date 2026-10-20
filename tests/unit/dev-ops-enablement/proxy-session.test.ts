import { createRequire } from "node:module";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalIdentitySessionRecord } from "@drts/contracts";
import {
  DEFAULT_CONTROL_PLANE_JWT_AUDIENCE,
  DEFAULT_CONTROL_PLANE_JWT_ISSUER,
  issueControlPlaneRequestAuth,
} from "@drts/control-plane-auth";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import { AUTH_SCOPE_PRESETS } from "../../../apps/api/src/common/auth/auth.constants";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { AuthController } from "../../../apps/api/src/modules/auth/auth.controller";
import { IdentityRepository } from "../../../apps/api/src/modules/identity/identity.repository";
import { PlatformAdminService } from "../../../apps/api/src/modules/platform-admin/platform-admin.service";

const { Reflector } = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
)("@nestjs/core") as {
  Reflector: new () => ConstructorParameters<typeof BootstrapAuthGuard>[0];
};
type ExecutionContext = Parameters<BootstrapAuthGuard["canActivate"]>[0];
const SECRET = "dev-ops-normal-enablement-synthetic-signing-key";
const ADMIN = "principal_platform_admin_default";

function context(request: object, open: boolean): ExecutionContext {
  return {
    getHandler: () =>
      open ? AuthController.prototype.issueToken : () => undefined,
    getClass: () => AuthController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || !value)
    throw new Error("Expected actual ACK string");
  return value;
}

function httpFailure(value: unknown): value is {
  getStatus(): number;
  getResponse(): unknown;
} {
  return (
    value !== null &&
    typeof value === "object" &&
    "getStatus" in value &&
    typeof value.getStatus === "function" &&
    "getResponse" in value &&
    typeof value.getResponse === "function"
  );
}

async function fixture(activate = true) {
  const backing = new IdentityRepository();
  await backing.onModuleInit();
  const personnel = new PlatformAdminService(
    new AuditNotificationService(),
    undefined,
    backing,
  );
  await personnel.onModuleInit();
  let user = (await personnel.listPlatformAdminUsers()).find(
    (entry) => entry.email === "ops@platform.drts",
  );
  if (!user) throw new Error("Existing normal Ops personnel seed required");
  if (activate)
    user = await personnel.updatePlatformAdminUserRole(
      user.userId,
      {
        roleCode: "operator",
        status: "active",
        reason: "explicit normal unit setup",
      },
      "normal-ops-activation",
      ADMIN,
    );
  const principalId = requiredString(user.canonicalPrincipalId);
  // The availability/DB-I/O boundary is controlled. Actual repository record
  // storage, normal personnel service, package JWT signing, BFF, open/durable
  // guards, AuthController and canonical session issuer all execute unchanged.
  // This is a socket-free storage adapter, not a PostgreSQL durability claim.
  const port = {
    isEnabled: vi.fn(() => true),
    findPrincipalById: vi.fn((id: string) => backing.findPrincipalById(id)),
    findMembershipsByPrincipalId: vi.fn((id: string) =>
      backing.findMembershipsByPrincipalId(id),
    ),
    findRoleBindingsByMembershipId: vi.fn((id: string) =>
      backing.findRoleBindingsByMembershipId(id),
    ),
    ensurePrincipalRecord: vi.fn(
      (...args: Parameters<IdentityRepository["ensurePrincipalRecord"]>) =>
        backing.ensurePrincipalRecord(...args),
    ),
    createSession: vi.fn((record: CanonicalIdentitySessionRecord) =>
      backing.createSession(record),
    ),
    getSession: vi.fn((id: string) => backing.getSession(id)),
    revokeSession: vi.fn(
      (...args: Parameters<IdentityRepository["revokeSession"]>) =>
        backing.revokeSession(...args),
    ),
  };
  const issuer = new JwtAuthService(port as unknown as IdentityRepository);
  const controller = new AuthController(
    issuer,
    {} as never,
    {} as never,
    undefined,
    undefined,
    undefined,
    port as unknown as IdentityRepository,
  );
  const guard = new BootstrapAuthGuard(new Reflector(), issuer);
  const innerValues: string[] = [];
  const fetch = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).startsWith("http://metadata.google.internal/"))
        return new Response("synthetic-google-invocation-proof");
      const headers = Object.fromEntries(new Headers(init?.headers));
      expect(headers.authorization).toBe(
        "Bearer synthetic-google-invocation-proof",
      );
      expect(headers["x-actor-id"]).toBeUndefined();
      expect(headers["x-roles"]).toBeUndefined();
      innerValues.push(headers["x-drts-authorization"] ?? "");
      const path = new URL(String(input)).pathname;
      const request = {
        headers,
        method: init?.method ?? "GET",
        originalUrl: path,
        identity: undefined as BootstrapRequestIdentity | undefined,
      };
      try {
        await guard.canActivate(context(request, path === "/api/auth/token"));
        if (path === "/api/auth/token")
          return Response.json(
            deepToSnakeCase(await controller.issueToken(request)),
            { status: 201 },
          );
        if (path === "/api/auth/session")
          return Response.json(
            deepToSnakeCase(controller.getAuthSession(request.identity!)),
          );
        if (path === "/api/auth/sessions/revoke") {
          const body: unknown = JSON.parse(
            await new Response(init?.body).text(),
          );
          if (
            !body ||
            typeof body !== "object" ||
            !("sessionId" in body) ||
            typeof body.sessionId !== "string"
          )
            throw new Error("Expected normal revoke body");
          return Response.json(
            deepToSnakeCase(
              await controller.revokeSessionSelf(request.identity!, {
                sessionId: body.sessionId,
              }),
            ),
          );
        }
        throw new Error("Unexpected controlled API route");
      } catch (error) {
        if (httpFailure(error))
          return Response.json(deepToSnakeCase(error.getResponse()), {
            status: error.getStatus(),
          });
        throw error;
      }
    },
  );
  vi.stubGlobal("fetch", fetch);
  vi.stubEnv("DRTS_DEV_WORKFORCE_PRINCIPAL_ID", principalId);
  const route =
    await import("../../../apps/ops-console-web/app/control-plane-proxy/[...path]/route");
  async function call(
    path: string[],
    options: {
      method?: "GET" | "POST";
      inner?: string;
      body?: object;
      selectors?: boolean;
    } = {},
  ) {
    const method = options.method ?? "GET";
    const headers = new Headers();
    if (options.inner !== undefined)
      headers.set("x-drts-authorization", options.inner);
    if (options.body) headers.set("content-type", "application/json");
    if (options.selectors) {
      headers.set("x-actor-id", "foreign-caller-selector");
      headers.set("x-roles", "platform_admin");
    }
    const url = new URL(
      `https://ops.example.test/control-plane-proxy/${path.join("/")}`,
    );
    if (options.selectors)
      url.searchParams.set("devCanonicalPrincipalId", "foreign-query-selector");
    const request = new NextRequest(url, {
      method,
      headers,
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    const params = { params: Promise.resolve({ path }) };
    return method === "POST"
      ? route.POST(request, params)
      : route.GET(request, params);
  }
  return {
    backing,
    personnel,
    user,
    principalId,
    port,
    issuer,
    controller,
    guard,
    fetch,
    innerValues,
    call,
  };
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DRTS_ENV", "development");
  vi.stubEnv("DRTS_E2E_PROVISIONING", "false");
  vi.stubEnv("DRTS_DEV_MFA_WAIVED", "true");
  vi.stubEnv("STRICT_IAP_MODE", "false");
  vi.stubEnv("CONTROL_PLANE_IAP_ENABLED", "false");
  vi.stubEnv("JWT_SECRET", SECRET);
  vi.stubEnv("JWT_ISSUER", DEFAULT_CONTROL_PLANE_JWT_ISSUER);
  vi.stubEnv("JWT_AUDIENCE", DEFAULT_CONTROL_PLANE_JWT_AUDIENCE);
  vi.stubEnv("DRTS_API_URL", "https://api.example.test");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "https://api.example.test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("normal canonical Ops proxy to real session issuer", () => {
  it("uses only the private configured canonical principal, issues a real scoped session and self-revokes it", async () => {
    const f = await fixture();
    const response = await f.call(["auth", "token"], {
      method: "POST",
      selectors: true,
      body: {
        principalId: "foreign-body-selector",
        actorType: "platform_admin",
      },
    });
    expect(response.status).toBe(201);
    const ack = (await response.json()) as Record<string, unknown>;
    const token = requiredString(ack.token);
    const sid = requiredString(ack.session_id);
    expect(ack).toMatchObject({
      principal_id: f.principalId,
      realm: "ops",
      actor_type: "ops_user",
    });
    const verified = await f.issuer.verifyAccessToken(token);
    expect(verified).toMatchObject({
      sub: f.principalId,
      principalId: f.principalId,
      membershipId: f.user.userId,
      sid,
      roles: ["ops_user"],
      amr: ["dev_mfa_waived"],
      acr: "aal1",
    });
    expect([...(verified?.scopes ?? [])].sort()).toEqual(
      [...AUTH_SCOPE_PRESETS.ops_user].sort(),
    );
    expect(verified?.scopes).toEqual(
      expect.arrayContaining([
        "owned:read",
        "owned:write",
        "dispatch:read",
        "dispatch:write",
        "regulatory:read",
      ]),
    );
    expect(verified?.scopes).not.toContain("foundation:write");
    expect(await f.backing.getSession(sid)).toMatchObject({
      principalId: f.principalId,
      membershipId: f.user.userId,
      status: "active",
    });
    expect(f.port.ensurePrincipalRecord).not.toHaveBeenCalled();
    const lookup = await f.call(["auth", "session"], {
      inner: `Bearer ${token}`,
    });
    expect(lookup.status).toBe(200);
    expect(await lookup.json()).toMatchObject({
      data: {
        active: true,
        identity: {
          principal_id: f.principalId,
          session_id: sid,
          realm: "ops",
          actor_type: "ops_user",
        },
      },
    });
    vi.stubEnv("DRTS_DEV_WORKFORCE_PRINCIPAL_ID", "");
    expect(
      (await f.call(["auth", "session"], { inner: `Bearer ${token}` })).status,
    ).toBe(200);
    const revoke = await f.call(["auth", "sessions", "revoke"], {
      method: "POST",
      inner: `Bearer ${token}`,
      body: { sessionId: sid },
    });
    expect(revoke.status).toBe(200);
    expect(await f.backing.getSession(sid)).toMatchObject({
      status: "revoked",
    });
    expect(
      (await f.call(["auth", "session"], { inner: `Bearer ${token}` })).status,
    ).toBe(401);
    expect(f.port.createSession).toHaveBeenCalledTimes(1);
  });

  it.each([
    "pending",
    "suspended",
    "foreign-membership",
    "observer",
    "legacy-role",
    "expired-binding",
    "disabled-repository",
  ] as const)(
    "denies %s canonical authority without creating a session or principal",
    async (state) => {
      const f = await fixture(state !== "pending");
      if (state === "suspended")
        await f.personnel.updatePlatformAdminUserRole(
          f.user.userId,
          {
            roleCode: "operator",
            status: "suspended",
            reason: "normal suspension",
          },
          "suspend-ops",
          ADMIN,
        );
      if (state === "foreign-membership")
        f.port.findMembershipsByPrincipalId.mockImplementation(async (id) =>
          (await f.backing.findMembershipsByPrincipalId(id)).map((entry) => ({
            ...entry,
            tenantId: "foreign-tenant",
          })),
        );
      if (state === "observer" || state === "legacy-role")
        f.port.findRoleBindingsByMembershipId.mockImplementation(async (id) =>
          (await f.backing.findRoleBindingsByMembershipId(id)).map((entry) => ({
            ...entry,
            roleCode: state === "observer" ? "ops_observer" : "operator",
          })),
        );
      if (state === "expired-binding")
        f.port.findRoleBindingsByMembershipId.mockImplementation(async (id) =>
          (await f.backing.findRoleBindingsByMembershipId(id)).map((entry) => ({
            ...entry,
            validTo: new Date(Date.now() - 1_000).toISOString(),
          })),
        );
      if (state === "disabled-repository")
        f.port.isEnabled.mockReturnValue(false);
      const response = await f.call(["auth", "token"], { method: "POST" });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        error: { code: "DEV_WORKFORCE_SESSION_EXCHANGE_DENIED" },
      });
      expect(f.port.createSession).not.toHaveBeenCalled();
      expect(f.port.ensurePrincipalRecord).not.toHaveBeenCalled();
    },
  );

  it.each(["pa-operator-001", "missing-canonical-principal"])(
    "does not provision the configured but absent %s reference",
    async (principalId) => {
      const f = await fixture();
      vi.stubEnv("DRTS_DEV_WORKFORCE_PRINCIPAL_ID", principalId);
      expect((await f.call(["auth", "token"], { method: "POST" })).status).toBe(
        403,
      );
      expect(f.port.findPrincipalById).toHaveBeenCalledWith(principalId);
      expect(f.port.createSession).not.toHaveBeenCalled();
      expect(f.port.ensurePrincipalRecord).not.toHaveBeenCalled();
    },
  );

  it("rejects missing private config before network instead of falling back to the default legacy actor", async () => {
    const f = await fixture();
    vi.stubEnv("DRTS_DEV_WORKFORCE_PRINCIPAL_ID", "");
    expect((await f.call(["auth", "token"], { method: "POST" })).status).toBe(
      401,
    );
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.port.createSession).not.toHaveBeenCalled();
  });

  it("keeps an invalid supplied inner token unchanged for genuine upstream rejection, never default replacement", async () => {
    const f = await fixture();
    const response = await f.call(["auth", "session"], {
      inner: "Bearer synthetic-invalid-token",
    });
    expect(response.status).toBe(401);
    expect(f.innerValues).toEqual(["Bearer synthetic-invalid-token"]);
    expect(f.port.createSession).not.toHaveBeenCalled();
    expect(f.port.ensurePrincipalRecord).not.toHaveBeenCalled();
  });

  it("does not enable the new dev canonical branch when the explicit flag is false", async () => {
    const f = await fixture();
    vi.stubEnv("DRTS_DEV_MFA_WAIVED", "false");
    const response = await f.call(["auth", "token"], { method: "POST" });
    expect([401, 403]).toContain(response.status);
    expect(f.port.createSession).not.toHaveBeenCalled();
    expect(f.port.ensurePrincipalRecord).not.toHaveBeenCalled();
  });

  it.each([
    ["DRTS_ENV", "production"],
    ["DRTS_ENV", "staging"],
    ["STRICT_IAP_MODE", "true"],
    ["CONTROL_PLANE_IAP_ENABLED", "true"],
  ] as const)(
    "preserves the original IAP fence for %s=%s",
    async (name, value) => {
      const f = await fixture();
      vi.stubEnv(name, value);
      const response = await f.call(["auth", "token"], {
        method: "POST",
        inner: "Bearer supplied-without-required-IAP-assertion",
      });
      expect(response.status).toBe(401);
      expect(f.fetch).not.toHaveBeenCalled();
      expect(f.port.createSession).not.toHaveBeenCalled();
    },
  );

  it("the real package rejects a configured Ops principal without a signing key", async () => {
    await expect(
      issueControlPlaneRequestAuth({
        actorType: "ops_user",
        jwtSecret: "",
        devCanonicalPrincipalId: "canonical-reference",
        strictIapMode: false,
        iapEnabled: false,
      }),
    ).rejects.toThrow();
  });
});
