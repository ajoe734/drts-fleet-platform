import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as tenantAuthGet, POST as tenantAuthPost } from "../../apps/tenant-portal-web/app/api/auth/[...auth]/route";
import { GET as partnerAuthGet } from "../../apps/fleet-partner-portal-web/app/api/auth/[...auth]/route";
import { OidcPkceService } from "../../apps/api/src/modules/auth/oidc-pkce.service";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";

describe("E2E-IAM-IDP-001: Web App BFF Cookie & OIDC PKCE Route Handler Integration Suite", () => {
  const jwtAuthService = new JwtAuthService();
  const tenantPartnerService = new TenantPartnerService(new AuditNotificationService());
  const oidcService = new OidcPkceService(jwtAuthService, tenantPartnerService);

  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.JWT_SECRET = "test_jwt_secret_key_32_characters_long_min!";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("exercises Tenant Web App BFF login flow and sets HttpOnly drts_oidc_state cookie", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (url.toString().includes("/api/auth/tenant/login")) {
        const loginParams = oidcService.generateLoginParameters("tenant", {
          redirectUri: "http://localhost:3000/api/auth/callback",
        });
        return new Response(JSON.stringify({ data: loginParams }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    });

    const req = new NextRequest("http://localhost:3000/api/auth/login?redirect_uri=/dashboard");
    const context = { params: Promise.resolve({ auth: ["login"] }) };

    const res = await tenantAuthGet(req, context);
    expect(res.status).toBe(307);

    const location = res.headers.get("location");
    expect(location).toContain("response_type=code");
    expect(location).toContain("code_challenge_method=S256");

    const stateCookie = res.cookies.get("drts_oidc_state");
    expect(stateCookie).toBeDefined();
    expect(stateCookie?.httpOnly).toBe(true);

    const cookieData = JSON.parse(stateCookie!.value);
    expect(cookieData.stateToken).toBeDefined();
    expect(cookieData.codeVerifier).toBeUndefined();
    expect(cookieData.returnUrl).toBe("/dashboard");
  });

  it("exercises Tenant Web App BFF callback flow, exchanges session with API via POST, and sets Secure HttpOnly drts_session cookie", async () => {
    const login = oidcService.generateLoginParameters("tenant", {
      redirectUri: "http://localhost:3000/api/auth/callback",
    });

    const req = new NextRequest(`http://localhost:3000/api/auth/callback?code=e2e_valid_code_001&state=${login.state}`);
    const cookiePayload = JSON.stringify({
      stateToken: login.stateToken,
      returnUrl: "/dashboard",
    });
    req.cookies.set("drts_oidc_state", cookiePayload);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (url.toString().includes("/api/auth/tenant/callback-session")) {
        const command = JSON.parse((init?.body as string) || "{}");
        const stateToken = (init?.headers as any)?.["x-oidc-state-token"];
        const session = await oidcService.exchangeTenantCallbackSession(command, { stateToken });
        return new Response(JSON.stringify({ data: session }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    });

    const context = { params: Promise.resolve({ auth: ["callback"] }) };
    const res = await tenantAuthGet(req, context);

    expect(fetchSpy).toHaveBeenCalled();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/dashboard");

    const sessionCookie = res.cookies.get("drts_session");
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.value).toBeDefined();

    const csrfCookie = res.cookies.get("drts_csrf");
    expect(csrfCookie).toBeDefined();

    const stateCookie = res.cookies.get("drts_oidc_state");
    expect(stateCookie?.value === "" || stateCookie?.maxAge === 0 || !stateCookie).toBe(true);
  });

  it("rejects a protocol-relative returnUrl on Tenant Web App BFF callback and falls back to same-origin root", async () => {
    const login = oidcService.generateLoginParameters("tenant", {
      redirectUri: "http://localhost:3000/api/auth/callback",
    });

    const req = new NextRequest(`http://localhost:3000/api/auth/callback?code=e2e_valid_code_002&state=${login.state}`);
    const cookiePayload = JSON.stringify({
      stateToken: login.stateToken,
      returnUrl: "//attacker.example",
    });
    req.cookies.set("drts_oidc_state", cookiePayload);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (url.toString().includes("/api/auth/tenant/callback-session")) {
        const command = JSON.parse((init?.body as string) || "{}");
        const stateToken = (init?.headers as any)?.["x-oidc-state-token"];
        const session = await oidcService.exchangeTenantCallbackSession(command, { stateToken });
        return new Response(JSON.stringify({ data: session }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    });

    const context = { params: Promise.resolve({ auth: ["callback"] }) };
    const res = await tenantAuthGet(req, context);

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toBe("http://localhost:3000/");
    expect(location).not.toContain("attacker.example");
  });

  it("rejects a backslash returnUrl on Tenant Web App BFF callback and falls back to same-origin root", async () => {
    const login = oidcService.generateLoginParameters("tenant", {
      redirectUri: "http://localhost:3000/api/auth/callback",
    });

    const req = new NextRequest(`http://localhost:3000/api/auth/callback?code=e2e_valid_code_003&state=${login.state}`);
    const cookiePayload = JSON.stringify({
      stateToken: login.stateToken,
      returnUrl: "/\\attacker.example",
    });
    req.cookies.set("drts_oidc_state", cookiePayload);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (url.toString().includes("/api/auth/tenant/callback-session")) {
        const command = JSON.parse((init?.body as string) || "{}");
        const stateToken = (init?.headers as any)?.["x-oidc-state-token"];
        const session = await oidcService.exchangeTenantCallbackSession(command, { stateToken });
        return new Response(JSON.stringify({ data: session }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    });

    const context = { params: Promise.resolve({ auth: ["callback"] }) };
    const res = await tenantAuthGet(req, context);

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toBe("http://localhost:3000/");
    expect(location).not.toContain("attacker.example");
  });

  it("exercises Fleet Partner Web App BFF login and callback flows", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (url.toString().includes("/api/auth/partner/login")) {
        const loginParams = oidcService.generateLoginParameters("partner", {
          partnerId: "yuhe-residence",
          redirectUri: "http://localhost:3001/api/auth/callback",
        });
        return new Response(JSON.stringify({ data: loginParams }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.toString().includes("/api/auth/partner/callback-session")) {
        const command = JSON.parse((init?.body as string) || "{}");
        const stateToken = (init?.headers as any)?.["x-oidc-state-token"];
        const session = await oidcService.exchangePartnerCallbackSession(command, { stateToken });
        return new Response(JSON.stringify({ data: session }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    });

    const loginReq = new NextRequest("http://localhost:3001/api/auth/login?partner_id=yuhe-residence");
    const loginContext = { params: Promise.resolve({ auth: ["login"] }) };
    const loginRes = await partnerAuthGet(loginReq, loginContext);

    expect(loginRes.status).toBe(307);
    const stateCookie = loginRes.cookies.get("drts_oidc_state");
    expect(stateCookie).toBeDefined();

    const partnerUserIdentityLinkRepo = (oidcService as any).partnerUserIdentityLinkRepo;
    const code = "e2e_valid_partner_code_001";
    const sub = `sub_oidc_${createHash("sha256").update(code).digest("hex").slice(0, 12)}`;
    await partnerUserIdentityLinkRepo.resolveOrCreate({
      entrySlug: "yuhe-residence",
      partnerUserRef: sub,
    });

    const loginParams = oidcService.generateLoginParameters("partner", {
      partnerId: "yuhe-residence",
      redirectUri: "http://localhost:3001/api/auth/callback",
    });

    const callbackReq = new NextRequest(`http://localhost:3001/api/auth/callback?code=e2e_valid_partner_code_001&state=${loginParams.state}`);
    callbackReq.cookies.set("drts_oidc_state", JSON.stringify({
      stateToken: loginParams.stateToken,
      returnUrl: "/partner-dashboard",
    }));

    const callbackContext = { params: Promise.resolve({ auth: ["callback"] }) };
    const callbackRes = await partnerAuthGet(callbackReq, callbackContext);

    expect(callbackRes.status).toBe(307);
    expect(callbackRes.headers.get("location")).toBe("http://localhost:3001/partner-dashboard");

    const sessionCookie = callbackRes.cookies.get("drts_session");
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);
  });

  it("rejects a protocol-relative returnUrl on Fleet Partner Web App BFF callback and falls back to same-origin root", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (url.toString().includes("/api/auth/partner/callback-session")) {
        const command = JSON.parse((init?.body as string) || "{}");
        const stateToken = (init?.headers as any)?.["x-oidc-state-token"];
        const session = await oidcService.exchangePartnerCallbackSession(command, { stateToken });
        return new Response(JSON.stringify({ data: session }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    });

    const partnerUserIdentityLinkRepo = (oidcService as any).partnerUserIdentityLinkRepo;
    const code = "e2e_valid_partner_code_002";
    const sub = `sub_oidc_${createHash("sha256").update(code).digest("hex").slice(0, 12)}`;
    await partnerUserIdentityLinkRepo.resolveOrCreate({
      entrySlug: "yuhe-residence",
      partnerUserRef: sub,
    });

    const loginParams = oidcService.generateLoginParameters("partner", {
      partnerId: "yuhe-residence",
      redirectUri: "http://localhost:3001/api/auth/callback",
    });

    const callbackReq = new NextRequest(`http://localhost:3001/api/auth/callback?code=${code}&state=${loginParams.state}`);
    callbackReq.cookies.set("drts_oidc_state", JSON.stringify({
      stateToken: loginParams.stateToken,
      returnUrl: "//attacker.example",
    }));

    const callbackContext = { params: Promise.resolve({ auth: ["callback"] }) };
    const callbackRes = await partnerAuthGet(callbackReq, callbackContext);

    expect(callbackRes.status).toBe(307);
    const location = callbackRes.headers.get("location");
    expect(location).toBe("http://localhost:3001/");
    expect(location).not.toContain("attacker.example");
  });

  it("exercises logout flow and deletes HttpOnly session cookies", async () => {
    const logoutReq = new NextRequest("http://localhost:3000/api/auth/logout");
    const logoutContext = { params: Promise.resolve({ auth: ["logout"] }) };

    const logoutRes = await tenantAuthPost(logoutReq, logoutContext);
    expect(logoutRes.status).toBe(200);

    const sessionCookie = logoutRes.cookies.get("drts_session");
    expect(sessionCookie?.value === "" || sessionCookie?.maxAge === 0 || !sessionCookie).toBe(true);
  });
});
