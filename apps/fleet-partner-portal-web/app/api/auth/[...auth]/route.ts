import { randomBytes } from "node:crypto";
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
    const partnerId = request.nextUrl.searchParams.get("partner_id") || "";
    const callbackUrl = `${request.nextUrl.origin}/api/auth/callback`;

    const backendUrl = new URL(`${API_URL}/api/auth/partner/login`);
    backendUrl.searchParams.set("redirect_uri", callbackUrl);
    if (partnerId) backendUrl.searchParams.set("partner_id", partnerId);

    const res = await fetch(backendUrl.toString());
    const data = await res.json();

    if (!res.ok || !data.data?.authorizationUrl) {
      return NextResponse.json(
        { error: "AUTH_LOGIN_FAILED", message: "Could not generate partner login URL" },
        { status: res.status },
      );
    }

    const { authorizationUrl, stateToken } = data.data;
    const cookiePayload = JSON.stringify({ stateToken, returnUrl });

    const redirectRes = NextResponse.redirect(authorizationUrl);
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
          message: "OIDC state cookie missing or expired. Managed HttpOnly BFF state boundary enforced.",
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

    const callbackUrl = `${request.nextUrl.origin}/api/auth/callback`;

    const exchangeRes = await fetch(`${API_URL}/api/auth/partner/callback-session`, {
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
    if (!exchangeRes.ok || !data.data?.accessToken) {
      return NextResponse.json(
        {
          error: data.error?.code || "AUTH_SESSION_EXCHANGE_DENIED",
          message: data.error?.message || "Partner OIDC session exchange failed",
        },
        { status: exchangeRes.status },
      );
    }

    const session = data.data;
    const csrfToken = randomBytes(32).toString("base64url");
    const targetRedirect = returnUrl.startsWith("/") ? returnUrl : "/";
    const response = NextResponse.redirect(new URL(targetRedirect, request.nextUrl.origin));

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
