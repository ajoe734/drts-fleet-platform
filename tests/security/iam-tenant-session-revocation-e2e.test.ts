import {
  createHash,
  createSign,
  generateKeyPairSync,
  randomBytes,
} from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET as tenantAuthGet } from "../../apps/tenant-console-web/app/api/auth/[...auth]/route";
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
  generateCsrfToken,
  encodeStateEnvelope,
  decodeStateEnvelope,
} from "../../apps/tenant-console-web/lib/auth/session";

import { OidcPkceService } from "../../apps/api/src/modules/auth/oidc-pkce.service";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { TenantPartnerController } from "../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { AuthController } from "../../apps/api/src/modules/auth/auth.controller";
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
      tenantId?: string | undefined;
      customIdTokenProps?: Record<string, unknown> | undefined;
    }
  >();

  constructor() {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    this.privateKeyPem = privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString();
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
    tenantId?: string | undefined;
    customIdTokenProps?: Record<string, unknown> | undefined;
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
    const code = body["code"] || "";
    const code_verifier = body["code_verifier"] || "";
    const grant_type = body["grant_type"];
    if (grant_type !== "authorization_code") {
      return new Response(JSON.stringify({ error: "unsupported_grant_type" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!code || !code_verifier) {
      return new Response(
        JSON.stringify({
          error: "invalid_request",
          message: "Missing code or verifier",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const session = this.issuedCodes.get(code);
    if (!session) {
      return new Response(
        JSON.stringify({
          error: "invalid_grant",
          message: "Code expired or not found",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Verify PKCE
    const hash = createHash("sha256").update(code_verifier, "utf8").digest();
    const computedChallenge = hash
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    if (computedChallenge !== session.codeChallenge) {
      return new Response(
        JSON.stringify({
          error: "invalid_grant",
          message: "PKCE verification failed",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const idTokenPayload: Record<string, unknown> = {
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
    if (
      session.customIdTokenProps &&
      "omitNonce" in session.customIdTokenProps
    ) {
      delete idTokenPayload["nonce"];
      delete idTokenPayload["omitNonce"];
    }

    const header = { alg: "RS256", typ: "JWT", kid: this.keyId };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
    const payloadB64 = Buffer.from(JSON.stringify(idTokenPayload)).toString(
      "base64url",
    );
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
  let tenantPartnerController: TenantPartnerController;
  let jwtAuthService: JwtAuthService;
  let oidcService: OidcPkceService;
  let authController: AuthController;

  let seededAdminUser: { userId: string; email: string };
  let seededOtherAdminUser: { userId: string; email: string };

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env.DRTS_ENV = "production";
    process.env.APP_ENV = "production";
    process.env.NODE_ENV = "production";
    process.env.OIDC_MOCK_MODE = "false";
    process.env.JWT_SECRET = "test_security_jwt_secret_key_32_chars_long!!";
    process.env.BFF_STATE_SECRET =
      "test_security_bff_state_secret_32_chars_long!";
    process.env.DRTS_API_URL = "http://localhost:3001";
    process.env.AUTH_ALLOWED_ORIGINS = "https://tenant.drts.internal";

    oidcServer = new MockOidcServer();
    process.env.OIDC_ISSUER = oidcServer.issuer;
    process.env.OIDC_CLIENT_ID = oidcServer.clientId;
    process.env.OIDC_CLIENT_SECRET = oidcServer.clientSecret;
    process.env.OIDC_TOKEN_ENDPOINT = `${oidcServer.issuer}/oauth/v1/token`;
    process.env.OIDC_AUTHORIZATION_ENDPOINT = `${oidcServer.issuer}/oauth/v1/authorize`;
    process.env.OIDC_JWKS_JSON = JSON.stringify({
      keys: [oidcServer.publicJwk],
    });

    auditService = new AuditNotificationService();
    identityRepository = new IdentityRepository();
    tenantPartnerService = new TenantPartnerService(auditService);
    jwtAuthService = new JwtAuthService(
      identityRepository,
      tenantPartnerService,
    );
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
      {} as never,
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

    // Seed cost center for primary tenant
    tenantPartnerController.upsertCostCenter(
      {
        code: "CC-SEC-001",
        name: "Security Cost Center 1",
        description: "Security Cost Center",
      },
      tenantId,
      "req-seed-cc-001",
    );

    // Seed admin and cost center in otherTenantId (tenant-security-002) for cross-tenant boundary verification
    const otherAdmin = await tenantPartnerService.createTenantUser(
      otherTenantId,
      {
        email: "admin@othersec.example",
        displayName: "Other Sec Admin",
        roleCode: "tenant_admin",
      },
      "req-sec-other-seed-001",
    );
    await tenantPartnerService.updateTenantUserRole(
      otherTenantId,
      otherAdmin.userId,
      { roleCode: "tenant_admin", status: "active" },
      "req-sec-other-seed-002",
    );
    tenantPartnerService.bindTenantUserSubject(
      otherTenantId,
      otherAdmin.userId,
      "sub_oidc_other_admin_sec",
    );
    seededOtherAdminUser = otherAdmin;

    tenantPartnerController.upsertCostCenter(
      {
        code: "CC-SEC-OTHER-001",
        name: "Other Tenant Cost Center",
        description: "Other Tenant Cost Center",
      },
      otherTenantId,
      "req-seed-other-cc-001",
    );

    // Setup global fetch mock
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const urlStr = input.toString();
      const getHeader = (name: string): string | undefined => {
        const headers = init?.headers;
        if (!headers) return undefined;
        if (typeof (headers as any).get === "function") {
          return (
            (headers as any).get(name) ||
            (headers as any).get(name.toLowerCase()) ||
            undefined
          );
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
            bodyObj = Object.fromEntries(
              new URLSearchParams(init.body).entries(),
            );
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
          return new Response(JSON.stringify(res), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          return new Response(
            JSON.stringify(err?.getResponse?.() || { error: err?.message }),
            {
              status: err?.getStatus?.() || 400,
              headers: { "Content-Type": "application/json" },
            },
          );
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
          return new Response(JSON.stringify(res), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          return new Response(
            JSON.stringify(err?.getResponse?.() || { error: err?.message }),
            {
              status: err?.getStatus?.() || 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      }

      if (urlStr.includes("/api/auth/session")) {
        const authHeader = getHeader("authorization");
        const token = authHeader?.replace("Bearer ", "");
        const payload = token
          ? await jwtAuthService.verifyAccessToken(token)
          : null;
        if (!payload) {
          return new Response(
            JSON.stringify({ error: "AUTHENTICATION_REQUIRED" }),
            {
              status: 401,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        const identity = jwtAuthService.toRequestIdentity(payload);
        const res = authController.getAuthSession(identity, "req-session");
        return new Response(JSON.stringify(res), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (urlStr.includes("/api/tenant/cost-centers")) {
        const authHeader = getHeader("authorization");
        const token = authHeader?.replace("Bearer ", "");
        const payload = token
          ? await jwtAuthService.verifyAccessToken(token)
          : null;
        if (!payload) {
          return new Response(
            JSON.stringify({
              error: "AUTHENTICATION_REQUIRED",
              message: "Invalid or expired session",
            }),
            {
              status: 401,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        const effectiveTenantId = payload.tenantId ?? tenantId;
        const url = new URL(urlStr);
        const pathSegments = url.pathname.split("/").filter(Boolean); // ["api", "tenant", "cost-centers", ":code"?]
        const costCenterCode = pathSegments[3];

        if (init?.method === "GET") {
          if (costCenterCode) {
            const listRes = tenantPartnerController.listCostCenters(
              undefined,
              undefined,
              undefined,
              effectiveTenantId,
              "req-get-cc",
            );
            const items = (listRes as any)?.data?.items ?? [];
            const found = items.find(
              (item: any) => item.code === costCenterCode,
            );
            if (!found) {
              return new Response(
                JSON.stringify({
                  error: "NOT_FOUND",
                  message: "Cost center not found",
                }),
                {
                  status: 404,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
            return new Response(JSON.stringify({ data: found }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          const res = tenantPartnerController.listCostCenters(
            undefined,
            undefined,
            undefined,
            effectiveTenantId,
            "req-list-cc",
          );
          return new Response(JSON.stringify(res), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (init?.method === "POST") {
          let bodyObj: any = {};
          if (typeof init?.body === "string") {
            bodyObj = JSON.parse(init.body);
          } else if (
            init?.body instanceof ArrayBuffer ||
            init?.body instanceof Uint8Array
          ) {
            bodyObj = JSON.parse(
              new TextDecoder().decode(init.body as ArrayBuffer),
            );
          }
          const res = tenantPartnerController.upsertCostCenter(
            bodyObj,
            effectiveTenantId,
            "req-post-cc",
          );
          return new Response(JSON.stringify(res), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      if (urlStr.includes("/api/tenant/users")) {
        const authHeader = getHeader("authorization");
        const token = authHeader?.replace("Bearer ", "");
        const payload = token
          ? await jwtAuthService.verifyAccessToken(token)
          : null;
        if (!payload) {
          return new Response(
            JSON.stringify({ error: "AUTHENTICATION_REQUIRED" }),
            {
              status: 401,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        const effectiveTenantId = payload.tenantId ?? tenantId;
        const url = new URL(urlStr);
        const pathSegments = url.pathname.split("/").filter(Boolean); // ["api", "tenant", "users", ":userId"?]
        const targetUserId = pathSegments[3];

        if (targetUserId) {
          const user = tenantPartnerService.findTenantUser(
            effectiveTenantId,
            targetUserId,
          );
          if (!user) {
            return new Response(
              JSON.stringify({
                error: "NOT_FOUND",
                message: "Tenant user not found",
              }),
              {
                status: 404,
                headers: { "Content-Type": "application/json" },
              },
            );
          }
          return new Response(JSON.stringify({ data: user }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        const users = tenantPartnerService.listTenantUsers(effectiveTenantId);
        return new Response(JSON.stringify({ data: { items: users } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response("Not found", { status: 404 });
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  async function issueValidAdminSessionToken(): Promise<{
    token: string;
    sessionId: string;
  }> {
    const user = tenantPartnerService.findTenantUser(
      tenantId,
      seededAdminUser.userId,
    )!;
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

    // Verify token is active at both service and route levels
    expect(await jwtAuthService.verifyAccessToken(token)).not.toBeNull();
    const preCheckReq = new NextRequest(
      "https://tenant.drts.internal/api/auth/session",
      {
        headers: { cookie: `${TENANT_SESSION_COOKIE_NAME}=${token}` },
      },
    );
    const preCheckRes = await tenantAuthGet(preCheckReq, {
      params: Promise.resolve({ auth: ["session"] }),
    });
    expect(preCheckRes.status).toBe(200);

    // Demote role from tenant_admin to tenant_viewer (updates user.updatedAt and user.roleCode)
    await tenantPartnerService.updateTenantUserRole(
      tenantId,
      seededAdminUser.userId,
      { roleCode: "tenant_viewer" },
      "req-demote",
    );

    // 1. Service verification: token rejected due to durable state tokenVersion & role mismatch
    const verified = await jwtAuthService.verifyAccessToken(token);
    expect(verified).toBeNull();

    // 2. Route verification: BFF /api/auth/session rejects original token and clears cookies
    const postSessionReq = new NextRequest(
      "https://tenant.drts.internal/api/auth/session",
      {
        headers: { cookie: `${TENANT_SESSION_COOKIE_NAME}=${token}` },
      },
    );
    const postSessionRes = await tenantAuthGet(postSessionReq, {
      params: Promise.resolve({ auth: ["session"] }),
    });
    expect(postSessionRes.status).toBe(401);
    const postSessionData = await postSessionRes.json();
    expect(postSessionData.active).toBe(false);
    expect(postSessionData.error).toBe("AUTHENTICATION_REQUIRED");
    const clearedCookie = postSessionRes.cookies.get(
      TENANT_SESSION_COOKIE_NAME,
    );
    expect(clearedCookie?.value === "" || clearedCookie?.maxAge === 0).toBe(
      true,
    );

    // 3. Route verification: Control plane proxy GET rejects original token with 401
    const proxyReadReq = new NextRequest(
      "https://tenant.drts.internal/control-plane-proxy/tenant/cost-centers",
      {
        headers: { cookie: `${TENANT_SESSION_COOKIE_NAME}=${token}` },
      },
    );
    const proxyReadRes = await proxyGet(proxyReadReq, {
      params: Promise.resolve({ path: ["tenant", "cost-centers"] }),
    });
    expect(proxyReadRes.status).toBe(401);

    // 4. Route verification: Control plane proxy POST with valid CSRF rejects original token with 401
    const validCsrf = generateCsrfToken();
    const proxyWriteReq = new NextRequest(
      "https://tenant.drts.internal/control-plane-proxy/tenant/cost-centers",
      {
        method: "POST",
        headers: {
          cookie: `${TENANT_SESSION_COOKIE_NAME}=${token}; ${TENANT_CSRF_COOKIE_NAME}=${validCsrf}`,
          [TENANT_CSRF_HEADER_NAME]: validCsrf,
          origin: "https://tenant.drts.internal",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: "CC-SEC-002",
          name: "Security CC 2",
          department: "Security",
          monthlyBudget: 2000,
        }),
      },
    );
    const proxyWriteRes = await proxyPost(proxyWriteReq, {
      params: Promise.resolve({ path: ["tenant", "cost-centers"] }),
    });
    expect(proxyWriteRes.status).toBe(401);
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

    // 1. Service verification: token rejected
    const verified = await jwtAuthService.verifyAccessToken(token);
    expect(verified).toBeNull();

    // 2. Route verification: BFF /api/auth/session rejects original token
    const postSessionReq = new NextRequest(
      "https://tenant.drts.internal/api/auth/session",
      {
        headers: { cookie: `${TENANT_SESSION_COOKIE_NAME}=${token}` },
      },
    );
    const postSessionRes = await tenantAuthGet(postSessionReq, {
      params: Promise.resolve({ auth: ["session"] }),
    });
    expect(postSessionRes.status).toBe(401);

    // 3. Route verification: Control plane proxy GET rejects original token with 401
    const proxyReadReq = new NextRequest(
      "https://tenant.drts.internal/control-plane-proxy/tenant/cost-centers",
      {
        headers: { cookie: `${TENANT_SESSION_COOKIE_NAME}=${token}` },
      },
    );
    const proxyReadRes = await proxyGet(proxyReadReq, {
      params: Promise.resolve({ path: ["tenant", "cost-centers"] }),
    });
    expect(proxyReadRes.status).toBe(401);

    // 4. Route verification: Control plane proxy POST rejects original token with 401
    const validCsrf = generateCsrfToken();
    const proxyWriteReq = new NextRequest(
      "https://tenant.drts.internal/control-plane-proxy/tenant/cost-centers",
      {
        method: "POST",
        headers: {
          cookie: `${TENANT_SESSION_COOKIE_NAME}=${token}; ${TENANT_CSRF_COOKIE_NAME}=${validCsrf}`,
          [TENANT_CSRF_HEADER_NAME]: validCsrf,
          origin: "https://tenant.drts.internal",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: "CC-SEC-003",
          name: "Security CC 3",
          department: "Security",
          monthlyBudget: 3000,
        }),
      },
    );
    const proxyWriteRes = await proxyPost(proxyWriteReq, {
      params: Promise.resolve({ path: ["tenant", "cost-centers"] }),
    });
    expect(proxyWriteRes.status).toBe(401);
  });

  it("invalidates issued session token upon explicit backend session revocation", async () => {
    const { token, sessionId } = await issueValidAdminSessionToken();

    expect(await jwtAuthService.verifyAccessToken(token)).not.toBeNull();

    // Revoke session in IdentityRepository
    await identityRepository.revokeSession(sessionId, "manual_revoke");

    // 1. Service verification: token rejected
    const verified = await jwtAuthService.verifyAccessToken(token);
    expect(verified).toBeNull();

    // 2. Route verification: BFF /api/auth/session rejects original token
    const postSessionReq = new NextRequest(
      "https://tenant.drts.internal/api/auth/session",
      {
        headers: { cookie: `${TENANT_SESSION_COOKIE_NAME}=${token}` },
      },
    );
    const postSessionRes = await tenantAuthGet(postSessionReq, {
      params: Promise.resolve({ auth: ["session"] }),
    });
    expect(postSessionRes.status).toBe(401);

    // 3. Route verification: Control plane proxy GET rejects original token with 401
    const proxyReadReq = new NextRequest(
      "https://tenant.drts.internal/control-plane-proxy/tenant/cost-centers",
      {
        headers: { cookie: `${TENANT_SESSION_COOKIE_NAME}=${token}` },
      },
    );
    const proxyReadRes = await proxyGet(proxyReadReq, {
      params: Promise.resolve({ path: ["tenant", "cost-centers"] }),
    });
    expect(proxyReadRes.status).toBe(401);

    // 4. Route verification: Control plane proxy POST rejects original token with 401
    const validCsrf = generateCsrfToken();
    const proxyWriteReq = new NextRequest(
      "https://tenant.drts.internal/control-plane-proxy/tenant/cost-centers",
      {
        method: "POST",
        headers: {
          cookie: `${TENANT_SESSION_COOKIE_NAME}=${token}; ${TENANT_CSRF_COOKIE_NAME}=${validCsrf}`,
          [TENANT_CSRF_HEADER_NAME]: validCsrf,
          origin: "https://tenant.drts.internal",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: "CC-SEC-004",
          name: "Security CC 4",
          department: "Security",
          monthlyBudget: 4000,
        }),
      },
    );
    const proxyWriteRes = await proxyPost(proxyWriteReq, {
      params: Promise.resolve({ path: ["tenant", "cost-centers"] }),
    });
    expect(proxyWriteRes.status).toBe(401);
  });

  it("enforces tenant isolation and rejects cross-tenant access and mutations without leaking existence", async () => {
    const { token } = await issueValidAdminSessionToken();
    const verified = await jwtAuthService.verifyAccessToken(token);
    expect(verified).not.toBeNull();

    // ── 1. Route-Level Resource Query: Exists in other tenant vs Nonexistent ────
    // Request A: Query cost center that exists in otherTenantId (CC-SEC-OTHER-001)
    const existsInOtherTenantReq = new NextRequest(
      "https://tenant.drts.internal/control-plane-proxy/tenant/cost-centers/CC-SEC-OTHER-001",
      {
        headers: { cookie: `${TENANT_SESSION_COOKIE_NAME}=${token}` },
      },
    );
    const existsInOtherTenantRes = await proxyGet(existsInOtherTenantReq, {
      params: Promise.resolve({
        path: ["tenant", "cost-centers", "CC-SEC-OTHER-001"],
      }),
    });

    // Request B: Query cost center that does NOT exist anywhere (CC-SEC-NONEXISTENT-999)
    const nonexistentReq = new NextRequest(
      "https://tenant.drts.internal/control-plane-proxy/tenant/cost-centers/CC-SEC-NONEXISTENT-999",
      {
        headers: { cookie: `${TENANT_SESSION_COOKIE_NAME}=${token}` },
      },
    );
    const nonexistentRes = await proxyGet(nonexistentReq, {
      params: Promise.resolve({
        path: ["tenant", "cost-centers", "CC-SEC-NONEXISTENT-999"],
      }),
    });

    // Both requests must return identical 404 NOT_FOUND responses with identical error bodies
    expect(existsInOtherTenantRes.status).toBe(404);
    expect(nonexistentRes.status).toBe(404);
    const existsInOtherJson = await existsInOtherTenantRes.json();
    const nonexistentJson = await nonexistentRes.json();
    expect(existsInOtherJson).toEqual({
      error: "NOT_FOUND",
      message: "Cost center not found",
    });
    expect(nonexistentJson).toEqual({
      error: "NOT_FOUND",
      message: "Cost center not found",
    });
    expect(existsInOtherJson).toEqual(nonexistentJson);

    // ── 2. Route-Level User Query: Exists in other tenant vs Nonexistent ───────
    const userInOtherTenantReq = new NextRequest(
      `https://tenant.drts.internal/control-plane-proxy/tenant/users/${seededOtherAdminUser.userId}`,
      {
        headers: { cookie: `${TENANT_SESSION_COOKIE_NAME}=${token}` },
      },
    );
    const userInOtherTenantRes = await proxyGet(userInOtherTenantReq, {
      params: Promise.resolve({
        path: ["tenant", "users", seededOtherAdminUser.userId],
      }),
    });

    const userNonexistentReq = new NextRequest(
      "https://tenant.drts.internal/control-plane-proxy/tenant/users/usr-sec-nonexistent-999",
      {
        headers: { cookie: `${TENANT_SESSION_COOKIE_NAME}=${token}` },
      },
    );
    const userNonexistentRes = await proxyGet(userNonexistentReq, {
      params: Promise.resolve({
        path: ["tenant", "users", "usr-sec-nonexistent-999"],
      }),
    });

    expect(userInOtherTenantRes.status).toBe(404);
    expect(userNonexistentRes.status).toBe(404);
    expect(await userInOtherTenantRes.json()).toEqual(
      await userNonexistentRes.json(),
    );

    // ── 3. Cross-Tenant Mutation Attempt: Existing Other Tenant vs Nonexistent Tenant ──
    const crossTenantPayload = {
      email: "attacker@cross.example",
      displayName: "Attacker User",
      roleCode: "tenant_admin",
    };

    // Case A: Attempt mutation in existing other tenant (tenant-security-002) with tenant-security-001 identity
    let errOtherTenant: any;
    try {
      tenantPartnerService.createTenantUser(
        otherTenantId,
        crossTenantPayload,
        "req-cross-other",
        {
          actorId: seededAdminUser.userId,
          actorType: "tenant_admin",
          realm: "tenant",
          tenantId, // tenant-security-001
          roleFamilies: ["tenant"],
          roles: ["tenant_admin"],
          scopes: ["tenant:write"],
          authMode: "jwt_bearer",
          supportedExecutionModes: ["supervisor_managed_execution"],
        },
      );
    } catch (e) {
      errOtherTenant = e;
    }

    // Case B: Attempt mutation in completely nonexistent tenant (tenant-security-nonexistent-888) with tenant-security-001 identity
    let errNonexistentTenant: any;
    try {
      tenantPartnerService.createTenantUser(
        "tenant-security-nonexistent-888",
        crossTenantPayload,
        "req-cross-nonexistent",
        {
          actorId: seededAdminUser.userId,
          actorType: "tenant_admin",
          realm: "tenant",
          tenantId, // tenant-security-001
          roleFamilies: ["tenant"],
          roles: ["tenant_admin"],
          scopes: ["tenant:write"],
          authMode: "jwt_bearer",
          supportedExecutionModes: ["supervisor_managed_execution"],
        },
      );
    } catch (e) {
      errNonexistentTenant = e;
    }

    expect(errOtherTenant).toBeDefined();
    expect(errNonexistentTenant).toBeDefined();
    expect(errOtherTenant.getStatus()).toBe(403);
    expect(errNonexistentTenant.getStatus()).toBe(403);
    expect(errOtherTenant.code).toBe("TENANT_SCOPE_MISMATCH");
    expect(errNonexistentTenant.code).toBe("TENANT_SCOPE_MISMATCH");

    // ── 4. Service-Level Query Isolation ──────────────────────────────────────
    expect(
      tenantPartnerService.findTenantUser(
        tenantId,
        seededOtherAdminUser.userId,
      ),
    ).toBeNull();
    expect(
      tenantPartnerService.findTenantUser(tenantId, "usr-sec-nonexistent-999"),
    ).toBeNull();
    const tenant1Users = tenantPartnerService.listTenantUsers(tenantId);
    expect(tenant1Users.some((u) => u.tenantId === otherTenantId)).toBe(false);
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
        body: JSON.stringify({
          code: "CC-01",
          name: "Test",
          department: "Eng",
          monthlyBudget: 100,
        }),
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
        body: JSON.stringify({
          code: "CC-01",
          name: "Test",
          department: "Eng",
          monthlyBudget: 100,
        }),
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
    // 1. Helper to initiate login and get valid login parameters + state cookie
    async function startLogin() {
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
      const stateCookie = loginRes.cookies.get(
        TENANT_OIDC_STATE_COOKIE_NAME,
      )!.value;

      return { authState, codeChallenge, nonce, stateCookie };
    }

    // ── Negative Case 1: Tampered State Cookie -> 400 ─────────────────────────
    {
      const { authState, codeChallenge, nonce, stateCookie } =
        await startLogin();
      const authCode = oidcServer.issueAuthorizationCode({
        codeChallenge,
        nonce,
        sub: "sub_oidc_admin_sec",
        email: "admin@sec.example",
        tenantId,
      });

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
      const err = await tamperedCookieRes.json();
      expect(err.error).toBe("AUTH_SESSION_EXCHANGE_DENIED");
    }

    // ── Negative Case 2: State Parameter Mismatch -> Redirect /login ──────────
    {
      const { codeChallenge, nonce, stateCookie } = await startLogin();
      const authCode = oidcServer.issueAuthorizationCode({
        codeChallenge,
        nonce,
        sub: "sub_oidc_admin_sec",
        email: "admin@sec.example",
        tenantId,
      });

      const stateMismatchReq = new NextRequest(
        `https://tenant.drts.internal/api/auth/tenant/callback?code=${authCode}&state=wrong_mismatched_oauth_state`,
        {
          headers: {
            cookie: `${TENANT_OIDC_STATE_COOKIE_NAME}=${stateCookie}`,
          },
        },
      );
      const stateMismatchRes = await tenantAuthGet(stateMismatchReq, {
        params: Promise.resolve({ auth: ["tenant", "callback"] }),
      });
      expect(stateMismatchRes.status).toBe(307);
      const redirectLoc = stateMismatchRes.headers.get("location");
      expect(redirectLoc).toContain("error=AUTH_STATE_MISMATCH");
    }

    // ── Negative Case 3: PKCE Verifier Mismatch (Tampered in State Envelope) ──
    {
      const { authState, codeChallenge, nonce, stateCookie } =
        await startLogin();
      const authCode = oidcServer.issueAuthorizationCode({
        codeChallenge,
        nonce,
        sub: "sub_oidc_admin_sec",
        email: "admin@sec.example",
        tenantId,
      });

      const decoded = decodeStateEnvelope(stateCookie)!;
      expect(decoded).toBeDefined();
      const tamperedVerifierCookie = encodeStateEnvelope({
        ...decoded,
        codeVerifier: "tampered_wrong_pkce_verifier_value_43_chars_long_123",
      });

      const pkceMismatchReq = new NextRequest(
        `https://tenant.drts.internal/api/auth/tenant/callback?code=${authCode}&state=${authState}`,
        {
          headers: {
            cookie: `${TENANT_OIDC_STATE_COOKIE_NAME}=${tamperedVerifierCookie}`,
          },
        },
      );
      const pkceMismatchRes = await tenantAuthGet(pkceMismatchReq, {
        params: Promise.resolve({ auth: ["tenant", "callback"] }),
      });
      expect(pkceMismatchRes.status).toBe(403);
      const err = await pkceMismatchRes.json();
      expect(err.error).toBe("AUTH_SESSION_EXCHANGE_DENIED");
    }

    // ── Negative Case 4: PKCE Challenge Mismatch (Auth code issued for wrong challenge)
    {
      const { authState, nonce, stateCookie } = await startLogin();
      const authCodeWrongChallenge = oidcServer.issueAuthorizationCode({
        codeChallenge: "mismatched_challenge_hash_1234567890123456789012345",
        nonce,
        sub: "sub_oidc_admin_sec",
        email: "admin@sec.example",
        tenantId,
      });

      const wrongChallengeReq = new NextRequest(
        `https://tenant.drts.internal/api/auth/tenant/callback?code=${authCodeWrongChallenge}&state=${authState}`,
        {
          headers: {
            cookie: `${TENANT_OIDC_STATE_COOKIE_NAME}=${stateCookie}`,
          },
        },
      );
      const wrongChallengeRes = await tenantAuthGet(wrongChallengeReq, {
        params: Promise.resolve({ auth: ["tenant", "callback"] }),
      });
      expect(wrongChallengeRes.status).toBe(403);
      const err = await wrongChallengeRes.json();
      expect(err.error).toBe("AUTH_SESSION_EXCHANGE_DENIED");
    }

    // ── Negative Case 5: Nonce Mismatch (IdP ID token nonce mismatch) ─────────
    {
      const { authState, codeChallenge, stateCookie } = await startLogin();
      const authCodeWrongNonce = oidcServer.issueAuthorizationCode({
        codeChallenge,
        nonce: "mismatched_tampered_nonce_value_9999",
        sub: "sub_oidc_admin_sec",
        email: "admin@sec.example",
        tenantId,
      });

      const wrongNonceReq = new NextRequest(
        `https://tenant.drts.internal/api/auth/tenant/callback?code=${authCodeWrongNonce}&state=${authState}`,
        {
          headers: {
            cookie: `${TENANT_OIDC_STATE_COOKIE_NAME}=${stateCookie}`,
          },
        },
      );
      const wrongNonceRes = await tenantAuthGet(wrongNonceReq, {
        params: Promise.resolve({ auth: ["tenant", "callback"] }),
      });
      expect(wrongNonceRes.status).toBe(403);
      const err = await wrongNonceRes.json();
      expect(err.error).toBe("AUTH_SESSION_EXCHANGE_DENIED");
    }

    // ── Negative Case 6: Missing Nonce (IdP ID token lacks nonce claim) ───────
    {
      const { authState, codeChallenge, nonce, stateCookie } =
        await startLogin();
      const authCodeMissingNonce = oidcServer.issueAuthorizationCode({
        codeChallenge,
        nonce,
        sub: "sub_oidc_admin_sec",
        email: "admin@sec.example",
        tenantId,
        customIdTokenProps: { omitNonce: true },
      });

      const missingNonceReq = new NextRequest(
        `https://tenant.drts.internal/api/auth/tenant/callback?code=${authCodeMissingNonce}&state=${authState}`,
        {
          headers: {
            cookie: `${TENANT_OIDC_STATE_COOKIE_NAME}=${stateCookie}`,
          },
        },
      );
      const missingNonceRes = await tenantAuthGet(missingNonceReq, {
        params: Promise.resolve({ auth: ["tenant", "callback"] }),
      });
      expect(missingNonceRes.status).toBe(403);
      const err = await missingNonceRes.json();
      expect(err.error).toBe("AUTH_SESSION_EXCHANGE_DENIED");
    }

    // ── Happy Path: Successful First Exchange & State Replay ──────────────────
    {
      const { authState, codeChallenge, nonce, stateCookie } =
        await startLogin();
      const authCode = oidcServer.issueAuthorizationCode({
        codeChallenge,
        nonce,
        sub: "sub_oidc_admin_sec",
        email: "admin@sec.example",
        tenantId,
      });

      // Successful first exchange
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
      expect(validCallbackRes.headers.get("location")).toBe(
        "https://tenant.drts.internal/dashboard",
      );

      // State Replay -> Already consumed -> 403 AUTH_SESSION_EXCHANGE_DENIED
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
      const replayErr = await replayCallbackRes.json();
      expect(replayErr.error).toBe("AUTH_SESSION_EXCHANGE_DENIED");
    }
  });
});
