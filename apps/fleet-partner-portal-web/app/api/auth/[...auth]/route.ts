import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  handlePartnerListSessions,
  handlePartnerPasswordLogin,
  handlePartnerPasswordResetConfirm,
  handlePartnerPasswordResetRequest,
  handlePartnerRevokeSession,
  handlePartnerTotpConfirm,
  handlePartnerTotpEnroll,
  type FleetCredentialConfig,
} from "../../../../lib/portal-credential-handlers";

const SESSION_COOKIE_NAME = "drts_session";
const CSRF_COOKIE_NAME = "drts_csrf";
const CSRF_HEADER_NAME = "x-csrf-token";

function isSecureEnvironment(req: NextRequest): boolean {
  return (
    process.env.NODE_ENV === "production" || req.nextUrl.protocol === "https:"
  );
}

// The browser's origin, as in this app's control-plane-proxy: the public
// runtime wrapper strips any caller copy of x-drts-runtime-origin and rebuilds
// it from the ingress authority. The loopback child's own URL is
// http://127.0.0.1:3107, which Google and the API reject as a redirect URI.
function browserOrigin(request: NextRequest): string {
  return request.headers.get("x-drts-runtime-origin") ?? request.nextUrl.origin;
}

// Server-side calls go straight to the API, in @drts/tenant-auth's order.
// NEXT_PUBLIC_API_URL is the browser base (/control-plane-proxy on Cloud Run),
// not an absolute URL here: using it failed every login with "Invalid URL".
function apiUrl(path: string): string {
  const browserBase = process.env.NEXT_PUBLIC_API_URL?.trim();
  const base =
    process.env.DRTS_API_URL?.trim() ||
    process.env.API_URL?.trim() ||
    (browserBase && /^https?:\/\//i.test(browserBase) ? browserBase : "") ||
    "http://localhost:3001";
  return `${base.replace(/\/+$/, "")}${path}`;
}

// A private Cloud Run API needs the invoker proof in x-serverless-authorization
// (never Authorization, which carries the user's session), as in
// app/host/lib/host-auth.server.ts.
async function apiFetch(
  path: string,
  init: Omit<RequestInit, "headers"> & {
    headers?: Record<string, string>;
  } = {},
) {
  const url = apiUrl(path);
  const headers: Record<string, string> = { ...init.headers };
  const audience =
    process.env.DRTS_API_AUTH_AUDIENCE?.trim() ||
    (new URL(url).hostname.endsWith(".a.run.app") ? new URL(url).origin : "");
  if (audience) {
    const metadata = new URL(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity",
    );
    metadata.searchParams.set("audience", audience);
    metadata.searchParams.set("format", "full");
    try {
      const proof = await fetch(metadata, {
        cache: "no-store",
        headers: { "Metadata-Flavor": "Google" },
      });
      if (proof.ok) {
        headers["x-serverless-authorization"] = `Bearer ${await proof.text()}`;
      }
    } catch {
      // A public dev API needs no proof; a private one rejects the call.
    }
  }
  return fetch(url, { ...init, headers, cache: "no-store" });
}

function verifySameOrigin(request: NextRequest): boolean {
  const targetOrigin = browserOrigin(request);
  const originHeader = request.headers.get("origin")?.trim();
  if (originHeader) {
    return originHeader === targetOrigin;
  }
  const refererHeader = request.headers.get("referer")?.trim();
  if (refererHeader) {
    try {
      return new URL(refererHeader).origin === targetOrigin;
    } catch {
      return false;
    }
  }
  return false;
}

function credentialConfig(): FleetCredentialConfig {
  return {
    sessionCookieName: SESSION_COOKIE_NAME,
    csrfCookieName: CSRF_COOKIE_NAME,
    csrfHeaderName: CSRF_HEADER_NAME,
    apiFetch,
    isSecureEnvironment,
    verifySameOrigin,
  };
}

function sanitizeReturnPath(rawReturnUrl: string, origin: string): string {
  if (typeof rawReturnUrl !== "string" || rawReturnUrl.length === 0) {
    return "/";
  }
  if (
    !rawReturnUrl.startsWith("/") ||
    rawReturnUrl.startsWith("//") ||
    rawReturnUrl.includes("\\")
  ) {
    return "/";
  }

  try {
    const resolved = new URL(rawReturnUrl, origin);
    if (resolved.origin !== origin) {
      return "/";
    }
    return `${resolved.pathname}${resolved.search}${resolved.hash}` || "/";
  } catch {
    return "/";
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ auth: string[] }> },
) {
  const { auth } = await context.params;
  const action = auth[0] ?? "";

  if (action === "login") {
    // entrySlug is never taken from the client's partner_id query parameter:
    // this service's deployment configuration is the only authority over
    // which fleet entry a login can resolve to. Letting a caller supply its
    // own partner_id would let any unauthenticated subject probe for the
    // existence of other fleet entrySlug values (a PARTNER_ENTRY_MISMATCH
    // side channel), even though the identity-link check downstream would
    // ultimately still deny an unbound subject.
    const partnerId = process.env.DRTS_FLEET_PARTNER_ID?.trim() || "";
    const returnUrl = request.nextUrl.searchParams.get("redirect_uri") || "/";
    const callbackUrl = `${browserOrigin(request)}/api/auth/callback`;
    // FLEET-ONB-008: a one-time Fleet staff invitation token (SA/SD §2/§9)
    // resolves its own fleet entry server-side from the invitation record,
    // so it never requires DRTS_FLEET_PARTNER_ID -- unlike the ordinary
    // login path above, which is scoped to exactly this deployment's fleet.
    const invitationToken = request.nextUrl.searchParams.get("token")?.trim();

    let res: Response;
    if (invitationToken) {
      res = await apiFetch("/api/auth/partner/invitation-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invitationToken,
          redirectUri: callbackUrl,
          ...(partnerId ? { partnerId } : {}),
        }),
      });
    } else {
      if (!partnerId) {
        return NextResponse.json(
          {
            error: "FLEET_SELECTOR_REQUIRED",
            message:
              "Missing fleet scope configuration: DRTS_FLEET_PARTNER_ID is required.",
          },
          { status: 503 },
        );
      }
      const query = new URLSearchParams({
        redirect_uri: callbackUrl,
        partner_id: partnerId,
      });
      res = await apiFetch(`/api/auth/partner/login?${query}`);
    }
    const data = await res.json();

    if (!res.ok || !data.data?.authorization_url) {
      return NextResponse.json(
        {
          error: data.error?.code || "AUTH_LOGIN_FAILED",
          message:
            data.error?.message ||
            (invitationToken
              ? "Could not generate invitation login URL"
              : "Could not generate partner login URL"),
        },
        { status: res.status && res.status >= 400 ? res.status : 500 },
      );
    }

    const { authorization_url, state_token } = data.data;
    const cookiePayload = JSON.stringify({
      stateToken: state_token,
      returnUrl,
    });

    const redirectRes = NextResponse.redirect(authorization_url);
    redirectRes.cookies.set("drts_oidc_state", cookiePayload, {
      httpOnly: true,
      secure: isSecureEnvironment(request),
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
    return redirectRes;
  }

  if (action === "callback") {
    const code = request.nextUrl.searchParams.get("code") || "";
    const state = request.nextUrl.searchParams.get("state") || "";
    const stateCookie = request.cookies.get("drts_oidc_state")?.value || "";

    if (!stateCookie) {
      return NextResponse.json(
        {
          error: "AUTH_SESSION_EXCHANGE_DENIED",
          message:
            "OIDC state cookie missing or expired. Managed HttpOnly BFF state boundary enforced.",
        },
        { status: 400 },
      );
    }

    let stateToken = "";
    let pkceVerifier = "";
    let returnUrl = "/";

    try {
      const parsed = JSON.parse(stateCookie);
      stateToken = parsed.stateToken || "";
      pkceVerifier = parsed.codeVerifier || "";
      returnUrl = parsed.returnUrl || "/";
    } catch {
      stateToken = stateCookie;
    }

    const callbackUrl = `${browserOrigin(request)}/api/auth/callback`;

    const exchangeRes = await apiFetch("/api/auth/partner/callback-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-oidc-state-token": stateToken,
      },
      body: JSON.stringify({
        provider: "oidc",
        callbackUrl,
        code,
        state,
        ...(pkceVerifier ? { pkceVerifier } : {}),
      }),
    });

    const data = await exchangeRes.json();
    if (!exchangeRes.ok || !data.data?.access_token) {
      return NextResponse.json(
        {
          error: data.error?.code || "AUTH_SESSION_EXCHANGE_DENIED",
          message:
            data.error?.message || "Partner OIDC session exchange failed",
        },
        { status: exchangeRes.status },
      );
    }

    const session = data.data;
    const csrfToken = randomBytes(32).toString("base64url");
    const targetRedirect = sanitizeReturnPath(
      returnUrl,
      browserOrigin(request),
    );
    const response = NextResponse.redirect(
      new URL(targetRedirect, browserOrigin(request)),
    );

    response.cookies.set(SESSION_COOKIE_NAME, session.access_token, {
      httpOnly: true,
      secure: isSecureEnvironment(request),
      sameSite: "lax",
      maxAge: 8 * 60 * 60,
      path: "/",
    });

    response.cookies.set(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false,
      secure: isSecureEnvironment(request),
      sameSite: "lax",
      maxAge: 8 * 60 * 60,
      path: "/",
    });

    response.cookies.delete("drts_oidc_state");
    return response;
  }

  if (action === "session") {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.json(
        { active: false, error: "AUTHENTICATION_REQUIRED" },
        { status: 401 },
      );
    }

    const sessionRes = await apiFetch("/api/auth/session", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await sessionRes.json();
    return NextResponse.json(data, { status: sessionRes.status });
  }

  // PWD-LOGIN-009: self-service session inventory (SA/SD §9).
  if (action === "sessions") {
    return handlePartnerListSessions(request, credentialConfig());
  }

  return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ auth: string[] }> },
) {
  const { auth } = await context.params;
  const action = auth[0] ?? "";

  if (action === "logout") {
    const response = NextResponse.json({ loggedOut: true });
    response.cookies.delete(SESSION_COOKIE_NAME);
    response.cookies.delete(CSRF_COOKIE_NAME);
    response.cookies.delete("drts_oidc_state");
    return response;
  }

  // PWD-LOGIN-009: sign out every session on this account (SA/SD §9 account
  // security "sign out of all devices"), not just this browser's cookie.
  if (action === "logout-all") {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (token) {
      try {
        const revoked = await apiFetch("/api/auth/logout-all", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
        if (!revoked.ok) throw new Error("Session revocation failed.");
      } catch {
        return NextResponse.json(
          { error: "AUTH_LOGOUT_ALL_UNAVAILABLE" },
          { status: 503 },
        );
      }
    }
    const response = NextResponse.json({ loggedOutAll: true });
    response.cookies.delete(SESSION_COOKIE_NAME);
    response.cookies.delete(CSRF_COOKIE_NAME);
    response.cookies.delete("drts_oidc_state");
    return response;
  }

  // PWD-LOGIN-009: password-login, password-reset and TOTP forwarding
  // for the partner realm (SA/SD §4/§6/§7).
  if (action === "password-login") {
    return handlePartnerPasswordLogin(request, credentialConfig());
  }
  if (action === "password-reset" && auth[1] === "request") {
    return handlePartnerPasswordResetRequest(request, credentialConfig());
  }
  if (action === "password-reset" && auth[1] === "confirm") {
    return handlePartnerPasswordResetConfirm(request, credentialConfig());
  }
  if (action === "mfa" && auth[1] === "totp" && auth[2] === "enroll") {
    return handlePartnerTotpEnroll(request, credentialConfig());
  }
  if (action === "mfa" && auth[1] === "totp" && auth[2] === "confirm") {
    return handlePartnerTotpConfirm(request, credentialConfig());
  }
  if (action === "sessions" && auth[1] && auth[2] === "revoke") {
    return handlePartnerRevokeSession(request, auth[1], credentialConfig());
  }

  // FLEET-ONB-008 "set a password" branch (SA/SD §5), mirrors the
  // agency realm's agency/invitation/accept-with-password forward. This is
  // pre-session: the one-time invitation token authorizes the action, so
  // there is no CSRF/session cookie to check yet.
  if (action === "invitation" && auth[1] === "accept-with-password") {
    const body = await request.json().catch(() => null);
    const invitationToken =
      typeof body?.invitationToken === "string"
        ? body.invitationToken.trim()
        : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!invitationToken || invitationToken.length > 512 || !password) {
      return NextResponse.json(
        {
          error: "AUTH_INVITATION_ACCEPT_INVALID",
          message: "A valid invitation token and password are required.",
        },
        { status: 400 },
      );
    }
    try {
      const res = await apiFetch(
        "/api/auth/partner/invitation/accept-with-password",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invitationToken, password }),
        },
      );
      const data = await res.json().catch(() => null);
      return NextResponse.json(data ?? {}, { status: res.status || 502 });
    } catch (error) {
      return NextResponse.json(
        {
          error: "AUTH_INVITATION_ACCEPT_UNAVAILABLE",
          message:
            error instanceof Error
              ? error.message
              : "Upstream invitation service unavailable",
        },
        { status: 503 },
      );
    }
  }

  return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
}
