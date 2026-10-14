import { NextRequest, NextResponse } from "next/server";
import {
  readOAuthBinding,
  sessionFingerprint,
  type OAuthBinding,
} from "../../../../lib/auth/bff-binding";

const DEFAULT_API_BASE_URL = "http://localhost:3001";
const METADATA_IDENTITY_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";
const RUN_APP_HOST_SUFFIX = ".a.run.app";
const REQUEST_HEADER_BLOCKLIST = new Set([
  "connection",
  "content-length",
  "cookie",
  "host",
  "transfer-encoding",
  "x-drts-internal-key",
  "x-drts-google-id-token",
  "x-actor-id",
  "x-actor-type",
  "x-auth-mode",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-port",
  "x-forwarded-proto",
  "x-realm",
  "x-role-families",
  "x-roles",
  "x-scopes",
  "x-serverless-authorization",
  "authorization",
]);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function hasUnsafePathSegment(path: string[]) {
  return path.some((segment) => {
    if (segment.length === 0) return true;
    let current = segment;
    let prev = "";
    let iter = 0;
    while (current !== prev && iter < 10) {
      prev = current;
      try {
        current = decodeURIComponent(current);
      } catch {
        return true;
      }
      iter++;
    }
    return (
      current === "." ||
      current === ".." ||
      current.includes("/") ||
      current.includes("\\") ||
      current.includes("\0")
    );
  });
}

function isAllowedPassengerPath(path: string[], method: string) {
  if (hasUnsafePathSegment(path)) return false;
  const fullPath = path.join("/");
  if (method === "GET" && fullPath === "auth/providers") return true;
  if (method === "POST" && fullPath === "auth/otp/request") return true;
  if (method === "POST" && fullPath === "auth/otp/verify") return true;
  if (
    method === "POST" &&
    path.length === 4 &&
    path[0] === "auth" &&
    path[1] === "oauth"
  ) {
    const provider = path[2];
    const action = path[3];
    if (
      provider &&
      action &&
      ["google", "facebook", "line"].includes(provider) &&
      ["start", "callback"].includes(action)
    ) {
      return true;
    }
  }
  if (method === "POST" && fullPath === "auth/mfa/verify") return true;
  if (method === "POST" && fullPath === "quotes") return true;
  if (method === "POST" && fullPath === "auth/refresh") return true;
  if (method === "POST" && fullPath === "auth/logout") return true;
  if (method === "GET" && fullPath === "me") return true;
  if (method === "PATCH" && fullPath === "me") return true;
  if (method === "DELETE" && fullPath === "me") return true;
  if (method === "GET" && fullPath === "me/identities") return true;
  if (
    method === "DELETE" &&
    path.length === 3 &&
    path[0] === "me" &&
    path[1] === "identities" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(path[2] ?? "")
  ) {
    // me/identities/:id
    return true;
  }
  if (method === "GET" && fullPath === "fares") return true;
  if (method === "GET" && ["settings", "booking-settings"].includes(fullPath))
    return true;
  if (
    path.length === 2 &&
    path[0] === "geo" &&
    ((method === "GET" && path[1] === "search") ||
      (method === "POST" &&
        ["resolve", "reverse", "route"].includes(path[1] ?? "")))
  )
    return true;
  if (["GET", "POST"].includes(method) && fullPath === "rides") return true;
  if (
    path[0] === "rides" &&
    /^[A-Za-z0-9._:-]{1,128}$/.test(path[1] ?? "") &&
    ((method === "GET" && path.length === 2) ||
      (path.length === 3 &&
        ((method === "GET" && ["events", "receipt"].includes(path[2] ?? "")) ||
          (method === "POST" &&
            ["cancel", "ratings"].includes(path[2] ?? "")))))
  )
    return true;
  if (["GET", "POST"].includes(method) && fullPath === "payment-methods")
    return true;
  if (
    path[0] === "payment-methods" &&
    /^[A-Za-z0-9._:-]{1,128}$/.test(path[1] ?? "") &&
    ((method === "DELETE" && path.length === 2) ||
      (method === "PUT" && path.length === 3 && path[2] === "default"))
  )
    return true;
  return false;
}

function resolveTargetOrigin() {
  return process.env.DRTS_API_URL || DEFAULT_API_BASE_URL;
}

function buildTargetUrl(request: NextRequest, path: string[]) {
  const targetUrl = new URL(
    (path[0] === "geo"
      ? ["api", ...path]
      : ["api", "passenger-app", ...path]
    ).join("/"),
    `${resolveTargetOrigin()}/`,
  );
  targetUrl.search = request.nextUrl.search;
  return targetUrl;
}

function copyHeaders(source: Headers) {
  const headers = new Headers();
  source.forEach((value, key) => {
    if (!REQUEST_HEADER_BLOCKLIST.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  return headers;
}

async function mintMetadataIdentityToken(audience: string) {
  const metadataUrl = new URL(METADATA_IDENTITY_TOKEN_URL);
  metadataUrl.searchParams.set("audience", audience);
  metadataUrl.searchParams.set("format", "full");
  const response = await fetch(metadataUrl.toString(), {
    cache: "no-store",
    headers: { "Metadata-Flavor": "Google" },
  });
  if (!response.ok) {
    throw new Error(`Metadata fetch failed: ${response.status}`);
  }
  return await response.text();
}

async function applyUpstreamAuth(
  headers: Headers,
  targetUrl: URL,
  token?: string,
) {
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }
  const configuredAudience = process.env.DRTS_API_AUTH_AUDIENCE?.trim();
  const audience =
    configuredAudience ||
    (targetUrl.hostname.endsWith(RUN_APP_HOST_SUFFIX)
      ? targetUrl.origin
      : null);
  if (!audience) return;
  const identityToken = await mintMetadataIdentityToken(audience);
  if (identityToken) {
    headers.set("x-serverless-authorization", `Bearer ${identityToken}`);
    headers.set("x-drts-google-id-token", identityToken);
  } else {
    throw new Error("Metadata identity token fetch returned empty");
  }
}

async function checkCSRF(request: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const expectedOrigin = new URL(request.url).origin;
    return origin === expectedOrigin;
  } catch {
    return false;
  }
}

function withSecurityHeaders(response: NextResponse) {
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; connect-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';",
  );
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  return response;
}

function deleteCookies(resp: NextResponse) {
  resp.cookies.set("pax_session", "", {
    maxAge: 0,
    expires: new Date(0),
    path: "/",
  });
  resp.cookies.set("pax_refresh", "", {
    maxAge: 0,
    expires: new Date(0),
    path: "/",
  });
  clearOAuthCookie(resp);
}

function clearOAuthCookie(resp: NextResponse) {
  resp.cookies.set("pax_oauth_txn", "", {
    maxAge: 0,
    expires: new Date(0),
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
}

async function forward(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  let isLogout = false;
  let isOAuthCallback = false;
  try {
    const { path } = await params;
    const method = request.method.toUpperCase();
    const fullPath = path.join("/");
    isLogout = fullPath === "auth/logout" && method === "POST";
    isOAuthCallback =
      path[0] === "auth" &&
      path[1] === "oauth" &&
      path[3] === "callback" &&
      method === "POST";

    if (!(await checkCSRF(request))) {
      return withSecurityHeaders(
        NextResponse.json({ error: "CSRF_CHECK_FAILED" }, { status: 403 }),
      );
    }
    if (!isAllowedPassengerPath(path, method)) {
      return withSecurityHeaders(
        NextResponse.json(
          { error: "PASSENGER_PROXY_PATH_NOT_ALLOWED" },
          { status: 404 },
        ),
      );
    }

    let token = request.cookies.get("pax_session")?.value;
    let refreshToken = request.cookies.get("pax_refresh")?.value;

    const targetUrl = buildTargetUrl(request, path);
    if (
      !targetUrl.pathname.startsWith("/api/passenger-app/") &&
      !(path[0] === "geo" && targetUrl.pathname.startsWith("/api/geo/"))
    ) {
      return withSecurityHeaders(
        NextResponse.json(
          { error: "PASSENGER_PROXY_PATH_NOT_ALLOWED" },
          { status: 404 },
        ),
      );
    }

    let initialBodyData: BodyInit | null = null;
    if (!["GET", "HEAD"].includes(method)) {
      initialBodyData = await request.arrayBuffer();
    }

    const isOAuthStart =
      path[0] === "auth" &&
      path[1] === "oauth" &&
      path[3] === "start" &&
      method === "POST";
    const isOtpRequest = fullPath === "auth/otp/request" && method === "POST";
    let command: Record<string, any> | null = null;
    if (isOAuthStart || isOAuthCallback || isOtpRequest) {
      try {
        command = JSON.parse(
          new TextDecoder().decode(initialBodyData as ArrayBuffer),
        );
      } catch {
        /* Reject malformed input below. */
      }
      if (!command || typeof command !== "object" || Array.isArray(command)) {
        const resp = NextResponse.json(
          {
            error: {
              code: "validation_error",
              message: "Invalid auth command.",
            },
          },
          { status: 400 },
        );
        if (isOAuthCallback) clearOAuthCookie(resp);
        return withSecurityHeaders(resp);
      }
    }
    let oauthBinding: OAuthBinding | null = null;
    if (isOAuthCallback) {
      oauthBinding = readOAuthBinding(
        request.cookies.get("pax_oauth_txn")?.value,
      );
      if (
        !oauthBinding ||
        oauthBinding.provider !== path[2] ||
        command!.provider !== path[2] ||
        command!.state !== oauthBinding.state ||
        oauthBinding.expiresAt <= Date.now() ||
        oauthBinding.session !== sessionFingerprint(token, refreshToken) ||
        (oauthBinding.purpose === "link" && !token) ||
        Object.keys(command!).some(
          (key) => !["provider", "code", "state", "error"].includes(key),
        )
      ) {
        const resp = NextResponse.json(
          {
            error: {
              code: "invalid_grant",
              message: "Missing, expired or mismatched callback binding.",
            },
          },
          { status: 401 },
        );
        clearOAuthCookie(resp);
        return withSecurityHeaders(resp);
      }
      if (
        command!.error ||
        typeof command!.code !== "string" ||
        !command!.code.trim()
      ) {
        const resp = NextResponse.json(
          {
            error: {
              code:
                command!.error === "access_denied"
                  ? "access_denied"
                  : "invalid_grant",
              message: "Authorization was refused or failed.",
            },
          },
          { status: 400 },
        );
        clearOAuthCookie(resp);
        return withSecurityHeaders(resp);
      }
      initialBodyData = JSON.stringify({
        provider: oauthBinding.provider,
        code: command!.code,
        state: oauthBinding.state,
        transactionId: oauthBinding.transactionId,
      });
    }
    if (
      isOAuthStart &&
      (command!.provider !== path[2] ||
        !["login", "link"].includes(command!.purpose))
    ) {
      return withSecurityHeaders(
        NextResponse.json(
          {
            error: {
              code: "validation_error",
              message: "Invalid OAuth provider or purpose.",
            },
          },
          { status: 400 },
        ),
      );
    }
    const requiresPassenger =
      (isOAuthStart && command!.purpose === "link") ||
      (isOtpRequest && command!.purpose !== "login") ||
      (isOAuthCallback && oauthBinding?.purpose === "link") ||
      (path[0] === "me" && (method !== "GET" || path.length > 1)) ||
      path[0] === "payment-methods";
    if (requiresPassenger && !token) {
      // Never turn an authenticated link/update into an anonymous bootstrap request.
      return withSecurityHeaders(
        NextResponse.json(
          {
            error: {
              code: "unauthorized",
              message: "An active passenger session is required.",
            },
          },
          { status: 401 },
        ),
      );
    }

    function extractTokens(
      parsed: any,
    ): { accessToken: string; refreshToken: string; redacted: any } | null {
      if (!parsed || typeof parsed !== "object") return null;

      // Check snake_case in envelope
      if (parsed.data && typeof parsed.data === "object") {
        const acc = parsed.data.access_token ?? parsed.data.accessToken;
        const ref = parsed.data.refresh_token ?? parsed.data.refreshToken;
        if (
          typeof acc === "string" &&
          typeof ref === "string" &&
          acc !== "" &&
          ref !== ""
        ) {
          const redacted = { ...parsed, data: { ...parsed.data } };
          delete redacted.data.access_token;
          delete redacted.data.refresh_token;
          delete redacted.data.accessToken;
          delete redacted.data.refreshToken;
          return { accessToken: acc, refreshToken: ref, redacted };
        }
        if (acc !== undefined || ref !== undefined) {
          return { accessToken: "", refreshToken: "", redacted: parsed };
        }
      }

      // Check flat camelCase (for tests/legacy)
      const accCamel = parsed.accessToken;
      const refCamel = parsed.refreshToken;
      if (
        typeof accCamel === "string" &&
        typeof refCamel === "string" &&
        accCamel !== "" &&
        refCamel !== ""
      ) {
        const redacted = { ...parsed };
        delete redacted.accessToken;
        delete redacted.refreshToken;
        return { accessToken: accCamel, refreshToken: refCamel, redacted };
      }
      if (accCamel !== undefined || refCamel !== undefined) {
        return { accessToken: "", refreshToken: "", redacted: parsed };
      }

      return null;
    }

    async function doRefresh(currentRefresh: string) {
      if (!currentRefresh) throw new Error("No refresh token");
      const refreshTargetUrl = buildTargetUrl(request, ["auth", "refresh"]);
      const refreshHeaders = new Headers({
        "Content-Type": "application/json",
      });
      await applyUpstreamAuth(refreshHeaders, refreshTargetUrl);

      const res = await fetch(refreshTargetUrl.toString(), {
        method: "POST",
        headers: refreshHeaders,
        body: JSON.stringify({ refreshToken: currentRefresh }),
      });
      if (!res.ok) {
        throw new Error(`Upstream refresh failed: ${res.status}`);
      }
      const data = await res.json();
      const tokens = extractTokens(data);
      if (tokens && tokens.accessToken && tokens.refreshToken) {
        return {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          redacted: tokens.redacted,
        };
      }
      throw new Error("Invalid tokens received");
    }

    const buildInit = async (
      currentToken: string | undefined,
      currentRefresh: string | undefined,
    ): Promise<RequestInit> => {
      const headers = copyHeaders(request.headers);
      if (fullPath === "auth/logout" && method === "POST") {
        headers.set("Content-Type", "application/json");
      }
      await applyUpstreamAuth(headers, targetUrl, currentToken);
      const init: RequestInit = {
        method,
        headers,
        cache: "no-store",
        redirect: "manual",
      };
      if (fullPath === "auth/logout" && method === "POST") {
        init.body = JSON.stringify({ refreshToken: currentRefresh });
      } else if (initialBodyData) {
        init.body = initialBodyData;
      }
      return init;
    };

    // Explicit refresh path
    if (fullPath === "auth/refresh" && method === "POST") {
      try {
        if (!refreshToken) throw new Error("NO_REFRESH_TOKEN");
        const data = await doRefresh(refreshToken);
        const resp = NextResponse.json(data.redacted, { status: 200 });
        const opts = {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax" as const,
          path: "/",
        };
        resp.cookies.set("pax_session", data.accessToken, opts);
        resp.cookies.set("pax_refresh", data.refreshToken, opts);
        return withSecurityHeaders(resp);
      } catch {
        const resp = NextResponse.json(
          { error: "REFRESH_FAILED" },
          { status: 401 },
        );
        deleteCookies(resp);
        return withSecurityHeaders(resp);
      }
    }

    // Normal forward path

    let init = await buildInit(token, refreshToken);
    let upstream = await fetch(targetUrl.toString(), init);

    let refreshedTokens: { accessToken: string; refreshToken: string } | null =
      null;
    let didClearTokens = false;

    if (upstream.status === 401 && refreshToken && !isOAuthCallback) {
      try {
        const newTokens = await doRefresh(refreshToken);
        token = newTokens.accessToken;
        refreshToken = newTokens.refreshToken;
        init = await buildInit(token, refreshToken);
        upstream = await fetch(targetUrl.toString(), init);

        if (upstream.status === 401) {
          didClearTokens = true;
        } else {
          refreshedTokens = newTokens;
        }
      } catch {
        didClearTokens = true;
      }
    }

    if (fullPath === "auth/logout" && method === "POST") {
      if (!upstream.ok) {
        const resp = NextResponse.json(
          { error: "LOGOUT_FAILED" },
          { status: upstream.status },
        );
        deleteCookies(resp);
        return withSecurityHeaders(resp);
      }
      const resp = NextResponse.json({ success: true }, { status: 200 });
      deleteCookies(resp);
      return withSecurityHeaders(resp);
    }

    const responseHeaders = copyHeaders(upstream.headers);
    let finalBody: BodyInit | null = upstream.body;
    const isLogin =
      fullPath.startsWith("auth/otp") ||
      fullPath === "auth/mfa/verify" ||
      fullPath.startsWith("auth/oauth");

    let oauthTxn: OAuthBinding | null = null;
    if (isOAuthStart && upstream.ok) {
      try {
        const text = await upstream.clone().text();
        const parsed = JSON.parse(text);
        const data = parsed.data ?? parsed;
        oauthTxn = readOAuthBinding(
          JSON.stringify({
            provider: path[2],
            purpose: command!.purpose,
            transactionId: data.transactionId ?? data.transaction_id,
            state: data.state,
            expiresAt: Math.min(
              Date.parse(data.expiresAt ?? data.expires_at),
              Date.now() + 600000,
            ),
            session: sessionFingerprint(token, refreshToken),
          }),
        );
        if (!oauthTxn || oauthTxn.expiresAt <= Date.now())
          throw new Error("Invalid binding");
      } catch {
        const resp = NextResponse.json(
          {
            error: {
              code: "invalid_grant",
              message: "Invalid OAuth start response.",
            },
          },
          { status: 503 },
        );
        clearOAuthCookie(resp);
        return withSecurityHeaders(resp);
      }
    }

    let loginData = null;
    if (isLogin && upstream.ok && (method === "POST" || method === "GET")) {
      const contentType = upstream.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        let parsed;
        try {
          const text = await upstream.text();
          finalBody = text;
          parsed = JSON.parse(text);
        } catch {
          // ignore parsing error, finalBody stays as text
        }
        if (parsed && typeof parsed === "object") {
          const tokens = extractTokens(parsed);
          if (tokens) {
            if (tokens.accessToken && tokens.refreshToken) {
              loginData = tokens;
              finalBody = JSON.stringify(tokens.redacted);
              responseHeaders.set("Content-Type", "application/json");
            } else {
              const resp = NextResponse.json(
                { error: "INVALID_TOKEN_PAYLOAD" },
                { status: 503 },
              );
              return withSecurityHeaders(resp);
            }
          }
        }
      }
    }

    const nextResponse = new NextResponse(finalBody, {
      status: upstream.status,
      headers: responseHeaders,
    });
    withSecurityHeaders(nextResponse);

    const opts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
    };

    if (oauthTxn) {
      nextResponse.cookies.set("pax_oauth_txn", JSON.stringify(oauthTxn), {
        ...opts,
        maxAge: 600,
      });
    }

    // The formal upstream transaction repository is the durable one-use authority.
    // Clear browser binding on every callback outcome, including refusal/failure.
    if (isOAuthCallback) clearOAuthCookie(nextResponse);

    if (didClearTokens) {
      deleteCookies(nextResponse);
    } else if (loginData && loginData.accessToken && loginData.refreshToken) {
      nextResponse.cookies.set("pax_session", loginData.accessToken, opts);
      nextResponse.cookies.set("pax_refresh", loginData.refreshToken, opts);
    } else if (refreshedTokens) {
      nextResponse.cookies.set(
        "pax_session",
        refreshedTokens.accessToken,
        opts,
      );
      nextResponse.cookies.set(
        "pax_refresh",
        refreshedTokens.refreshToken,
        opts,
      );
    }

    if (fullPath === "me" && method === "DELETE" && upstream.ok)
      deleteCookies(nextResponse);

    return nextResponse;
  } catch {
    // Top-level catch for any unhandled errors (e.g. metadata text read fail on normal requests, arrayBuffer errors)
    const resp = NextResponse.json(
      { error: "PASSENGER_AUTHORITY_UNAVAILABLE" },
      { status: 503 },
    );
    if (isLogout) {
      deleteCookies(resp);
    }
    if (isOAuthCallback) clearOAuthCookie(resp);
    return withSecurityHeaders(resp);
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return forward(request, context);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return forward(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return forward(request, context);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return forward(request, context);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return forward(request, context);
}
