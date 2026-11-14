import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "drts_session";
const CSRF_COOKIE_NAME = "drts_csrf";

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
    const returnUrl = request.nextUrl.searchParams.get("redirect_uri") || "/";
    const partnerId = request.nextUrl.searchParams.get("partner_id") || "";
    const callbackUrl = `${browserOrigin(request)}/api/auth/callback`;

    const query = new URLSearchParams({ redirect_uri: callbackUrl });
    if (partnerId) query.set("partner_id", partnerId);

    const res = await apiFetch(`/api/auth/partner/login?${query}`);
    const data = await res.json();

    if (!res.ok || !data.data?.authorization_url) {
      return NextResponse.json(
        {
          error: "AUTH_LOGIN_FAILED",
          message: "Could not generate partner login URL",
        },
        { status: res.status },
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
