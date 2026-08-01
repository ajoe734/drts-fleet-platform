import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const SESSION_COOKIE_NAME = "drts_session";
const CSRF_COOKIE_NAME = "drts_csrf";

function isSecureEnvironment(req: NextRequest): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    req.nextUrl.protocol === "https:"
  );
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ auth: string[] }> },
) {
  const { auth } = await context.params;
  const action = auth[0] ?? "";

  if (action === "login") {
    const returnUrl = request.nextUrl.searchParams.get("redirect_uri") || "/";
    const tenantId = request.nextUrl.searchParams.get("tenant_id") || "";

    const backendUrl = new URL(`${API_URL}/api/auth/tenant/login`);
    if (returnUrl) backendUrl.searchParams.set("redirect_uri", returnUrl);
    if (tenantId) backendUrl.searchParams.set("tenant_id", tenantId);

    const res = await fetch(backendUrl.toString());
    const data = await res.json();

    if (!res.ok || !data.data?.authorizationUrl) {
      return NextResponse.json(
        { error: "AUTH_LOGIN_FAILED", message: "Could not generate login URL" },
        { status: res.status },
      );
    }

    const { authorizationUrl, stateToken } = data.data;
    const redirectRes = NextResponse.redirect(authorizationUrl);
    redirectRes.cookies.set("drts_oidc_state", stateToken, {
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
    const codeVerifier = request.nextUrl.searchParams.get("code_verifier") || "";
    const stateToken = request.cookies.get("drts_oidc_state")?.value || "";

    const exchangeRes = await fetch(`${API_URL}/api/auth/tenant/callback-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "oidc",
        callbackUrl: request.nextUrl.origin + "/api/auth/callback",
        code,
        state,
        pkceVerifier: codeVerifier || "default_pkce_verifier_string_32_bytes_long_min",
      }),
    });

    const data = await exchangeRes.json();
    if (!exchangeRes.ok || !data.data?.accessToken) {
      return NextResponse.json(
        {
          error: data.error?.code || "AUTH_SESSION_EXCHANGE_DENIED",
          message: data.error?.message || "OIDC session exchange failed",
        },
        { status: exchangeRes.status },
      );
    }

    const session = data.data;
    const csrfToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const response = NextResponse.redirect(new URL("/", request.nextUrl.origin));

    response.cookies.set(SESSION_COOKIE_NAME, session.accessToken, {
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

    const sessionRes = await fetch(`${API_URL}/api/auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await sessionRes.json();
    return NextResponse.json(data, { status: sessionRes.status });
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

  return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
}
