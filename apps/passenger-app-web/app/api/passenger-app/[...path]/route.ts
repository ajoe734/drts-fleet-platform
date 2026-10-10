import { NextRequest, NextResponse } from "next/server";

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
  if (method === "GET" && fullPath === "fares") return true;
  if (method === "POST" && fullPath === "rides") return true;

  if (method === "GET" && fullPath === "rides") return true;
  if (method === "GET" && fullPath === "rides/active") return true;
  if (method === "GET" && path.length === 2 && path[0] === "rides") return true; // GET rides/:id
  if (
    method === "GET" &&
    path.length === 3 &&
    path[0] === "rides" &&
    path[2] === "events"
  )
    return true; // GET rides/:id/events
  if (
    method === "GET" &&
    path.length === 3 &&
    path[0] === "rides" &&
    path[2] === "receipt"
  )
    return true; // GET rides/:id/receipt
  if (
    method === "POST" &&
    path.length === 3 &&
    path[0] === "rides" &&
    path[2] === "cancel"
  )
    return true; // POST rides/:id/cancel
  if (
    method === "POST" &&
    path.length === 3 &&
    path[0] === "rides" &&
    path[2] === "ratings"
  )
    return true; // POST rides/:id/ratings
  if (
    method === "POST" &&
    path.length === 3 &&
    path[0] === "rides" &&
    path[2] === "contact"
  )
    return true; // POST rides/:id/contact
  if (
    method === "POST" &&
    path.length === 3 &&
    path[0] === "rides" &&
    path[2] === "complaints"
  )
    return true; // POST rides/:id/complaints

  return false;
}

function resolveTargetOrigin() {
  return process.env.DRTS_API_URL || DEFAULT_API_BASE_URL;
}

function buildTargetUrl(request: NextRequest, path: string[]) {
  const targetUrl = new URL(
    ["api", "passenger-app", ...path].join("/"),
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
}

async function forward(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  let isLogout = false;
  try {
    const { path } = await params;
    const method = request.method.toUpperCase();
    const fullPath = path.join("/");
    isLogout = fullPath === "auth/logout" && method === "POST";

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
    if (!targetUrl.pathname.startsWith("/api/passenger-app/")) {
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

    function extractTokens(
      parsed: any,
    ): { accessToken: string; refreshToken: string; redacted: any } | null {
      if (!parsed || typeof parsed !== "object") return null;

      // Check snake_case in envelope
      if (parsed.data && typeof parsed.data === "object") {
        const acc = parsed.data.access_token;
        const ref = parsed.data.refresh_token;
        if (
          typeof acc === "string" &&
          typeof ref === "string" &&
          acc !== "" &&
          ref !== ""
        ) {
          const redacted = { ...parsed, data: { ...parsed.data } };
          delete redacted.data.access_token;
          delete redacted.data.refresh_token;
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

    if (upstream.status === 401 && refreshToken) {
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
