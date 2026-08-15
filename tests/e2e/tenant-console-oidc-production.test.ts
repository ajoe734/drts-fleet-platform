import { createHash, createSign, generateKeyPairSync, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  GET as tenantAuthGet,
  POST as tenantAuthPost,
} from "../../apps/tenant-console-web/app/api/auth/[...auth]/route";
import {
  GET as proxyGet,
  POST as proxyPost,
} from "../../apps/tenant-console-web/app/control-plane-proxy/[...path]/route";
import {
  TENANT_SESSION_COOKIE_NAME,
  TENANT_OIDC_STATE_COOKIE_NAME,
  TENANT_CSRF_COOKIE_NAME,
  TENANT_CSRF_HEADER_NAME,
} from "../../apps/tenant-console-web/lib/auth/constants";
import {
  encodeStateEnvelope,
  generateCsrfToken,
} from "../../apps/tenant-console-web/lib/auth/session";

import { OidcPkceService } from "../../apps/api/src/modules/auth/oidc-pkce.service";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { AuthController } from "../../apps/api/src/modules/auth/auth.controller";
import { TenantPartnerController } from "../../apps/api/src/modules/tenant-partner/tenant-partner.controller";

// ── Mock OIDC Server Implementation ──────────────────────────────────────────
class DeterministicOidcServer {
  public readonly issuer = "https://auth.staging.drts.internal";
  public readonly clientId = "drts-tenant-console-client";
  public readonly clientSecret = "drts-tenant-console-secret-12345";
  public readonly keyId = "test-rsa-key-001";

  private privateKeyPem: string;
  public publicJwk: Record<string, unknown>;
  public issuedCodes = new Map<
    string,
    {
      codeChallenge: string;
      nonce: string;
      sub: string;
      email: string;
      emailVerified: boolean;
      amr: string[];
      tenantId?: string;
    }
  >();

  constructor() {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    this.privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const jwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
    jwk.kid = this.keyId;
    jwk.use = "sig";
    jwk.alg = "RS256";
    this.publicJwk = jwk;
  }

  public issueAuthorizationCode(params: {
    codeChallenge: string;
    nonce: string;
    sub: string;
    email: string;
    emailVerified?: boolean;
    amr?: string[];
    tenantId?: string;
  }): string {
    const code = `auth_code_${randomBytes(16).toString("hex")}`;
    this.issuedCodes.set(code, {
      codeChallenge: params.codeChallenge,
      nonce: params.nonce,
      sub: params.sub,
      email: params.email,
      emailVerified: params.emailVerified ?? true,
      amr: params.amr ?? ["pwd", "mfa"],
      tenantId: params.tenantId,
    });
    return code;
  }

  public handleTokenExchange(body: Record<string, string>): Response {
    const { code, code_verifier, client_id, client_secret, grant_type } = body;
    if (grant_type !== "authorization_code") {
      return new Response(JSON.stringify({ error: "unsupported_grant_type" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const session = this.issuedCodes.get(code);
    if (!session) {
      return new Response(JSON.stringify({ error: "invalid_grant", message: "Code expired or not found" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify S256 PKCE verifier
    const hash = createHash("sha256").update(code_verifier, "utf8").digest();
    const computedChallenge = hash
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    if (computedChallenge !== session.codeChallenge) {
      return new Response(JSON.stringify({ error: "invalid_grant", message: "PKCE verification failed" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const idTokenPayload = {
      sub: session.sub,
      iss: this.issuer,
      aud: this.clientId,
      email: session.email,
      email_verified: session.emailVerified,
      nonce: session.nonce,
      amr: session.amr,
      acr: "urn:mace:incommon:iap:silver",
      auth_time: now,
      iat: now,
      exp: now + 3600,
      ...(session.tenantId ? { tenant_id: session.tenantId } : {}),
    };

    const header = { alg: "RS256", typ: "JWT", kid: this.keyId };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
    const payloadB64 = Buffer.from(JSON.stringify(idTokenPayload)).toString("base64url");
    const data = `${headerB64}.${payloadB64}`;
    const sign = createSign("SHA256");
    sign.update(data);
    sign.end();
    const signatureB64 = sign.sign(this.privateKeyPem, "base64url");
    const idToken = `${data}.${signatureB64}`;

    return new Response(
      JSON.stringify({
        access_token: `idp_access_token_${randomBytes(16).toString("hex")}`,
        id_token: idToken,
        token_type: "Bearer",
        expires_in: 3600,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
}

describe("IAM-OP-AUTH-E2E-001: Production-Mode Hermetic Tenant Console OIDC & Acceptance Suite", () => {
  const originalEnv = { ...process.env };
  let oidcServer: DeterministicOidcServer;

  let auditService: AuditNotificationService;
  let identityRepository: IdentityRepository;
  let tenantPartnerService: TenantPartnerService;
  let jwtAuthService: JwtAuthService;
  let oidcService: OidcPkceService;
  let authController: AuthController;
  let tenantPartnerController: TenantPartnerController;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env.DRTS_ENV = "production";
    process.env.APP_ENV = "production";
    process.env.NODE_ENV = "production";
    process.env.OIDC_MOCK_MODE = "false";
    process.env.JWT_SECRET = "test_production_jwt_secret_key_32_characters_long!";
    process.env.BFF_STATE_SECRET = "test_production_bff_state_secret_32_characters_long!";
    process.env.DRTS_API_URL = "http://localhost:3001";
    process.env.AUTH_ALLOWED_ORIGINS = "https://tenant.drts.internal,https://tenant.staging.drts.internal";

    oidcServer = new DeterministicOidcServer();
    process.env.OIDC_ISSUER = oidcServer.issuer;
    process.env.OIDC_CLIENT_ID = oidcServer.clientId;
    process.env.OIDC_CLIENT_SECRET = oidcServer.clientSecret;
    process.env.OIDC_TOKEN_ENDPOINT = `${oidcServer.issuer}/oauth/v1/token`;
    process.env.OIDC_AUTHORIZATION_ENDPOINT = `${oidcServer.issuer}/oauth/v1/authorize`;
    process.env.OIDC_JWKS_JSON = JSON.stringify({ keys: [oidcServer.publicJwk] });

    auditService = new AuditNotificationService();
    identityRepository = new IdentityRepository();
    tenantPartnerService = new TenantPartnerService(auditService);
    jwtAuthService = new JwtAuthService(identityRepository, tenantPartnerService);
    oidcService = new OidcPkceService(jwtAuthService, tenantPartnerService);

    authController = new AuthController(
      jwtAuthService,
      tenantPartnerService,
      {} as never,
      undefined,
      undefined,
      undefined,
      identityRepository,
      oidcService,
    );

    tenantPartnerController = new TenantPartnerController(
      tenantPartnerService,
      {} as never,
      {} as never,
      jwtAuthService,
      identityRepository,
      auditService,
    );

    // Explicitly seed active tenant admin for strict production mode
    const tenantId = "tenant-demo-001";
    const adminUser = await tenantPartnerService.createTenantUser(
      tenantId,
      {
        email: "admin@acme.example",
        displayName: "Acme Tenant Admin",
        roleCode: "tenant_admin",
      },
      "req-seed-admin-001",
    );
    await tenantPartnerService.updateTenantUserRole(
      tenantId,
      adminUser.userId,
      { roleCode: "tenant_admin", status: "active" },
      "req-seed-admin-002",
    );
    tenantPartnerService.bindTenantUserSubject(
      tenantId,
      adminUser.userId,
      "sub_oidc_admin_acme",
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("proves end-to-end active tenant login, callback exchange, session read, proxy write, and logout in strict production mode", async () => {
    const tenantId = "tenant-demo-001";
    const activeAdmin = tenantPartnerService.findTenantUserBySubject("sub_oidc_admin_acme");
    expect(activeAdmin).toBeDefined();
    expect(activeAdmin?.status).toBe("active");
    expect(activeAdmin?.roleCode).toBe("tenant_admin");

    // Intercept fetch calls:
    // 1. API backend calls from BFF
    // 2. OIDC token endpoint calls from API
    // 3. API backend calls from proxy
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const urlStr = input.toString();
      const getHeader = (name: string): string | undefined => {
        const headers = init?.headers;
        if (!headers) return undefined;
        if (typeof (headers as any).get === "function") {
          return (headers as any).get(name) || (headers as any).get(name.toLowerCase()) || undefined;
        }
        const target = name.toLowerCase();
        for (const [key, val] of Object.entries(headers)) {
          if (key.toLowerCase() === target) {
            return val as string;
          }
        }
        return undefined;
      };

      // OIDC token endpoint
      if (urlStr.includes("/oauth/v1/token")) {
        let bodyObj: Record<string, string> = {};
        if (typeof init?.body === "string") {
          try {
            bodyObj = JSON.parse(init.body);
          } catch {
            const params = new URLSearchParams(init.body);
            bodyObj = Object.fromEntries(params.entries());
          }
        }
        return oidcServer.handleTokenExchange(bodyObj);
      }

      // API: GET /api/auth/tenant/login
      if (urlStr.includes("/api/auth/tenant/login")) {
        const url = new URL(urlStr);
        const redirectUri = url.searchParams.get("redirect_uri") || "";
        const requestedTenantId = url.searchParams.get("tenant_id") || tenantId;
        try {
          const res = authController.getOidcLoginUrl(
            "tenant",
            redirectUri,
            requestedTenantId,
            undefined,
            "req-e2e-login-001",
          );
          return new Response(JSON.stringify(res), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          return new Response(JSON.stringify(err?.getResponse?.() || { error: err?.message }), {
            status: err?.getStatus?.() || 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      // API: POST /api/auth/tenant/callback-session
      if (urlStr.includes("/api/auth/tenant/callback-session")) {
        const bodyObj = init?.body ? JSON.parse(init.body as string) : {};
        const stateToken = getHeader("x-oidc-state-token");
        try {
          const res = await authController.exchangeTenantCallbackSession(
            bodyObj,
            undefined,
            undefined,
            undefined,
            "req-e2e-callback-001",
            stateToken,
          );
          return new Response(JSON.stringify(res), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          return new Response(JSON.stringify(err?.getResponse?.() || { error: err?.message }), {
            status: err?.getStatus?.() || 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      // API: GET /api/auth/session
      if (urlStr.includes("/api/auth/session")) {
        const authHeader = getHeader("authorization");
        const token = authHeader?.replace("Bearer ", "");
        const payload = token ? await jwtAuthService.verifyAccessToken(token) : null;
        if (!payload) {
          return new Response(JSON.stringify({ error: "AUTHENTICATION_REQUIRED" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const identity = jwtAuthService.toRequestIdentity(payload);
        const res = authController.getAuthSession(identity, "req-e2e-session-001");
        return new Response(JSON.stringify(res), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // API: POST /api/auth/logout
      if (urlStr.includes("/api/auth/logout")) {
        const authHeader = getHeader("authorization");
        const token = authHeader?.replace("Bearer ", "");
        const payload = token ? await jwtAuthService.verifyAccessToken(token) : null;
        if (!payload) {
          return new Response(JSON.stringify({ error: "AUTHENTICATION_REQUIRED" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const identity = jwtAuthService.toRequestIdentity(payload);
        const res = await authController.logout(
          identity,
          { reason: "self_logout" },
          { headers: init?.headers as any } as any,
          "req-e2e-logout-001",
        );
        return new Response(JSON.stringify(res), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // API: GET /api/tenant/cost-centers
      if (urlStr.includes("/api/tenant/cost-centers") && init?.method === "GET") {
        const authHeader = getHeader("authorization");
        const token = authHeader?.replace("Bearer ", "");
        const payload = token ? await jwtAuthService.verifyAccessToken(token) : null;
        if (!payload) {
          return new Response(JSON.stringify({ error: "JWT_INVALID" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const res = tenantPartnerController.listCostCenters(
          undefined,
          undefined,
          undefined,
          payload.tenantId ?? tenantId,
          "req-e2e-cc-list-001",
        );
        return new Response(JSON.stringify(res), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // API: POST /api/tenant/cost-centers
      if (urlStr.includes("/api/tenant/cost-centers") && init?.method === "POST") {
        const authHeader = getHeader("authorization");
        const token = authHeader?.replace("Bearer ", "");
        const payload = token ? await jwtAuthService.verifyAccessToken(token) : null;
        if (!payload) {
          return new Response(JSON.stringify({ error: "JWT_INVALID" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        let bodyObj: any = {};
        if (typeof init?.body === "string") {
          bodyObj = JSON.parse(init.body);
        } else if (init?.body instanceof ArrayBuffer || init?.body instanceof Uint8Array) {
          bodyObj = JSON.parse(new TextDecoder().decode(init.body as ArrayBuffer));
        }
        const res = tenantPartnerController.upsertCostCenter(
          bodyObj,
          payload.tenantId ?? tenantId,
          "req-e2e-cc-create-001",
        );
        return new Response(JSON.stringify(res), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 });
    });

    // ── STEP 1: BFF Login Initiation ──────────────────────────────────────────
    const loginReq = new NextRequest(
      "https://tenant.drts.internal/api/auth/tenant/login?redirect_uri=/bookings",
    );
    const loginRes = await tenantAuthGet(loginReq, {
      params: Promise.resolve({ auth: ["tenant", "login"] }),
    });

    expect(loginRes.status).toBe(307);
    const authRedirectUrl = loginRes.headers.get("location");
    expect(authRedirectUrl).toBeDefined();
    expect(authRedirectUrl).toContain(oidcServer.issuer);
    expect(authRedirectUrl).toContain("response_type=code");
    expect(authRedirectUrl).toContain("code_challenge_method=S256");

    const stateCookie = loginRes.cookies.get(TENANT_OIDC_STATE_COOKIE_NAME);
    expect(stateCookie).toBeDefined();
    expect(stateCookie?.httpOnly).toBe(true);
    expect(stateCookie?.value).toBeDefined();

    // Extract state and code_challenge from authorization URL
    const parsedAuthUrl = new URL(authRedirectUrl!);
    const authState = parsedAuthUrl.searchParams.get("state")!;
    const codeChallenge = parsedAuthUrl.searchParams.get("code_challenge")!;
    const authNonce = parsedAuthUrl.searchParams.get("nonce")!;
    expect(authState).toBeDefined();
    expect(codeChallenge).toBeDefined();

    // ── STEP 2: IdP Issues Authorization Code ─────────────────────────────────
    const authCode = oidcServer.issueAuthorizationCode({
      codeChallenge,
      nonce: authNonce,
      sub: "sub_oidc_admin_acme",
      email: "admin@acme.example",
      tenantId,
    });

    // ── STEP 3: BFF Callback Session Exchange ─────────────────────────────────
    const callbackReq = new NextRequest(
      `https://tenant.drts.internal/api/auth/tenant/callback?code=${authCode}&state=${authState}`,
      {
        headers: {
          cookie: `${TENANT_OIDC_STATE_COOKIE_NAME}=${stateCookie!.value}`,
        },
      },
    );

    const callbackRes = await tenantAuthGet(callbackReq, {
      params: Promise.resolve({ auth: ["tenant", "callback"] }),
    });

    expect(callbackRes.status).toBe(307);
    expect(callbackRes.headers.get("location")).toBe("https://tenant.drts.internal/bookings");

    const sessionCookie = callbackRes.cookies.get(TENANT_SESSION_COOKIE_NAME);
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.value).toBeDefined();

    const csrfCookie = callbackRes.cookies.get(TENANT_CSRF_COOKIE_NAME);
    expect(csrfCookie).toBeDefined();
    expect(csrfCookie?.value).toBeDefined();

    // Verify state cookie is cleared
    const clearedStateCookie = callbackRes.cookies.get(TENANT_OIDC_STATE_COOKIE_NAME);
    expect(clearedStateCookie?.value === "" || clearedStateCookie?.maxAge === 0).toBe(true);

    const activeSessionToken = sessionCookie!.value;
    const activeCsrfToken = csrfCookie!.value;

    // ── STEP 4: BFF Session Read ──────────────────────────────────────────────
    const sessionReq = new NextRequest("https://tenant.drts.internal/api/auth/session", {
      headers: {
        cookie: `${TENANT_SESSION_COOKIE_NAME}=${activeSessionToken}`,
      },
    });
    const sessionRes = await tenantAuthGet(sessionReq, {
      params: Promise.resolve({ auth: ["session"] }),
    });

    expect(sessionRes.status).toBe(200);
    const sessionData = await sessionRes.json();
    expect(sessionData.data.active).toBe(true);
    expect(sessionData.data.identity.realm).toBe("tenant");
    expect(sessionData.data.identity.tenantId).toBe(tenantId);
    expect(sessionData.data.identity.roles).toContain("tenant_admin");

    // ── STEP 5: Authorized Read via Control Plane Proxy ────────────────────────
    const proxyReadReq = new NextRequest(
      "https://tenant.drts.internal/control-plane-proxy/tenant/cost-centers",
      {
        headers: {
          cookie: `${TENANT_SESSION_COOKIE_NAME}=${activeSessionToken}`,
          // Untrusted headers should be stripped by proxy
          "x-actor-id": "malicious-injected-actor",
          "x-realm": "platform",
        },
      },
    );
    const proxyReadRes = await proxyGet(proxyReadReq, {
      params: Promise.resolve({ path: ["tenant", "cost-centers"] }),
    });

    expect(proxyReadRes.status).toBe(200);
    const proxyReadData = await proxyReadRes.json();
    expect(proxyReadData.data).toBeDefined();

    // ── STEP 6: Authorized Write via Control Plane Proxy with CSRF ─────────────
    const newCostCenterPayload = JSON.stringify({
      code: "CC-E2E-001",
      name: "E2E Test Cost Center",
      department: "Engineering",
      monthlyBudget: 50000,
    });
    const proxyWriteReq = new NextRequest(
      "https://tenant.drts.internal/control-plane-proxy/tenant/cost-centers",
      {
        method: "POST",
        headers: {
          cookie: `${TENANT_SESSION_COOKIE_NAME}=${activeSessionToken}; ${TENANT_CSRF_COOKIE_NAME}=${activeCsrfToken}`,
          [TENANT_CSRF_HEADER_NAME]: activeCsrfToken,
          origin: "https://tenant.drts.internal",
          "Content-Type": "application/json",
        },
        body: newCostCenterPayload,
      },
    );
    const proxyWriteRes = await proxyPost(proxyWriteReq, {
      params: Promise.resolve({ path: ["tenant", "cost-centers"] }),
    });

    expect(proxyWriteRes.status).toBe(200);
    const proxyWriteData = await proxyWriteRes.json();
    expect(proxyWriteData.data.code).toBe("CC-E2E-001");

    // ── STEP 7: Logout via BFF ────────────────────────────────────────────────
    const logoutReq = new NextRequest("https://tenant.drts.internal/api/auth/logout", {
      method: "POST",
      headers: {
        cookie: `${TENANT_SESSION_COOKIE_NAME}=${activeSessionToken}; ${TENANT_CSRF_COOKIE_NAME}=${activeCsrfToken}`,
        [TENANT_CSRF_HEADER_NAME]: activeCsrfToken,
        origin: "https://tenant.drts.internal",
        "Content-Type": "application/json",
      },
    });
    const logoutRes = await tenantAuthPost(logoutReq, {
      params: Promise.resolve({ auth: ["logout"] }),
    });

    expect(logoutRes.status).toBe(200);
    const logoutData = await logoutRes.json();
    expect(logoutData.success).toBe(true);

    const expiredSessionCookie = logoutRes.cookies.get(TENANT_SESSION_COOKIE_NAME);
    expect(expiredSessionCookie?.value === "" || expiredSessionCookie?.maxAge === 0).toBe(true);

    // ── STEP 8: Post-Logout Invalidation Verification ─────────────────────────
    const postLogoutSessionReq = new NextRequest("https://tenant.drts.internal/api/auth/session", {
      headers: {
        cookie: `${TENANT_SESSION_COOKIE_NAME}=${activeSessionToken}`,
      },
    });
    const postLogoutSessionRes = await tenantAuthGet(postLogoutSessionReq, {
      params: Promise.resolve({ auth: ["session"] }),
    });
    expect(postLogoutSessionRes.status).toBe(401);

    const postLogoutProxyReq = new NextRequest(
      "https://tenant.drts.internal/control-plane-proxy/tenant/cost-centers",
      {
        headers: {
          cookie: `${TENANT_SESSION_COOKIE_NAME}=${activeSessionToken}`,
        },
      },
    );
    const postLogoutProxyRes = await proxyGet(postLogoutProxyReq, {
      params: Promise.resolve({ path: ["tenant", "cost-centers"] }),
    });
    expect(postLogoutProxyRes.status).toBe(401);
  });

  it("executes logout-all and invalidates all active sessions for the principal", async () => {
    const tenantId = "tenant-demo-001";

    // Create session directly via issueSessionToken
    const session1 = await jwtAuthService.issueSessionToken({
      authMode: "jwt_bearer",
      actorType: "tenant_admin",
      actorId: "usr-tenant-admin-acme-001",
      principalId: "usr-tenant-admin-acme-001",
      realm: "tenant",
      tenantId,
      roleFamilies: ["tenant"],
      roles: ["tenant_admin"],
      scopes: ["billing:read", "billing:write", "driver:read"],
      tokenVersion: Date.parse("2026-04-01T00:00:00Z"),
      authTime: new Date().toISOString(),
      amr: ["pwd", "mfa"],
      acr: "urn:mace:incommon:iap:silver",
      policyVersion: "v1",
    });

    const session2 = await jwtAuthService.issueSessionToken({
      authMode: "jwt_bearer",
      actorType: "tenant_admin",
      actorId: "usr-tenant-admin-acme-001",
      principalId: "usr-tenant-admin-acme-001",
      realm: "tenant",
      tenantId,
      roleFamilies: ["tenant"],
      roles: ["tenant_admin"],
      scopes: ["billing:read", "billing:write", "driver:read"],
      tokenVersion: Date.parse("2026-04-01T00:00:00Z"),
      authTime: new Date().toISOString(),
      amr: ["pwd", "mfa"],
      acr: "urn:mace:incommon:iap:silver",
      policyVersion: "v1",
    });

    // Both sessions are initially valid
    expect(await jwtAuthService.verifyAccessToken(session1.token)).toBeDefined();
    expect(await jwtAuthService.verifyAccessToken(session2.token)).toBeDefined();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const urlStr = input.toString();
      if (urlStr.includes("/api/auth/logout-all")) {
        const authHeader = (init?.headers as any)?.["Authorization"] || (init?.headers as any)?.["authorization"];
        const token = authHeader?.replace("Bearer ", "");
        const payload = token ? await jwtAuthService.verifyAccessToken(token) : null;
        if (!payload) {
          return new Response(JSON.stringify({ error: "AUTHENTICATION_REQUIRED" }), { status: 401 });
        }
        const identity = jwtAuthService.toRequestIdentity(payload);
        const res = await authController.logoutAll(
          identity,
          { reason: "self_logout_all" },
          { headers: init?.headers as any } as any,
          "req-e2e-logout-all-001",
        );
        return new Response(JSON.stringify(res), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    });

    const csrfToken = generateCsrfToken();
    const logoutAllReq = new NextRequest("https://tenant.drts.internal/api/auth/logout-all", {
      method: "POST",
      headers: {
        cookie: `${TENANT_SESSION_COOKIE_NAME}=${session1.token}; ${TENANT_CSRF_COOKIE_NAME}=${csrfToken}`,
        [TENANT_CSRF_HEADER_NAME]: csrfToken,
        origin: "https://tenant.drts.internal",
      },
    });

    const logoutAllRes = await tenantAuthPost(logoutAllReq, {
      params: Promise.resolve({ auth: ["logout-all"] }),
    });

    expect(logoutAllRes.status).toBe(200);

    // Both session 1 and session 2 must now be invalidated
    expect(await jwtAuthService.verifyAccessToken(session1.token)).toBeNull();
    expect(await jwtAuthService.verifyAccessToken(session2.token)).toBeNull();
  });
});
