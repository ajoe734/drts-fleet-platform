import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * PWD-LOGIN-009: password-login, password-reset and TOTP forwarding for the
 * partner realm (SA/SD §4/§6/§7). Fleet's BFF route is independent of
 * @drts/tenant-auth (it never depended on that package, and adding the
 * dependency now would touch pnpm-lock.yaml, which is outside this task's
 * write_scopes), so this mirrors packages/tenant-auth/src/credential-handlers.ts
 * for the partner realm instead of importing it.
 *
 * Not forwarded here (no corresponding apps/api endpoint exists): adding a
 * password credential to an already-Google-only partner account, changing a
 * password without a reset token, regenerating recovery codes, and partner
 * invitation accept-with-password (that belongs to FLEET-ONB-004).
 */
export interface FleetCredentialConfig {
  sessionCookieName: string;
  csrfCookieName: string;
  csrfHeaderName?: string;
  /** Relative-path fetch, matching this file's existing apiFetch(path, init). */
  apiFetch: (
    path: string,
    init?: Omit<RequestInit, "headers"> & { headers?: Record<string, string> },
  ) => Promise<Response>;
  isSecureEnvironment: (request: NextRequest) => boolean;
  verifySameOrigin: (request: NextRequest) => boolean;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function unwrap(value: unknown): JsonRecord | null {
  const envelope = record(value);
  return record(envelope?.data) ?? envelope;
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

function requireCsrfAndOrigin(
  request: NextRequest,
  config: FleetCredentialConfig,
): NextResponse | null {
  if (!config.verifySameOrigin(request)) {
    return NextResponse.json(
      {
        error: "CSRF_ORIGIN_INVALID",
        message: "Origin validation failed for mutation request.",
      },
      { status: 403 },
    );
  }
  const csrfCookie = request.cookies.get(config.csrfCookieName)?.value ?? "";
  const csrfHeader =
    request.headers.get(config.csrfHeaderName ?? "x-csrf-token") ?? "";
  const cookieBuf = Buffer.from(csrfCookie);
  const headerBuf = Buffer.from(csrfHeader);
  const csrfOk =
    cookieBuf.length > 0 &&
    cookieBuf.length === headerBuf.length &&
    timingSafeEqual(cookieBuf, headerBuf);
  if (!csrfOk) {
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
  config: FleetCredentialConfig,
): string | null {
  return request.cookies.get(config.sessionCookieName)?.value ?? null;
}

/** `POST /api/auth/partner/password-login`. */
export async function handlePartnerPasswordLogin(
  request: NextRequest,
  config: FleetCredentialConfig,
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
  if (!email || !password) {
    return NextResponse.json(
      {
        error: "AUTH_PASSWORD_LOGIN_INVALID",
        message: "Email and password are required.",
      },
      { status: 400 },
    );
  }
  const partnerId = process.env.DRTS_FLEET_PARTNER_ID?.trim() || "";
  if (!partnerId) {
    return NextResponse.json(
      {
        error: "FLEET_SELECTOR_REQUIRED",
        message: "Missing fleet scope configuration: DRTS_FLEET_PARTNER_ID is required.",
      },
      { status: 503 },
    );
  }
  try {
    const upstream = await config.apiFetch("/api/auth/partner/password-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        partnerId,
        ...(totpCode ? { totpCode } : {}),
        ...(recoveryCode ? { recoveryCode } : {}),
      }),
    });
    const data = await upstream.json().catch(() => null);
    const payload = unwrap(data);
    const accessToken =
      typeof payload?.access_token === "string" ? payload.access_token : null;
    if (!upstream.ok || !accessToken) {
      return relay(data, upstream.status || 401);
    }
    const isSecure = config.isSecureEnvironment(request);
    const response = NextResponse.json({ authenticated: true }, { status: 200 });
    response.cookies.set(config.sessionCookieName, accessToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      maxAge: 8 * 60 * 60,
      path: "/",
    });
    response.cookies.set(
      config.csrfCookieName,
      randomBytes(32).toString("base64url"),
      {
        httpOnly: false,
        secure: isSecure,
        sameSite: "lax",
        maxAge: 8 * 60 * 60,
        path: "/",
      },
    );
    return response;
  } catch (error) {
    return unavailable(error, "AUTH_PASSWORD_LOGIN_UNAVAILABLE");
  }
}

/** `POST /api/auth/partner/password-reset/request`. */
export async function handlePartnerPasswordResetRequest(
  request: NextRequest,
  config: FleetCredentialConfig,
): Promise<NextResponse> {
  const body = await request.json().catch(() => null);
  const email =
    typeof body?.email === "string" && body.email.trim()
      ? body.email.trim()
      : undefined;
  try {
    const upstream = await config.apiFetch("/api/auth/partner/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await upstream.json().catch(() => null);
    return relay(data ?? { accepted: true }, upstream.status || 200);
  } catch (error) {
    return unavailable(error, "AUTH_PASSWORD_RESET_UNAVAILABLE");
  }
}

/** `POST /api/auth/partner/password-reset/confirm`. */
export async function handlePartnerPasswordResetConfirm(
  request: NextRequest,
  config: FleetCredentialConfig,
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
    const upstream = await config.apiFetch("/api/auth/partner/password-reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await upstream.json().catch(() => null);
    return relay(data, upstream.status || 400);
  } catch (error) {
    return unavailable(error, "AUTH_PASSWORD_RESET_UNAVAILABLE");
  }
}

/** `POST /api/auth/partner/mfa/totp/enroll`. Requires a live session. */
export async function handlePartnerTotpEnroll(
  request: NextRequest,
  config: FleetCredentialConfig,
): Promise<NextResponse> {
  const csrfError = requireCsrfAndOrigin(request, config);
  if (csrfError) return csrfError;
  const token = requireSessionToken(request, config);
  if (!token) {
    return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  }
  try {
    const upstream = await config.apiFetch("/api/auth/partner/mfa/totp/enroll", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    const data = await upstream.json().catch(() => null);
    return relay(data, upstream.status || 502);
  } catch (error) {
    return unavailable(error, "AUTH_TOTP_ENROLL_UNAVAILABLE");
  }
}

/** `POST /api/auth/partner/mfa/totp/confirm`. Requires a live session. */
export async function handlePartnerTotpConfirm(
  request: NextRequest,
  config: FleetCredentialConfig,
): Promise<NextResponse> {
  const csrfError = requireCsrfAndOrigin(request, config);
  if (csrfError) return csrfError;
  const token = requireSessionToken(request, config);
  if (!token) {
    return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!code) {
    return NextResponse.json(
      { error: "AUTH_TOTP_CONFIRM_INVALID", message: "A verification code is required." },
      { status: 400 },
    );
  }
  try {
    const upstream = await config.apiFetch("/api/auth/partner/mfa/totp/confirm", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await upstream.json().catch(() => null);
    return relay(data, upstream.status || 400);
  } catch (error) {
    return unavailable(error, "AUTH_TOTP_CONFIRM_UNAVAILABLE");
  }
}

/** `GET /api/auth/sessions` (self-service session inventory, not realm-prefixed). */
export async function handlePartnerListSessions(
  request: NextRequest,
  config: FleetCredentialConfig,
): Promise<NextResponse> {
  const token = requireSessionToken(request, config);
  if (!token) {
    return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  }
  try {
    const upstream = await config.apiFetch("/api/auth/sessions", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await upstream.json().catch(() => null);
    return relay(data, upstream.status || 502);
  } catch (error) {
    return unavailable(error, "AUTH_SESSIONS_UNAVAILABLE");
  }
}

/** `POST /api/auth/sessions/:sid/revoke` (not realm-prefixed). */
export async function handlePartnerRevokeSession(
  request: NextRequest,
  sessionId: string,
  config: FleetCredentialConfig,
): Promise<NextResponse> {
  const csrfError = requireCsrfAndOrigin(request, config);
  if (csrfError) return csrfError;
  const token = requireSessionToken(request, config);
  if (!token) {
    return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  try {
    const upstream = await config.apiFetch(
      `/api/auth/sessions/${encodeURIComponent(sessionId)}/revoke`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: typeof body?.reason === "string" ? body.reason : "user_initiated",
        }),
      },
    );
    const data = await upstream.json().catch(() => null);
    return relay(data, upstream.status || 502);
  } catch (error) {
    return unavailable(error, "AUTH_SESSION_REVOKE_UNAVAILABLE");
  }
}
