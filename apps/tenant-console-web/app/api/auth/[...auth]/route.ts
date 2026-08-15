import { NextRequest, NextResponse } from "next/server";
import {
  TENANT_SESSION_COOKIE_NAME,
  TENANT_OIDC_STATE_COOKIE_NAME,
  TENANT_CSRF_COOKIE_NAME,
  TENANT_CSRF_HEADER_NAME,
} from "@/lib/auth/constants";
import {
  isSecureEnvironment,
  sanitizeReturnPath,
  encodeStateEnvelope,
  decodeStateEnvelope,
  generateCsrfToken,
  verifyCsrfToken,
  verifySameOrigin,
  getSessionCookieOptions,
  getOidcStateCookieOptions,
  getCsrfCookieOptions,
} from "@/lib/auth/session";
import { API_URL } from "@/lib/api-client";

export const dynamic = "force-dynamic";

function validateCsrfAndOrigin(request: NextRequest): NextResponse | null {
  if (!verifySameOrigin(request)) {
    return NextResponse.json(
      {
        error: "CSRF_ORIGIN_INVALID",
        message: "Origin validation failed for mutation request.",
      },
      { status: 403 },
    );
  }

  const csrfCookie = request.cookies.get(TENANT_CSRF_COOKIE_NAME)?.value;
  const csrfHeader = request.headers.get(TENANT_CSRF_HEADER_NAME);

  if (!verifyCsrfToken(csrfCookie, csrfHeader)) {
    return NextResponse.json(
      {
        error: "CSRF_TOKEN_INVALID",
        message: "CSRF verification failed for mutation request.",
      },
      { status: 403 },
    );
  }

  return null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ auth: string[] }> },
) {
  const { auth = [] } = await context.params;
  const actionPath = auth.join("/");

  // 1. /api/auth/tenant/login or /api/auth/login
  if (actionPath === "tenant/login" || actionPath === "login") {
    const rawReturnUrl =
      request.nextUrl.searchParams.get("redirect_uri") ||
      request.nextUrl.searchParams.get("return_url") ||
      "/";
    const tenantId = request.nextUrl.searchParams.get("tenant_id") || "";
    const returnUrl = sanitizeReturnPath(rawReturnUrl, request.nextUrl.origin);

    const callbackUrl = `${request.nextUrl.origin}/api/auth/tenant/callback`;
    const backendUrl = new URL(`${API_URL}/api/auth/tenant/login`);
    backendUrl.searchParams.set("redirect_uri", callbackUrl);
    if (tenantId) {
      backendUrl.searchParams.set("tenant_id", tenantId);
    }

    try {
      const res = await fetch(backendUrl.toString(), {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      const payload = (data && data.data) ? data.data : data;

      const authorizationUrl = payload?.authorizationUrl;
      const stateToken = payload?.stateToken ?? payload?.state;

      if (
        !res.ok ||
        !authorizationUrl ||
        typeof authorizationUrl !== "string" ||
        !stateToken ||
        typeof stateToken !== "string" ||
        stateToken.trim().length === 0
      ) {
        return NextResponse.json(
          {
            error: data?.error?.code || "AUTH_LOGIN_FAILED",
            message:
              data?.error?.message ||
              "Could not generate tenant login URL or missing API-issued state token",
          },
          { status: res.status && res.status >= 400 ? res.status : 500 },
        );
      }

      const stateEnvelope = encodeStateEnvelope({
        stateToken: stateToken.trim(),
        returnUrl,
      });

      const redirectRes = NextResponse.redirect(authorizationUrl);
      const isSecure = isSecureEnvironment(request);
      redirectRes.cookies.set(
        TENANT_OIDC_STATE_COOKIE_NAME,
        stateEnvelope,
        getOidcStateCookieOptions(isSecure),
      );
      return redirectRes;
    } catch (error) {
      return NextResponse.json(
        {
          error: "AUTH_LOGIN_UNAVAILABLE",
          message: error instanceof Error ? error.message : "Upstream authentication service unavailable",
        },
        { status: 503 },
      );
    }
  }

  // 2. /api/auth/tenant/callback or /api/auth/callback
  if (actionPath === "tenant/callback" || actionPath === "callback") {
    const code = request.nextUrl.searchParams.get("code")?.trim() || "";
    const state = request.nextUrl.searchParams.get("state")?.trim() || "";
    const stateCookie = request.cookies.get(TENANT_OIDC_STATE_COOKIE_NAME)?.value;

    if (!code) {
      return NextResponse.json(
        {
          error: "AUTH_SESSION_EXCHANGE_DENIED",
          message: "Authorization code is required in callback query parameters.",
        },
        { status: 400 },
      );
    }

    if (!state) {
      return NextResponse.json(
        {
          error: "AUTH_SESSION_EXCHANGE_DENIED",
          message: "Authorization state is required in callback query parameters.",
        },
        { status: 400 },
      );
    }

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

    const statePayload = decodeStateEnvelope(stateCookie);
    if (!statePayload || !statePayload.stateToken) {
      return NextResponse.json(
        {
          error: "AUTH_SESSION_EXCHANGE_DENIED",
          message: "OIDC state envelope is invalid or expired.",
        },
        { status: 400 },
      );
    }

    const { stateToken, returnUrl, codeVerifier } = statePayload;

    if (state !== stateToken) {
      const loginUrl = new URL("/login", request.nextUrl.origin);
      loginUrl.searchParams.set("error", "AUTH_STATE_MISMATCH");
      loginUrl.searchParams.set("message", "State token does not match authorization state");
      return NextResponse.redirect(loginUrl);
    }

    const callbackUrl = `${request.nextUrl.origin}/api/auth/tenant/callback`;

    try {
      const exchangeRes = await fetch(
        `${API_URL}/api/auth/tenant/callback-session`,
        {
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
            ...(codeVerifier ? { codeVerifier } : {}),
          }),
          cache: "no-store",
        },
      );

      const data = await exchangeRes.json().catch(() => null);
      const payload = (data && data.data) ? data.data : data;
      const accessToken = payload?.sessionToken ?? payload?.accessToken ?? payload?.token;

      if (!exchangeRes.ok || !accessToken) {
        return NextResponse.json(
          {
            error: data?.error?.code || "AUTH_SESSION_EXCHANGE_DENIED",
            message: data?.error?.message || "OIDC session exchange failed",
          },
          { status: exchangeRes.status || 400 },
        );
      }

      const csrfToken = generateCsrfToken();
      const targetRedirect = sanitizeReturnPath(
        returnUrl,
        request.nextUrl.origin,
      );
      const isSecure = isSecureEnvironment(request);

      const response = NextResponse.redirect(
        new URL(targetRedirect, request.nextUrl.origin),
      );

      response.cookies.set(
        TENANT_SESSION_COOKIE_NAME,
        accessToken,
        getSessionCookieOptions(isSecure),
      );

      response.cookies.set(
        TENANT_CSRF_COOKIE_NAME,
        csrfToken,
        getCsrfCookieOptions(isSecure),
      );

      response.cookies.set(TENANT_OIDC_STATE_COOKIE_NAME, "", {
        ...getOidcStateCookieOptions(isSecure),
        maxAge: 0,
        expires: new Date(0),
      });

      return response;
    } catch (error) {
      return NextResponse.json(
        {
          error: "AUTH_CALLBACK_UNAVAILABLE",
          message: error instanceof Error ? error.message : "Authentication callback service unavailable",
        },
        { status: 503 },
      );
    }
  }

  // 3. /api/auth/session
  if (actionPath === "session") {
    const token = request.cookies.get(TENANT_SESSION_COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.json(
        { active: false, error: "AUTHENTICATION_REQUIRED" },
        { status: 401 },
      );
    }

    try {
      const sessionRes = await fetch(`${API_URL}/api/auth/session`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data =
        typeof sessionRes.json === "function"
          ? await sessionRes.json().catch(() => null)
          : null;

      if (!sessionRes.ok) {
        const isSecure = isSecureEnvironment(request);
        const response = NextResponse.json(
          { active: false, error: "AUTHENTICATION_REQUIRED", upstream: data },
          { status: 401 },
        );
        response.cookies.set(TENANT_SESSION_COOKIE_NAME, "", {
          ...getSessionCookieOptions(isSecure),
          maxAge: 0,
          expires: new Date(0),
        });
        response.cookies.set(TENANT_CSRF_COOKIE_NAME, "", {
          ...getCsrfCookieOptions(isSecure),
          maxAge: 0,
          expires: new Date(0),
        });
        return response;
      }

      return NextResponse.json(data ?? { active: true }, { status: 200 });
    } catch (error) {
      return NextResponse.json(
        {
          active: false,
          error: "AUTH_UPSTREAM_UNAVAILABLE",
          message: error instanceof Error ? error.message : "Upstream session check failed",
        },
        { status: 503 },
      );
    }
  }

  return NextResponse.json(
    { error: "AUTH_ENDPOINT_NOT_FOUND" },
    { status: 404 },
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ auth: string[] }> },
) {
  const { auth = [] } = await context.params;
  const actionPath = auth.join("/");

  // 1. /api/auth/logout
  if (actionPath === "logout") {
    const csrfError = validateCsrfAndOrigin(request);
    if (csrfError) return csrfError;

    const token = request.cookies.get(TENANT_SESSION_COOKIE_NAME)?.value;
    const isSecure = isSecureEnvironment(request);

    if (token) {
      try {
        await fetch(`${API_URL}/api/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          cache: "no-store",
        });
      } catch {
        // Ignore upstream network failures on logout so cookies are still cleared
      }
    }

    const response = NextResponse.json(
      { success: true, message: "Logged out successfully." },
      { status: 200 },
    );

    response.cookies.set(TENANT_SESSION_COOKIE_NAME, "", {
      ...getSessionCookieOptions(isSecure),
      maxAge: 0,
      expires: new Date(0),
    });
    response.cookies.set(TENANT_CSRF_COOKIE_NAME, "", {
      ...getCsrfCookieOptions(isSecure),
      maxAge: 0,
      expires: new Date(0),
    });
    response.cookies.set(TENANT_OIDC_STATE_COOKIE_NAME, "", {
      ...getOidcStateCookieOptions(isSecure),
      maxAge: 0,
      expires: new Date(0),
    });

    return response;
  }

  // 2. /api/auth/logout-all
  if (actionPath === "logout-all") {
    const csrfError = validateCsrfAndOrigin(request);
    if (csrfError) return csrfError;

    const token = request.cookies.get(TENANT_SESSION_COOKIE_NAME)?.value;
    const isSecure = isSecureEnvironment(request);

    if (token) {
      try {
        await fetch(`${API_URL}/api/auth/logout-all`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          cache: "no-store",
        });
      } catch {
        // Ignore upstream errors
      }
    }

    const response = NextResponse.json(
      { success: true, message: "All sessions terminated." },
      { status: 200 },
    );

    response.cookies.set(TENANT_SESSION_COOKIE_NAME, "", {
      ...getSessionCookieOptions(isSecure),
      maxAge: 0,
      expires: new Date(0),
    });
    response.cookies.set(TENANT_CSRF_COOKIE_NAME, "", {
      ...getCsrfCookieOptions(isSecure),
      maxAge: 0,
      expires: new Date(0),
    });
    response.cookies.set(TENANT_OIDC_STATE_COOKIE_NAME, "", {
      ...getOidcStateCookieOptions(isSecure),
      maxAge: 0,
      expires: new Date(0),
    });

    return response;
  }

  return NextResponse.json(
    { error: "AUTH_ENDPOINT_NOT_FOUND" },
    { status: 404 },
  );
}
