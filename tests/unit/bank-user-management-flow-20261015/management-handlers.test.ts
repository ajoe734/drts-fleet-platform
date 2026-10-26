import { createHash, generateKeyPairSync } from "node:crypto";
import { resolve } from "node:path";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { IdentityContext } from "@drts/contracts";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth/auth.types";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { deepToSnakeCase as snake } from "../../../apps/api/src/common/snake-case.interceptor";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { IdentityRepository } from "../../../apps/api/src/modules/identity/identity.repository";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { TenantPartnerController } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import {
  TenantInvitationDeliveryService,
  type TenantInvitationDeliveryRequest,
} from "../../../apps/api/src/modules/tenant-partner/tenant-invitation-delivery.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { OidcPkceService } from "../../../apps/api/src/modules/auth/oidc-pkce.service";
import { AuthController } from "../../../apps/api/src/modules/auth/auth.controller";
import * as authHandlers from "../../../packages/tenant-auth/src/route-handlers";
import * as constants from "../../../packages/tenant-auth/src/constants";
import * as sessionHelpers from "../../../packages/tenant-auth/src/session";
import * as apiFetch from "../../../packages/tenant-auth/src/api-fetch";
import * as sessionVerifier from "../../../packages/tenant-auth/src/verified-tenant-session.server";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";
import { verifyIdentityReadback } from "../../e2e/system-remediation/sr-live-global-ux-20261007/guards";

const appRoot = resolve("apps/bank-console-web");
// Supply the actual TS source to the CommonJS UI loader; bare Node require
// cannot resolve ui-tokens' extensionless ESM exports in this fixture.
const uiTokens = createUiModuleLoader(resolve("packages/ui-tokens"))<
  typeof import("@drts/ui-tokens")
>(resolve("packages/ui-tokens/src/index.ts"));
const bankOrigin = "https://bank.example";
const issuer = "https://accounts.google.com";
const tenantId = "bank-issuer-test";
const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const context = (...auth: string[]) => ({ params: Promise.resolve({ auth }) });
const load = createUiModuleLoader(appRoot, {
  "server-only": {},
  "@drts/ui-tokens": uiTokens,
  "next/server": { NextRequest, NextResponse },
  "next/headers": { cookies: async () => ({ get: () => undefined }) },
  "@drts/tenant-auth": authHandlers,
  "@drts/tenant-auth/constants": constants,
  "@drts/tenant-auth/session": sessionHelpers,
  "@drts/tenant-auth/api-fetch": apiFetch,
  "@drts/tenant-auth/verified-tenant-session.server": sessionVerifier,
});
const bff = load<{
  GET(req: NextRequest): Promise<NextResponse>;
  POST(req: NextRequest): Promise<NextResponse>;
}>(resolve(appRoot, "app/api/users/route.ts"));
const auth = load<ReturnType<typeof authHandlers.createTenantAuthHandlers>>(
  resolve(appRoot, "app/api/auth/[...auth]/route.ts"),
);
class CaptureDelivery extends TenantInvitationDeliveryService {
  tokens = new Map<string, string>();
  override async send(request: TenantInvitationDeliveryRequest) {
    this.tokens.set(request.recipientEmail, request.rawToken);
    return super.send(request);
  }
}

// Only network and persistence boundaries are simulated. Each API hop runs
// the production guard, JWT/session verifier, controller and service.
async function fixture(roleCode = "tenant_admin") {
  const repo = new IdentityRepository();
  const delivery = new CaptureDelivery();
  const audit = new AuditNotificationService();
  const tenant = new TenantPartnerService(
    audit,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    repo,
    repo,
    delivery,
  );
  const signer = new JwtAuthService(repo, tenant);
  const oidc = new OidcPkceService(signer, tenant);
  const controller = new AuthController(
    signer,
    tenant,
    {} as never,
    undefined,
    undefined,
    undefined,
    repo,
    oidc,
  );
  const users = new TenantPartnerController(
    tenant,
    {} as never,
    {} as never,
    signer,
    {} as never,
    repo,
  );
  const guard = new BootstrapAuthGuard(
    { getAllAndOverride: () => undefined } as never,
    signer,
  );
  const admin = await tenant.createTenantUser(tenantId, {
    email: "admin@issuer.example",
    displayName: "Manager",
    roleCode,
  });
  let providerToken = "";
  let injectForeignRow = false;
  let hideReadback = false;
  let wrote = false;
  const calls: {
    path: string;
    method: string;
    headers: Headers;
    body?: Record<string, unknown>;
  }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit): Promise<Response> => {
      const target = new URL(String(url));
      if (target.hostname === "metadata.google.internal")
        return new Response("cloud-run-proof");
      if (target.hostname === "oauth2.googleapis.com")
        return Response.json({ id_token: providerToken });
      if (target.hostname === "www.googleapis.com")
        return Response.json({
          keys: [
            {
              ...pair.publicKey.export({ format: "jwk" }),
              kid: "bank-test-key",
              alg: "RS256",
              use: "sig",
            },
          ],
        });
      if (target.origin !== "https://api.example")
        throw new Error(
          `Unexpected network: ${target.origin}${target.pathname}`,
        );
      const headers = new Headers(init?.headers);
      const method = init?.method ?? "GET";
      const body =
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ path: target.pathname, method, headers, body });
      try {
        if (target.pathname === "/api/auth/tenant/login") {
          const login = oidc.generateLoginParameters("tenant", {
            redirectUri: target.searchParams.get("redirect_uri")!,
            tenantId: target.searchParams.get("tenant_id") || tenantId,
          });
          const state = oidc.verifyStateToken(login.stateToken)!;
          providerToken = jwt.sign(
            {
              sub: "bank-managed-subject",
              email: admin.email,
              email_verified: true,
              nonce: state.nonce,
              amr: ["mfa"],
            },
            pair.privateKey,
            {
              algorithm: "RS256",
              keyid: "bank-test-key",
              issuer,
              audience: "bank-test-client",
              expiresIn: "5m",
            },
          );
          return Response.json({ data: snake(login) });
        }
        if (target.pathname === "/api/auth/tenant/callback-session") {
          const result = await controller.exchangeTenantCallbackSession(
            body as never,
            undefined,
            undefined,
            undefined,
            undefined,
            headers.get("x-oidc-state-token")!,
          );
          return Response.json(snake(result));
        }
        const request = {
          method,
          url: target.pathname,
          originalUrl: target.pathname,
          headers: Object.fromEntries(headers.entries()),
          identity: undefined as BootstrapRequestIdentity | undefined,
        };
        await guard.canActivate({
          getClass: () => class Controller {},
          getHandler: () => function handler() {},
          switchToHttp: () => ({ getRequest: () => request }),
        } as never);
        const identity = request.identity!;
        // CurrentIdentity supplies this same verified runtime object to commands.
        const commandIdentity = identity as unknown as IdentityContext;
        let result: unknown;
        if (target.pathname === "/api/auth/session")
          result = controller.getAuthSession(identity);
        else if (target.pathname === "/api/auth/logout")
          result = await controller.logout(identity);
        else if (target.pathname === "/api/auth/logout-all")
          result = await controller.logoutAll(identity);
        else if (target.pathname === "/api/tenant/roles")
          result = users.listTenantRoles();
        else if (target.pathname === "/api/tenant/users" && method === "GET") {
          const data = users.listTenantUsers(headers.get("x-tenant-id")!);
          if (injectForeignRow)
            data.data.items.push({ ...admin, tenantId: "other-bank" });
          if (hideReadback && wrote) data.data.items = [];
          result = data;
        } else if (
          target.pathname === "/api/tenant/users" &&
          method === "POST"
        ) {
          result = await users.createTenantUser(
            body as never,
            commandIdentity,
            headers.get("x-tenant-id")!,
          );
          wrote = true;
        } else if (/\/api\/tenant\/users\/[^/]+\/role$/.test(target.pathname)) {
          result = await users.updateTenantRole(
            decodeURIComponent(target.pathname.split("/").at(-2)!),
            body as never,
            commandIdentity,
            headers.get("x-tenant-id")!,
          );
          wrote = true;
        } else throw new Error(`Unhandled API ${target.pathname}`);
        return Response.json(snake(result));
      } catch (error) {
        if (error instanceof ApiRequestError)
          return Response.json(error.getResponse(), {
            status: error.getStatus(),
          });
        throw error;
      }
    }),
  );
  // Provision and bind a real canonical membership via the existing invitation
  // consumer. Provider proof is test-signed, never a display-persona mapping.
  await tenant.acceptTenantOidcInvitation(
    createHash("sha256")
      .update(delivery.tokens.get(admin.email)!)
      .digest("hex"),
    { issuer, subject: "bank-managed-subject", email: admin.email, tenantId },
  );
  async function login(scope = tenantId) {
    const start = await auth.GET(
      new NextRequest(
        `${bankOrigin}/api/auth/tenant/login?tenant_id=${scope}&return_url=%2Fusers`,
      ),
      context("tenant", "login"),
    );
    const stateCookie = start.cookies.get(
      constants.TENANT_OIDC_STATE_COOKIE_NAME,
    )!.value;
    const state = sessionHelpers.decodeStateEnvelope(stateCookie)!;
    return auth.GET(
      new NextRequest(
        `${bankOrigin}/api/auth/tenant/callback?code=provider-code&state=${state.state}`,
        {
          headers: {
            cookie: `${constants.TENANT_OIDC_STATE_COOKIE_NAME}=${stateCookie}`,
          },
        },
      ),
      context("tenant", "callback"),
    );
  }
  const signedIn = await login();
  expect(signedIn.status).toBe(307);
  const token = signedIn.cookies.get(
    constants.TENANT_SESSION_COOKIE_NAME,
  )!.value;
  const csrf = signedIn.cookies.get(constants.TENANT_CSRF_COOKIE_NAME)!.value;
  function request(
    input?: unknown,
    options: {
      token?: string;
      csrf?: string;
      origin?: string;
      extraCookie?: string;
    } = {},
  ) {
    const headers = {
      cookie: `${constants.TENANT_SESSION_COOKIE_NAME}=${options.token ?? token}; ${constants.TENANT_CSRF_COOKIE_NAME}=${csrf}; ${options.extraCookie ?? ""}`,
      origin: options.origin ?? bankOrigin,
      [constants.TENANT_CSRF_HEADER_NAME]: options.csrf ?? csrf,
      "content-type": "application/json",
    };
    const req = new NextRequest(
      `${bankOrigin}/api/users?bank=other&role=bank_program_admin`,
      {
        method: input === undefined ? "GET" : "POST",
        headers,
        ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      },
    );
    return input === undefined ? bff.GET(req) : bff.POST(req);
  }
  return {
    repo,
    tenant,
    signer,
    oidc,
    admin,
    delivery,
    login,
    request,
    token,
    csrf,
    signedIn,
    calls,
    foreign: () => {
      injectForeignRow = true;
    },
    stale: () => {
      hideReadback = true;
    },
  };
}

beforeEach(() => {
  vi.stubEnv("APP_ENV", "development");
  vi.stubEnv("DRTS_ENV", "development");
  vi.stubEnv("AUTH_MODE", "jwt");
  vi.stubEnv("OIDC_MOCK_MODE", "false");
  vi.stubEnv("OIDC_ISSUER", issuer);
  vi.stubEnv("OIDC_CLIENT_ID", "bank-test-client");
  vi.stubEnv("TENANT_OIDC_ISSUER", "");
  vi.stubEnv("TENANT_OIDC_AUDIENCE", "");
  vi.stubEnv("JWT_SECRET", "test-bank-management-session-secret-32chars");
  vi.stubEnv("JWT_ISSUER", "https://session.example");
  vi.stubEnv("AUTH_ALLOWED_ORIGINS", bankOrigin);
  vi.stubEnv("BFF_STATE_SECRET", "test-bank-bff-state-secret-32-characters");
  vi.stubEnv("DRTS_API_URL", "https://api.example");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "https://private-api.a.run.app");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Bank managed caller -> production guards/commands/readback", () => {
  it("reads the normal OIDC-issued tenant_admin actor on the Bank session route without inventing a selected UI role", async () => {
    const f = await fixture();
    const response = await auth.GET(
      new NextRequest(`${bankOrigin}/api/auth/session`, {
        headers: { cookie: `${constants.TENANT_SESSION_COOKIE_NAME}=${f.token}` },
      }),
      context("session"),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.identity).toMatchObject({
      actor_id: f.admin.userId,
      actor_type: "tenant_admin",
      realm: "tenant",
      tenant_id: tenantId,
      roles: ["tenant_admin"],
    });
    expect(body.data.identity).not.toHaveProperty("display_role");
    expect(
      verifyIdentityReadback(
        {
          app: "bank-console-web",
          role: "bank_program_admin",
          identity: {
            path: "/api/auth/session",
            subjectPath: "data.identity.actor_id",
            rolePath: "data.identity.roles",
            expectedSubject: f.admin.userId,
          },
        },
        body,
        { status: response.status },
      ),
    ).toMatchObject({
      subject: f.admin.userId,
      effectiveRoles: ["bank_program_admin"],
    });
    expect(() =>
      verifyIdentityReadback(
        {
          app: "bank-console-web",
          role: "bank_program_admin",
          identity: {
            path: "/api/auth/session",
            subjectPath: "data.identity.actor_id",
            rolePath: "data.identity.roles",
            expectedSubject: f.admin.userId,
          },
        },
        { data: { ...body.data, identity: { ...body.data.identity, actor_type: "platform_admin" } } },
      ),
    ).toThrow("bank session actor_type must be tenant_admin");
  });

  it("invites, changes canonical role, suspends and reactivates through the Bank BFF with scoped readback", async () => {
    const f = await fixture();
    const invited = await f.request({
      action: "invite",
      email: "staff@issuer.example",
      displayName: "Staff",
      roleCode: "tenant_viewer",
      tenantId: "other-bank",
    });
    expect(invited.status).toBe(200);
    const data = (await invited.json()).data;
    const user = data.users.find(
      (row: { email: string }) => row.email === "staff@issuer.example",
    );
    expect(user).toMatchObject({
      tenantId,
      roleCode: "tenant_viewer",
      status: "invited",
      role: "bank_ops_viewer",
    });
    expect(user.userId).toMatch(/^tenant_user_/);
    expect(deliveryTokenLeak(data)).toBe(false);
    // Invitation acceptance is an independent existing backend workflow.
    await f.tenant.acceptTenantOidcInvitation(
      createHash("sha256")
        .update(f.delivery.tokens.get(user.email)!)
        .digest("hex"),
      { issuer, subject: "staff-managed-subject", email: user.email, tenantId },
    );
    for (const [command, expected] of [
      [
        {
          action: "role",
          userId: user.userId,
          roleCode: "tenant_finance_admin",
        },
        { roleCode: "tenant_finance_admin", status: "active" },
      ],
      [
        {
          action: "status",
          userId: user.userId,
          status: "suspended",
          roleCode: "tenant_admin",
        },
        { roleCode: "tenant_finance_admin", status: "suspended" },
      ],
      [
        { action: "status", userId: user.userId, status: "active" },
        { roleCode: "tenant_finance_admin", status: "active" },
      ],
    ] as const) {
      const result = await f.request(command);
      expect(result.status).toBe(200);
      expect(
        (await result.json()).data.users.find(
          (row: { userId: string }) => row.userId === user.userId,
        ),
      ).toMatchObject(expected);
    }
    const commands = f.calls.filter(
      (call) =>
        call.method === "POST" && call.path.startsWith("/api/tenant/users"),
    );
    expect(commands).toHaveLength(4);
    for (const call of commands) {
      expect(call.headers.get("authorization")).toBe(`Bearer ${f.token}`);
      expect(call.headers.get("x-serverless-authorization")).toBe(
        "Bearer cloud-run-proof",
      );
      expect(call.headers.get("x-tenant-id")).toBe(tenantId);
      expect(call.headers.has("x-actor-type")).toBe(false);
    }
    expect(commands[2]!.body).toEqual({
      roleCode: "tenant_finance_admin",
      status: "suspended",
    });
  });
  it.each([
    "tenant_admin",
    "tenant_ops_admin",
    "tenant_finance_admin",
    "tenant_viewer",
  ])(
    "accepts assignable catalog role %s as an actual invite payload",
    async (roleCode) => {
      const f = await fixture();
      const result = await f.request({
        action: "invite",
        email: `${roleCode}@issuer.example`,
        displayName: "Catalog member",
        roleCode,
      });
      expect(result.status).toBe(200);
      expect((await result.json()).data.users).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ roleCode, status: "invited", tenantId }),
        ]),
      );
      expect(
        f.calls.find(
          (call) => call.method === "POST" && call.path === "/api/tenant/users",
        )!.body,
      ).toMatchObject({ roleCode });
    },
  );
  it.each(["", "forged", "bank_program_admin:acme.signature"])(
    "rejects missing/forged/display-only session %j without user calls",
    async (token) => {
      const f = await fixture();
      const count = f.calls.length;
      const result = await f.request(
        {
          action: "invite",
          email: "x@issuer.example",
          displayName: "X",
          roleCode: "tenant_admin",
        },
        {
          token,
          extraCookie:
            "drts_bank_console_session=bank_program_admin:acme.signature",
        },
      );
      expect(result.status).toBe(401);
      expect(
        f.calls
          .slice(count)
          .some((call) => call.path.startsWith("/api/tenant/users")),
      ).toBe(false);
    },
  );
  it("viewer can read but a display admin selector never grants write", async () => {
    const f = await fixture("tenant_viewer");
    const read = await f.request();
    expect(read.status).toBe(200);
    expect((await read.json()).data.canManageUsers).toBe(false);
    const result = await f.request({
      action: "invite",
      email: "x@issuer.example",
      displayName: "X",
      roleCode: "tenant_admin",
    });
    expect(result.status).toBe(403);
    expect((await result.json()).error.code).toBe("AUTH_SCOPE_DENIED");
    expect(
      f.calls.some(
        (call) =>
          call.method === "POST" && call.path.startsWith("/api/tenant/users"),
      ),
    ).toBe(false);
  });
  it("rejects cross-origin and CSRF mismatches before verifying a session", async () => {
    const f = await fixture();
    const count = f.calls.length;
    expect(
      (await f.request({}, { origin: "https://attacker.example" })).status,
    ).toBe(403);
    expect((await f.request({}, { csrf: "bad" })).status).toBe(403);
    expect(f.calls).toHaveLength(count);
  });
  it("rejects a foreign target ID, unassignable persona role, and invited account activation", async () => {
    const f = await fixture();
    expect(
      (
        await f.request({
          action: "role",
          userId: "other-bank-user",
          roleCode: "tenant_admin",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await f.request({
          action: "invite",
          email: "x@issuer.example",
          displayName: "X",
          roleCode: "bank_program_admin",
        })
      ).status,
    ).toBe(400);
    const invited = await f.tenant.createTenantUser(tenantId, {
      email: "pending@issuer.example",
      displayName: "Pending",
      roleCode: "tenant_viewer",
    });
    expect(
      (
        await f.request({
          action: "status",
          userId: invited.userId,
          status: "active",
        })
      ).status,
    ).toBe(409);
  });
  it("does not return unrelated users if an upstream read contains another tenant", async () => {
    const f = await fixture();
    f.foreign();
    const result = await f.request();
    expect(result.status).toBe(403);
    expect(await result.json()).toMatchObject({
      error: { code: "CROSS_TENANT_SESSION_FORBIDDEN" },
    });
  });
  it("preserves backend self-change errors and never reports a missing readback as success", async () => {
    const f = await fixture();
    const self = await f.request({
      action: "role",
      userId: f.admin.userId,
      roleCode: "tenant_viewer",
    });
    expect(self.status).toBe(403);
    expect((await self.json()).error.code).toBe(
      "TENANT_SELF_ROLE_CHANGE_DENIED",
    );
    f.stale();
    const result = await f.request({
      action: "invite",
      email: "x@issuer.example",
      displayName: "X",
      roleCode: "tenant_viewer",
    });
    expect(result.status).toBe(502);
    expect((await result.json()).error.code).toBe("BANK_USERS_READBACK_FAILED");
  });
  it("role/session revision and suspended membership invalidate a previously valid Bank caller", async () => {
    const f = await fixture("tenant_viewer");
    expect((await f.request()).status).toBe(200);
    await f.tenant.updateTenantUserRole(tenantId, f.admin.userId, {
      roleCode: "tenant_finance_admin",
      status: "suspended",
    });
    expect((await f.request()).status).toBe(401);
    expect((await f.login()).status).toBeGreaterThanOrEqual(400);
  });
  it("keeps callback/cookies on the Bank host and rejects a requested foreign tenant", async () => {
    const f = await fixture();
    expect(f.signedIn.headers.get("location")).toBe(`${bankOrigin}/users`);
    const sessionCookie = f.signedIn.headers
      .getSetCookie()
      .find((cookie) =>
        cookie.startsWith(`${constants.TENANT_SESSION_COOKIE_NAME}=`),
      )!;
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("Secure");
    expect(sessionCookie).not.toContain("Domain=");
    const result = await f.login("other-bank");
    expect(result.status).toBe(403);
    expect(
      result.cookies.get(constants.TENANT_SESSION_COOKIE_NAME),
    ).toBeUndefined();
  });
  it("logout-all revokes both sessions before the next account login", async () => {
    const f = await fixture();
    const second = await f.login();
    const token = second.cookies.get(
      constants.TENANT_SESSION_COOKIE_NAME,
    )!.value;
    const csrf = second.cookies.get(constants.TENANT_CSRF_COOKIE_NAME)!.value;
    expect(token).not.toBe(f.token);
    const result = await auth.POST(
      new NextRequest(`${bankOrigin}/api/auth/logout-all`, {
        method: "POST",
        headers: {
          cookie: `${constants.TENANT_SESSION_COOKIE_NAME}=${token}; ${constants.TENANT_CSRF_COOKIE_NAME}=${csrf}`,
          origin: bankOrigin,
          [constants.TENANT_CSRF_HEADER_NAME]: csrf,
        },
      }),
      context("logout-all"),
    );
    expect(result.status).toBe(200);
    expect(
      result.cookies.get(constants.TENANT_SESSION_COOKIE_NAME)?.value,
    ).toBe("");
    expect((await f.request()).status).toBe(401);
    expect((await f.request(undefined, { token })).status).toBe(401);
    const next = await f.login();
    expect(next.status).toBe(307);
    expect(
      (
        await f.request(undefined, {
          token: next.cookies.get(constants.TENANT_SESSION_COOKIE_NAME)!.value,
        })
      ).status,
    ).toBe(200);
  });
  it("changing canonical role while active invalidates the previous session and refreshes scopes on login", async () => {
    const f = await fixture("tenant_viewer");
    await f.tenant.updateTenantUserRole(tenantId, f.admin.userId, {
      roleCode: "tenant_finance_admin",
    });
    expect((await f.request()).status).toBe(401);
    const next = await f.login();
    const result = await f.request(undefined, {
      token: next.cookies.get(constants.TENANT_SESSION_COOKIE_NAME)!.value,
    });
    expect(result.status).toBe(200);
    expect((await result.json()).data.canManageUsers).toBe(false);
  });
  it("logout CSRF denial retains the valid session so account-switch cannot silently continue", async () => {
    const f = await fixture();
    const result = await auth.POST(
      new NextRequest(`${bankOrigin}/api/auth/logout`, {
        method: "POST",
        headers: {
          cookie: `${constants.TENANT_SESSION_COOKIE_NAME}=${f.token}; ${constants.TENANT_CSRF_COOKIE_NAME}=${f.csrf}`,
          origin: bankOrigin,
          [constants.TENANT_CSRF_HEADER_NAME]: "forged",
        },
      }),
      context("logout"),
    );
    expect(result.status).toBe(403);
    expect(
      result.cookies.get(constants.TENANT_SESSION_COOKIE_NAME),
    ).toBeUndefined();
    expect((await f.request()).status).toBe(200);
  });
  it("Bank host logout clears cookies and revokes the exact durable session", async () => {
    const f = await fixture();
    const result = await auth.POST(
      new NextRequest(`${bankOrigin}/api/auth/logout`, {
        method: "POST",
        headers: {
          cookie: `${constants.TENANT_SESSION_COOKIE_NAME}=${f.token}; ${constants.TENANT_CSRF_COOKIE_NAME}=${f.csrf}`,
          origin: bankOrigin,
          [constants.TENANT_CSRF_HEADER_NAME]: f.csrf,
        },
      }),
      context("logout"),
    );
    expect(result.status).toBe(200);
    expect(
      result.cookies.get(constants.TENANT_SESSION_COOKIE_NAME)?.value,
    ).toBe("");
    expect(result.cookies.get(constants.TENANT_CSRF_COOKIE_NAME)?.value).toBe(
      "",
    );
    expect((await f.request()).status).toBe(401);
  });
});
function deliveryTokenLeak(data: unknown) {
  return /accessToken|invitationToken|rawToken|tokenHash/.test(
    JSON.stringify(data),
  );
}
