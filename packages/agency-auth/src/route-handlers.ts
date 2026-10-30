import { NextRequest, NextResponse } from "next/server";
import {
  tenantAuthFetch as agencyAuthFetch,
  resolveTenantApiUrl as resolveApiUrl,
} from "@drts/tenant-auth/api-fetch";
import {
  decodeStateEnvelope,
  encodeStateEnvelope,
  generateCsrfToken,
  getCsrfCookieOptions,
  getOidcStateCookieOptions,
  getSessionCookieOptions,
  isSecureEnvironment,
  sanitizeReturnPath,
  verifyCsrfToken,
  verifySameOrigin,
} from "@drts/tenant-auth/session";

import {
  AGENCY_AUTH_CALLBACK_PATH,
  AGENCY_CSRF_COOKIE_NAME,
  AGENCY_CSRF_HEADER_NAME,
  AGENCY_OIDC_STATE_COOKIE_NAME,
  AGENCY_PROFILE_COOKIE_NAME,
  AGENCY_SESSION_COOKIE_NAME,
} from "./constants";
import { verifyAgencySession } from "./verified-agency-session.server";

type AuthRouteContext = { params: Promise<{ auth: string[] }> };

function expired<T extends object>(options: T) {
  return { ...options, maxAge: 0, expires: new Date(0) };
}

function clearAgencyCookies(response: NextResponse, isSecure: boolean) {
  response.cookies.set(
    AGENCY_SESSION_COOKIE_NAME,
    "",
    expired(getSessionCookieOptions(isSecure)),
  );
  response.cookies.set(
    AGENCY_CSRF_COOKIE_NAME,
    "",
    expired(getCsrfCookieOptions(isSecure)),
  );
  response.cookies.set(
    AGENCY_OIDC_STATE_COOKIE_NAME,
    "",
    expired(getOidcStateCookieOptions(isSecure)),
  );
  response.cookies.set(
    AGENCY_PROFILE_COOKIE_NAME,
    "",
    expired(getSessionCookieOptions(isSecure)),
  );
}

/** Display-only fields of the API session response; never used for authorization. */
export function encodeAgencyProfile(payload: unknown): string | null {
  const record = (payload ?? {}) as {
    agency?: { agency_id?: unknown; display_name?: unknown };
    role_code?: unknown;
    access_valid_to?: unknown;
  };
  const text = (value: unknown) =>
    typeof value === "string" && value.trim()
      ? value.trim().slice(0, 255)
      : null;
  const profile = {
    agencyId: text(record.agency?.agency_id),
    agencyDisplayName: text(record.agency?.display_name),
    roleCode: text(record.role_code),
    accessValidTo: text(record.access_valid_to),
  };
  return profile.agencyId
    ? Buffer.from(JSON.stringify(profile), "utf8").toString("base64url")
    : null;
}

export function decodeAgencyProfile(value: string | null | undefined): {
  agencyId: string | null;
  agencyDisplayName: string | null;
  roleCode: string | null;
  accessValidTo: string | null;
} | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    const text = (entry: unknown) =>
      typeof entry === "string" && entry.trim() ? entry : null;
    return {
      agencyId: text(parsed.agencyId),
      agencyDisplayName: text(parsed.agencyDisplayName),
      roleCode: text(parsed.roleCode),
      accessValidTo: text(parsed.accessValidTo),
    };
  } catch {
    return null;
  }
}

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
  const csrfCookie = request.cookies.get(AGENCY_CSRF_COOKIE_NAME)?.value;
  const csrfHeader = request.headers.get(AGENCY_CSRF_HEADER_NAME);
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

async function startLogin(request: NextRequest) {
  const rawReturnUrl =
    request.nextUrl.searchParams.get("redirect_uri") ||
    request.nextUrl.searchParams.get("return_url") ||
    "/";
  const returnUrl = sanitizeReturnPath(rawReturnUrl, request.nextUrl.origin);
  const callbackUrl = `${request.nextUrl.origin}${AGENCY_AUTH_CALLBACK_PATH}`;
  const invitationToken = request.nextUrl.searchParams.get("token")?.trim();
  const agencyId = request.nextUrl.searchParams.get("agency_id")?.trim();

  try {
    let res: Response;
    if (invitationToken) {
      res = await agencyAuthFetch(
        `${resolveApiUrl()}/api/auth/agency/invitation-login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invitationToken,
            redirectUri: callbackUrl,
            ...(agencyId ? { agencyId } : {}),
          }),
        },
      );
    } else {
      const backendUrl = new URL(`${resolveApiUrl()}/api/auth/agency/login`);
      backendUrl.searchParams.set("redirect_uri", callbackUrl);
      res = await agencyAuthFetch(backendUrl.toString(), { cache: "no-store" });
    }
    const data = await res.json().catch(() => null);
    const payload = data && data.data ? data.data : data;
    const authorizationUrl = payload?.authorization_url;
    const stateToken = payload?.state_token;
    const oauthState = payload?.state;

    if (
      !res.ok ||
      typeof authorizationUrl !== "string" ||
      typeof stateToken !== "string" ||
      stateToken.trim().length === 0
    ) {
      return NextResponse.json(
        {
          error: data?.error?.code || "AUTH_LOGIN_FAILED",
          message:
            data?.error?.message ||
            "Could not generate agency login URL or missing API-issued state token",
        },
        { status: res.status && res.status >= 400 ? res.status : 500 },
      );
    }

    const redirectRes = NextResponse.redirect(authorizationUrl);
    redirectRes.headers.set("Referrer-Policy", "no-referrer");
    redirectRes.headers.set("Cache-Control", "no-store");
    redirectRes.cookies.set(
      AGENCY_OIDC_STATE_COOKIE_NAME,
      encodeStateEnvelope({
        stateToken: stateToken.trim(),
        state: typeof oauthState === "string" ? oauthState.trim() : undefined,
        returnUrl,
      }),
      getOidcStateCookieOptions(isSecureEnvironment(request)),
    );
    return redirectRes;
  } catch {
    return NextResponse.json(
      {
        error: "AUTH_LOGIN_UNAVAILABLE",
        message: "Upstream authentication service unavailable",
      },
      { status: 503 },
    );
  }
}

async function completeCallback(
  request: NextRequest,
  loginFailurePath: string,
) {
  const code = request.nextUrl.searchParams.get("code")?.trim() || "";
  const state = request.nextUrl.searchParams.get("state")?.trim() || "";
  const stateCookie = request.cookies.get(AGENCY_OIDC_STATE_COOKIE_NAME)?.value;
  const deny = (message: string) =>
    NextResponse.json(
      { error: "AUTH_SESSION_EXCHANGE_DENIED", message },
      { status: 400 },
    );

  if (!code) return deny("Authorization code is required.");
  if (!state) return deny("Authorization state is required.");
  if (!stateCookie) {
    return deny("OIDC state cookie missing or expired.");
  }
  const statePayload = decodeStateEnvelope(stateCookie);
  if (!statePayload?.stateToken) {
    return deny("OIDC state envelope is invalid or expired.");
  }
  const { stateToken, returnUrl } = statePayload;
  if (state !== (statePayload.state || stateToken)) {
    const loginUrl = new URL(loginFailurePath, request.nextUrl.origin);
    loginUrl.searchParams.set("error", "AUTH_STATE_MISMATCH");
    return NextResponse.redirect(loginUrl);
  }

  try {
    const exchangeRes = await agencyAuthFetch(
      `${resolveApiUrl()}/api/auth/agency/callback-session`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-oidc-state-token": stateToken,
        },
        body: JSON.stringify({
          provider: "oidc",
          callbackUrl: `${request.nextUrl.origin}${AGENCY_AUTH_CALLBACK_PATH}`,
          code,
          state,
        }),
        cache: "no-store",
      },
    );
    const data = await exchangeRes.json().catch(() => null);
    const payload = data && data.data ? data.data : data;
    const accessToken = payload?.access_token;
    if (!exchangeRes.ok || typeof accessToken !== "string" || !accessToken) {
      const loginUrl = new URL(loginFailurePath, request.nextUrl.origin);
      loginUrl.searchParams.set(
        "error",
        data?.error?.code || "AUTH_SESSION_EXCHANGE_DENIED",
      );
      const failure = NextResponse.redirect(loginUrl);
      failure.cookies.set(
        AGENCY_OIDC_STATE_COOKIE_NAME,
        "",
        expired(getOidcStateCookieOptions(isSecureEnvironment(request))),
      );
      return failure;
    }

    const isSecure = isSecureEnvironment(request);
    const response = NextResponse.redirect(
      new URL(
        sanitizeReturnPath(returnUrl, request.nextUrl.origin),
        request.nextUrl.origin,
      ),
    );
    response.cookies.set(
      AGENCY_SESSION_COOKIE_NAME,
      accessToken,
      getSessionCookieOptions(isSecure),
    );
    response.cookies.set(
      AGENCY_CSRF_COOKIE_NAME,
      generateCsrfToken(),
      getCsrfCookieOptions(isSecure),
    );
    const profile = encodeAgencyProfile(payload);
    if (profile) {
      response.cookies.set(
        AGENCY_PROFILE_COOKIE_NAME,
        profile,
        getSessionCookieOptions(isSecure),
      );
    }
    response.cookies.set(
      AGENCY_OIDC_STATE_COOKIE_NAME,
      "",
      expired(getOidcStateCookieOptions(isSecure)),
    );
    return response;
  } catch {
    return NextResponse.json(
      {
        error: "AUTH_CALLBACK_UNAVAILABLE",
        message: "Authentication callback service unavailable",
      },
      { status: 503 },
    );
  }
}

async function readSession(request: NextRequest) {
  const token = request.cookies.get(AGENCY_SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json(
      { active: false, error: "AUTHENTICATION_REQUIRED" },
      { status: 401 },
    );
  }
  try {
    const {
      response: sessionRes,
      body,
      session,
    } = await verifyAgencySession(token, resolveApiUrl());
    if (!sessionRes.ok || !session) {
      const response = NextResponse.json(
        { active: false, error: "AUTHENTICATION_REQUIRED" },
        { status: 401 },
      );
      clearAgencyCookies(response, isSecureEnvironment(request));
      return response;
    }
    return NextResponse.json(body ?? { active: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { active: false, error: "AUTH_UPSTREAM_UNAVAILABLE" },
      { status: 503 },
    );
  }
}

async function getAuth(
  request: NextRequest,
  context: AuthRouteContext,
  loginFailurePath: string,
) {
  const { auth = [] } = await context.params;
  const actionPath = auth.join("/");
  if (actionPath === "agency/login" || actionPath === "login") {
    return startLogin(request);
  }
  if (actionPath === "agency/callback" || actionPath === "callback") {
    return completeCallback(request, loginFailurePath);
  }
  if (actionPath === "session") {
    return readSession(request);
  }
  return NextResponse.json(
    { error: "AUTH_ENDPOINT_NOT_FOUND" },
    { status: 404 },
  );
}

async function postAuth(request: NextRequest, context: AuthRouteContext) {
  const { auth = [] } = await context.params;
  const actionPath = auth.join("/");
  if (actionPath !== "logout" && actionPath !== "logout-all") {
    return NextResponse.json(
      { error: "AUTH_ENDPOINT_NOT_FOUND" },
      { status: 404 },
    );
  }
  const csrfError = validateCsrfAndOrigin(request);
  if (csrfError) return csrfError;

  const token = request.cookies.get(AGENCY_SESSION_COOKIE_NAME)?.value;
  const isSecure = isSecureEnvironment(request);
  if (token) {
    try {
      const revoked = await agencyAuthFetch(
        `${resolveApiUrl()}/api/auth/${actionPath}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          cache: "no-store",
        },
      );
      if (actionPath === "logout-all" && !revoked.ok) {
        throw new Error("Session revocation failed.");
      }
    } catch {
      if (actionPath === "logout-all") {
        // Keep the current session so the user can retry global revocation.
        return NextResponse.json(
          { error: "AUTH_LOGOUT_ALL_UNAVAILABLE" },
          { status: 503 },
        );
      }
      // A single logout still clears the local cookies.
    }
  }
  const response = NextResponse.json({ success: true }, { status: 200 });
  clearAgencyCookies(response, isSecure);
  return response;
}

/** Agency host BFF: PKCE login/invitation, callback, session and logout. */
export function createAgencyAuthHandlers(loginFailurePath = "/login") {
  return {
    GET: (request: NextRequest, context: AuthRouteContext) =>
      getAuth(request, context, loginFailurePath),
    POST: postAuth,
  };
}
