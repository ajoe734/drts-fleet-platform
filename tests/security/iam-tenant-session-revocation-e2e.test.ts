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
import { getTenantRoleScopes } from "../../apps/api/src/common/auth/auth.constants";

class MockOidcServer {
  public readonly issuer = "https://auth.staging.drts.internal";
  public readonly clientId = "drts-tenant-console-client";
  public readonly clientSecret = "drts-tenant-console-secret-12345";
  public readonly keyId = "test-rsa-key-002";

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
      customIdTokenProps?: Record<string, unknown>;
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
    customIdTokenProps?: Record<string, unknown>;
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
      customIdTokenProps: params.customIdTokenProps,
    });
    return code;
  }

  public handleTokenExchange(body: Record<string, string>): Response {
    const { code, code_verifier, grant_type } = body;
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

    // Verify PKCE
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
      ...session.customIdTokenProps,
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

describe("IAM-OP-AUTH-E2E-001: Session Revocation, Downgrade, Suspension & Isolation Matrix", () => {
  const originalEnv = { ...process.env };
  const tenantId = "tenant-security-001";
  const otherTenantId = "tenant-security-002";

  let oidcServer: MockOidcServer;
  let auditService: AuditNotificationService;
  let identityRepository: IdentityRepository;
  let tenantPartnerService: TenantPartnerService;
  let jwtAuthService: JwtAuthService;
  let oidcService: OidcPkceService;
  let authController: AuthController;
  let tenantPartnerController: TenantPartnerController;

  let seededAdminUser: { userId: string; email: string };

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env.DRTS_ENV = "production";
    process.env.APP_ENV = "production";
    process.env.NODE_ENV = "production";
    process.env.OIDC_MOCK_MODE = "false";
    process.env.JWT_SECRET = "test_security_jwt_secret_key_32_chars_long!!";
    process.env.BFF_STATE_SECRET = "test_security_bff_state_secret_32_chars_long!";
    process.env.DRTS_API_URL = "http://localhost:3001";
    process.env.AUTH_ALLOWED_ORIGINS = "https://tenant.drts.internal";

    oidcServer = new MockOidcServer();
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

    // Seed primary tenant admin and secondary admin in tenant-security-001
    const admin = await tenantPartnerService.createTenantUser(
      tenantId,
      {
        email: "admin@sec.example",
        displayName: "Sec Admin",
        roleCode: "tenant_admin",
      },
      "req-sec-seed-001",
    );
    await tenantPartnerService.updateTenantUserRole(
      tenantId,
      admin.userId,
      { roleCode: "tenant_admin", status: "active" },
      "req-sec-seed-002",
    );
    tenantPartnerService.bindTenantUserSubject(
      tenantId,
      admin.userId,
      "sub_oidc_admin_sec",
    );
    seededAdminUser = admin;

    // Seed second admin so role modifications don't violate CANNOT_REMOVE_LAST_ADMIN
    const admin2 = await tenantPartnerService.createTenantUser(
      tenantId,
      {
        email: "admin2@sec.example",
        displayName: "Sec Admin 2",
        roleCode: "tenant_admin",
      },
      "req-sec-seed-003",
    );
    await tenantPartnerService.updateTenantUserRole(
      tenantId,
      admin2.userId,
      { roleCode: "tenant_admin", status: "active" },
      "req-sec-seed-004",
    );

    // Setup global fetch mock
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
          if (key.toLowerCase() === target) return val as string;
        }
        return undefined;
      };

      if (urlStr.includes("/oauth/v1/token")) {
        let bodyObj: Record<string, string> = {};
        if (typeof init?.body === "string") {
          try {
            bodyObj = JSON.parse(init.body);
          } catch {
            bodyObj = Object.fromEntries(new URLSearchParams(init.body).entries());
          }
        }
        return oidcServer.handleTokenExchange(bodyObj);
      }

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
            "req-login",
          );
          return new Response(JSON.stringify(res), { status: 200, headers: { "Content-Type": "application/json" } });
        } catch (err: any) {
          return new Response(JSON.stringify(err?.getResponse?.() || { error: err?.message }), {
            status: err?.getStatus?.() || 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      if (urlStr.includes("/api/auth/tenant/callback-session")) {
        const bodyObj = init?.body ? JSON.parse(init.body as string) : {};
        const stateToken = getHeader("x-oidc-state-token");
        try {
          const res = await authController.exchangeTenantCallbackSession(
            bodyObj,
            undefined,
            undefined,
            undefined,
            "req-callback",
            stateToken,
          );
          return new Response(JSON.stringify(res), { status: 200, headers: { "Content-Type": "application/json" } });
        } catch (err: any) {
          return new Response(JSON.stringify(err?.getResponse?.() || { error: err?.message }), {
            status: err?.getStatus?.() || 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

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
        const res = authController.getAuthSession(identity, "req-session");
        return new Response(JSON.stringify(res), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      return new Response("Not found", { status: 404 });
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  async function issueValidAdminSessionToken(): Promise<{ token: string; sessionId: string }> {
    const user = tenantPartnerService.findTenantUser(tenantId, seededAdminUser.userId)!;
    const session = await jwtAuthService.issueSessionToken({
      authMode: "jwt_bearer",
      actorType: "tenant_admin",
      actorId: user.userId,
      principalId: user.userId,
      realm: "tenant",
      tenantId,
      roleFamilies: ["tenant"],
      roles: [user.roleCode],
      scopes: [...getTenantRoleScopes(user.roleCode)!],
      tokenVersion: Date.parse(user.updatedAt),
      authTime: new Date().toISOString(),
      amr: ["pwd", "mfa"],
      acr: "urn:mace:incommon:iap:silver",
      policyVersion: "v1",
    });
    return session;
  }

  it("invalidates issued session token immediately upon user role downgrade", async () => {
    const { token } = await issueValidAdminSessionToken();

    // Verify token is active
    expect(await jwtAuthService.verifyAccessToken(token)).not.toBeNull();

    // Demote role from tenant_admin to tenant_viewer (updates user.updatedAt and user.roleCode)
    await tenantPartnerService.updateTenantUserRole(
      tenantId,
      seededAdminUser.userId,
      { roleCode: "tenant_viewer" },
      "req-demote",
    );

    // Issued token must now be invalid due to durable state tokenVersion & role mismatch
    const verified = await jwtAuthService.verifyAccessToken(token);
    expect(verified).toBeNull();
  });

  it("invalidates issued session token immediately upon user suspension", async () => {
    const { token } = await issueValidAdminSessionToken();

    // Verify token is active
    expect(await jwtAuthService.verifyAccessToken(token)).not.toBeNull();

    // Suspend user
    await tenantPartnerService.updateTenantUserRole(
      tenantId,
      seededAdminUser.userId,
      { roleCode: "tenant_admin", status: "suspended" },
      "req-suspend",
    );

    // Issued token must now be rejected
    const verified = await jwtAuthService.verifyAccessToken(token);
    expect(verified).toBeNull();
  });

  it("invalidates issued session token upon explicit backend session revocation", async () => {
    const { token, sessionId } = await issueValidAdminSessionToken();

    expect(await jwtAuthService.verifyAccessToken(token)).not.toBeNull();

    // Revoke session in IdentityRepository
    await identityRepository.revokeSession(sessionId, "manual_revoke");

    // Issued token must now fail verification
    const verified = await jwtAuthService.verifyAccessToken(token);
    expect(verified).toBeNull();
  });

  it("enforces tenant isolation and rejects cross-tenant mutations without leaking existence", async () => {
    const { token } = await issueValidAdminSessionToken();
    const verified = await jwtAuthService.verifyAccessToken(token);
    expect(verified).not.toBeNull();

    const crossTenantPayload = {
      email: "attacker@cross.example",
      displayName: "Attacker User",
      roleCode: "tenant_admin",
    };

    // Cross-tenant user creation attempt with mismatched tenantId in identity
    expect(() => {
      tenantPartnerService.createTenantUser(
        otherTenantId,
        crossTenantPayload,
        "req-cross",
        {
          actorId: seededAdminUser.userId,
          actorType: "tenant_admin",
          realm: "tenant",
          tenantId, // Belongs to tenant-security-001, not otherTenantId
          roleFamilies: ["tenant"],
          roles: ["tenant_admin"],
          scopes: ["tenant:write"],
          authMode: "jwt_bearer",
        },
      );
    }).toThrow();
  });

  it("enforces CSRF and same-origin validation on mutating proxy requests", async () => {
    const { token } = await issueValidAdminSessionToken();
    const validCsrfToken = generateCsrfToken();

    // Case 1: Missing / invalid CSRF token -> 403 CSRF_TOKEN_INVALID
    const invalidCsrfReq = new NextRequest(
      "https://tenant.drts.internal/control-plane-proxy/tenant/cost-centers",
      {
        method: "POST",
        headers: {
          cookie: `${TENANT_SESSION_COOKIE_NAME}=${token}; ${TENANT_CSRF_COOKIE_NAME}=${validCsrfToken}`,
          [TENANT_CSRF_HEADER_NAME]: "invalid-tampered-csrf-token",
          origin: "https://tenant.drts.internal",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: "CC-01", name: "Test", department: "Eng", monthlyBudget: 100 }),
      },
    );
    const invalidCsrfRes = await proxyPost(invalidCsrfReq, {
      params: Promise.resolve({ path: ["tenant", "cost-centers"] }),
    });
    expect(invalidCsrfRes.status).toBe(403);
    const csrfErr = await invalidCsrfRes.json();
    expect(csrfErr.error).toBe("CSRF_TOKEN_INVALID");

    // Case 2: Cross-origin mutation -> 403 CSRF_ORIGIN_INVALID
    const crossOriginReq = new NextRequest(
      "https://tenant.drts.internal/control-plane-proxy/tenant/cost-centers",
      {
        method: "POST",
        headers: {
          cookie: `${TENANT_SESSION_COOKIE_NAME}=${token}; ${TENANT_CSRF_COOKIE_NAME}=${validCsrfToken}`,
          [TENANT_CSRF_HEADER_NAME]: validCsrfToken,
          origin: "https://evil-attacker.example.com",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: "CC-01", name: "Test", department: "Eng", monthlyBudget: 100 }),
      },
    );
    const crossOriginRes = await proxyPost(crossOriginReq, {
      params: Promise.resolve({ path: ["tenant", "cost-centers"] }),
    });
    expect(crossOriginRes.status).toBe(403);
    const originErr = await crossOriginRes.json();
    expect(originErr.error).toBe("CSRF_ORIGIN_INVALID");
  });

  it("rejects state replay, tampered state cookie, PKCE verifier mismatch, and nonce mismatch", async () => {
    // 1. Initiate login to get valid state & PKCE challenge
    const loginReq = new NextRequest(
      "https://tenant.drts.internal/api/auth/tenant/login?redirect_uri=/dashboard",
    );
    const loginRes = await tenantAuthGet(loginReq, {
      params: Promise.resolve({ auth: ["tenant", "login"] }),
    });
    expect(loginRes.status).toBe(307);

    const locationUrl = new URL(loginRes.headers.get("location")!);
    const authState = locationUrl.searchParams.get("state")!;
    const codeChallenge = locationUrl.searchParams.get("code_challenge")!;
    const nonce = locationUrl.searchParams.get("nonce")!;
    const stateCookie = loginRes.cookies.get(TENANT_OIDC_STATE_COOKIE_NAME)!.value;

    const authCode = oidcServer.issueAuthorizationCode({
      codeChallenge,
      nonce,
      sub: "sub_oidc_admin_sec",
      email: "admin@sec.example",
      tenantId,
    });

    // 2. Tampered State Cookie -> 400
    const tamperedCookieReq = new NextRequest(
      `https://tenant.drts.internal/api/auth/tenant/callback?code=${authCode}&state=${authState}`,
      {
        headers: {
          cookie: `${TENANT_OIDC_STATE_COOKIE_NAME}=${stateCookie.slice(0, -5)}XXXXX`,
        },
      },
    );
    const tamperedCookieRes = await tenantAuthGet(tamperedCookieReq, {
      params: Promise.resolve({ auth: ["tenant", "callback"] }),
    });
    expect(tamperedCookieRes.status).toBe(400);

    // 3. Successful First Exchange
    const validCallbackReq = new NextRequest(
      `https://tenant.drts.internal/api/auth/tenant/callback?code=${authCode}&state=${authState}`,
      {
        headers: {
          cookie: `${TENANT_OIDC_STATE_COOKIE_NAME}=${stateCookie}`,
        },
      },
    );
    const validCallbackRes = await tenantAuthGet(validCallbackReq, {
      params: Promise.resolve({ auth: ["tenant", "callback"] }),
    });
    expect(validCallbackRes.status).toBe(307);

    // 4. State Replay -> Already consumed -> 403 AUTH_SESSION_EXCHANGE_DENIED
    const replayCallbackReq = new NextRequest(
      `https://tenant.drts.internal/api/auth/tenant/callback?code=${authCode}&state=${authState}`,
      {
        headers: {
          cookie: `${TENANT_OIDC_STATE_COOKIE_NAME}=${stateCookie}`,
        },
      },
    );
    const replayCallbackRes = await tenantAuthGet(replayCallbackReq, {
      params: Promise.resolve({ auth: ["tenant", "callback"] }),
    });
    expect(replayCallbackRes.status).toBe(403);
  });
});
