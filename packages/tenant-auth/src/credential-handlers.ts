import { NextRequest, NextResponse } from "next/server";

import {
  generateCsrfToken,
  getCsrfCookieOptions,
  getSessionCookieOptions,
  isSecureEnvironment,
  verifyCsrfToken,
  verifySameOrigin,
} from "./session";

/**
 * PWD-LOGIN-009: realm-parameterized BFF forwarders for the password-login,
 * password-reset, TOTP enrollment and self-service session endpoints added by
 * PWD-LOGIN-005..008. Shared by the tenant and agency BFF route handlers,
 * which differ only in cookie names and realm value (SA/SD §9).
 *
 * Deliberately NOT forwarded here (no corresponding apps/api endpoint
 * exists): adding a password credential to an already-Google-only account
 * and changing a password without a reset token. Building UI for those
 * would call a route that 404s.
 */
export type PortalCredentialRealm = "tenant" | "agency" | "partner";

type JsonRecord = Record<string, unknown>;

export interface PortalCredentialConfig {
  realm: PortalCredentialRealm;
  sessionCookieName: string;
  csrfCookieName: string;
  csrfHeaderName?: string;
  apiBaseUrl: string;
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;
  /**
   * Invoked once, synchronously, right before a successful password-login
   * response is sent, so a realm can mirror whatever extra display-only
   * cookie its own OIDC callback already sets (e.g. the agency profile
   * cookie). Must not read or persist the raw password or access token.
   */
  onPasswordLoginSuccess?: (
    response: NextResponse,
    payload: JsonRecord,
    isSecure: boolean,
  ) => void;
}

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function unwrap(value: unknown): JsonRecord | null {
  const envelope = record(value);
  return record(envelope?.data) ?? envelope;
}

function requireCsrfAndOrigin(
  request: NextRequest,
  config: PortalCredentialConfig,
): NextResponse | null {
  if (!verifySameOrigin(request)) {
    return NextResponse.json(
      {
        error: "CSRF_ORIGIN_INVALID",
        message: "Origin validation failed for mutation request.",
      },
      { status: 403 },
    );
  }
  const csrfCookie = request.cookies.get(config.csrfCookieName)?.value;
  const csrfHeader = request.headers.get(
    config.csrfHeaderName ?? "x-csrf-token",
  );
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

function requireSessionToken(
  request: NextRequest,
  config: PortalCredentialConfig,
): string | null {
  return request.cookies.get(config.sessionCookieName)?.value ?? null;
}

function relay(data: unknown, status: number): NextResponse {
  return NextResponse.json(data ?? {}, { status });
}

function unavailable(error: unknown, code: string): NextResponse {
  return NextResponse.json(
    {
      error: code,
      message:
        error instanceof Error
          ? error.message
          : "Upstream authentication service unavailable",
    },
    { status: 503 },
  );
}

/** `POST /api/auth/:realm/password-login` (SA/SD §4, §7). */
export async function handlePasswordLogin(
  request: NextRequest,
  config: PortalCredentialConfig,
): Promise<NextResponse> {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const totpCode =
    typeof body?.totpCode === "string" && body.totpCode.trim()
      ? body.totpCode.trim()
      : undefined;
  const recoveryCode =
    typeof body?.recoveryCode === "string" && body.recoveryCode.trim()
      ? body.recoveryCode.trim()
      : undefined;
  const tenantId =
    typeof body?.tenantId === "string" && body.tenantId.trim()
      ? body.tenantId.trim()
      : undefined;
  const agencyId =
    typeof body?.agencyId === "string" && body.agencyId.trim()
      ? body.agencyId.trim()
      : undefined;
  const partnerId =
    typeof body?.partnerId === "string" && body.partnerId.trim()
      ? body.partnerId.trim()
      : undefined;

  if (!email || !password) {
    return NextResponse.json(
      {
        error: "AUTH_PASSWORD_LOGIN_INVALID",
        message: "Email and password are required.",
      },
      { status: 400 },
    );
  }

  try {
    const upstream = await config.fetchImpl(
      `${config.apiBaseUrl}/api/auth/${config.realm}/password-login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          ...(totpCode ? { totpCode } : {}),
          ...(recoveryCode ? { recoveryCode } : {}),
          ...(tenantId ? { tenantId } : {}),
          ...(agencyId ? { agencyId } : {}),
          ...(partnerId ? { partnerId } : {}),
        }),
        cache: "no-store",
      },
    );
    const data = await upstream.json().catch(() => null);
    const payload = unwrap(data);
    // apps/api applies a global SnakeCaseInterceptor to every response body,
    // so the wire field is access_token even though the service-layer type
    // is camelCase.
    const accessToken =
      typeof payload?.access_token === "string" ? payload.access_token : null;

    if (!upstream.ok || !accessToken) {
      return relay(data, upstream.status || 401);
    }

    const isSecure = isSecureEnvironment(request);
    const response = NextResponse.json(
      { authenticated: true },
      { status: 200 },
    );
    response.cookies.set(
      config.sessionCookieName,
      accessToken,
      getSessionCookieOptions(isSecure),
    );
    response.cookies.set(
      config.csrfCookieName,
      generateCsrfToken(),
      getCsrfCookieOptions(isSecure),
    );
    config.onPasswordLoginSuccess?.(response, payload ?? {}, isSecure);
    return response;
  } catch (error) {
    return unavailable(error, "AUTH_PASSWORD_LOGIN_UNAVAILABLE");
  }
}

/** `POST /api/auth/:realm/password-reset/request` (SA/SD §6). */
export async function handlePasswordResetRequest(
  request: NextRequest,
  config: PortalCredentialConfig,
): Promise<NextResponse> {
  const body = await request.json().catch(() => null);
  const email =
    typeof body?.email === "string" && body.email.trim()
      ? body.email.trim()
      : undefined;
  try {
    const upstream = await config.fetchImpl(
      `${config.apiBaseUrl}/api/auth/${config.realm}/password-reset/request`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        cache: "no-store",
      },
    );
    const data = await upstream.json().catch(() => null);
    return relay(data ?? { accepted: true }, upstream.status || 200);
  } catch (error) {
    return unavailable(error, "AUTH_PASSWORD_RESET_UNAVAILABLE");
  }
}

/** `POST /api/auth/:realm/password-reset/confirm` (SA/SD §6). */
export async function handlePasswordResetConfirm(
  request: NextRequest,
  config: PortalCredentialConfig,
): Promise<NextResponse> {
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!token || !password) {
    return NextResponse.json(
      {
        error: "AUTH_PASSWORD_RESET_INVALID",
        message: "A reset token and new password are required.",
      },
      { status: 400 },
    );
  }
  try {
    const upstream = await config.fetchImpl(
      `${config.apiBaseUrl}/api/auth/${config.realm}/password-reset/confirm`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
        cache: "no-store",
      },
    );
    const data = await upstream.json().catch(() => null);
    return relay(data, upstream.status || 400);
  } catch (error) {
    return unavailable(error, "AUTH_PASSWORD_RESET_UNAVAILABLE");
  }
}

/** `POST /api/auth/:realm/mfa/totp/enroll` (SA/SD §7). Requires a live session. */
export async function handleTotpEnroll(
  request: NextRequest,
  config: PortalCredentialConfig,
): Promise<NextResponse> {
  const csrfError = requireCsrfAndOrigin(request, config);
  if (csrfError) return csrfError;
  const token = requireSessionToken(request, config);
  if (!token) {
    return NextResponse.json(
      { error: "AUTHENTICATION_REQUIRED" },
      { status: 401 },
    );
  }
  try {
    const upstream = await config.fetchImpl(
      `${config.apiBaseUrl}/api/auth/${config.realm}/mfa/totp/enroll`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      },
    );
    const data = await upstream.json().catch(() => null);
    return relay(data, upstream.status || 502);
  } catch (error) {
    return unavailable(error, "AUTH_TOTP_ENROLL_UNAVAILABLE");
  }
}

/** `POST /api/auth/:realm/mfa/totp/confirm` (SA/SD §7). Requires a live session. */
export async function handleTotpConfirm(
  request: NextRequest,
  config: PortalCredentialConfig,
): Promise<NextResponse> {
  const csrfError = requireCsrfAndOrigin(request, config);
  if (csrfError) return csrfError;
  const token = requireSessionToken(request, config);
  if (!token) {
    return NextResponse.json(
      { error: "AUTHENTICATION_REQUIRED" },
      { status: 401 },
    );
  }
  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!code) {
    return NextResponse.json(
      {
        error: "AUTH_TOTP_CONFIRM_INVALID",
        message: "A verification code is required.",
      },
      { status: 400 },
    );
  }
  try {
    const upstream = await config.fetchImpl(
      `${config.apiBaseUrl}/api/auth/${config.realm}/mfa/totp/confirm`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
        cache: "no-store",
      },
    );
    const data = await upstream.json().catch(() => null);
    return relay(data, upstream.status || 400);
  } catch (error) {
    return unavailable(error, "AUTH_TOTP_CONFIRM_UNAVAILABLE");
  }
}

/** `POST /api/auth/:realm/mfa/totp/recovery-codes/regenerate` (SA/SD §7, §9). Requires a live session. */
export async function handleTotpRegenerateRecoveryCodes(
  request: NextRequest,
  config: PortalCredentialConfig,
): Promise<NextResponse> {
  const csrfError = requireCsrfAndOrigin(request, config);
  if (csrfError) return csrfError;
  const token = requireSessionToken(request, config);
  if (!token) {
    return NextResponse.json(
      { error: "AUTHENTICATION_REQUIRED" },
      { status: 401 },
    );
  }
  try {
    const upstream = await config.fetchImpl(
      `${config.apiBaseUrl}/api/auth/${config.realm}/mfa/totp/recovery-codes/regenerate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      },
    );
    const data = await upstream.json().catch(() => null);
    return relay(data, upstream.status || 502);
  } catch (error) {
    return unavailable(error, "AUTH_TOTP_RECOVERY_REGENERATE_UNAVAILABLE");
  }
}

/** `GET /api/auth/sessions` (self-service session inventory, not realm-prefixed). */
export async function handleListSessions(
  request: NextRequest,
  config: PortalCredentialConfig,
): Promise<NextResponse> {
  const token = requireSessionToken(request, config);
  if (!token) {
    return NextResponse.json(
      { error: "AUTHENTICATION_REQUIRED" },
      { status: 401 },
    );
  }
  try {
    const upstream = await config.fetchImpl(
      `${config.apiBaseUrl}/api/auth/sessions`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const data = await upstream.json().catch(() => null);
    return relay(data, upstream.status || 502);
  } catch (error) {
    return unavailable(error, "AUTH_SESSIONS_UNAVAILABLE");
  }
}

/** `POST /api/auth/sessions/:sid/revoke` (not realm-prefixed). */
export async function handleRevokeSession(
  request: NextRequest,
  sessionId: string,
  config: PortalCredentialConfig,
): Promise<NextResponse> {
  const csrfError = requireCsrfAndOrigin(request, config);
  if (csrfError) return csrfError;
  const token = requireSessionToken(request, config);
  if (!token) {
    return NextResponse.json(
      { error: "AUTHENTICATION_REQUIRED" },
      { status: 401 },
    );
  }
  const body = await request.json().catch(() => ({}));
  try {
    const upstream = await config.fetchImpl(
      `${config.apiBaseUrl}/api/auth/sessions/${encodeURIComponent(sessionId)}/revoke`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason:
            typeof body?.reason === "string" ? body.reason : "user_initiated",
        }),
        cache: "no-store",
      },
    );
    const data = await upstream.json().catch(() => null);
    return relay(data, upstream.status || 502);
  } catch (error) {
    return unavailable(error, "AUTH_SESSION_REVOKE_UNAVAILABLE");
  }
}
