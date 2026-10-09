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
  return path.some(
    (segment) =>
      segment.length === 0 ||
      segment === "." ||
      segment === ".." ||
      segment.includes("/") ||
      segment.includes("\\"),
  );
}

function isAllowedPassengerPath(path: string[], method: string) {
  if (hasUnsafePathSegment(path)) return false;
  const fullPath = path.join("/");
  if (method === "GET" && fullPath === "auth/providers") return true;
  if (method === "POST" && fullPath === "auth/login") return true;
  if (method === "POST" && fullPath.startsWith("auth/otp")) return true;
  if (method === "POST" && fullPath.startsWith("auth/oauth")) return true;
  if (method === "GET" && fullPath.startsWith("auth/oauth")) return true;
  if (method === "POST" && fullPath === "auth/mfa/verify") return true;
  if (method === "GET" && fullPath === "fares/quote") return true;
  if (method === "POST" && fullPath === "auth/refresh") return true;
  if (method === "POST" && fullPath === "auth/logout") return true;
  if (method === "GET" && fullPath === "account") return true;
  if (method === "POST" && fullPath === "rides") return true;
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
  try {
    const response = await fetch(metadataUrl.toString(), {
      cache: "no-store",
      headers: { "Metadata-Flavor": "Google" },
    });
    return response.ok ? response.text() : null;
  } catch {
    return null;
  }
}

async function applyUpstreamAuth(
  headers: Headers,
  targetUrl: URL,
  token?: string,
) {
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
    return;
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
    "default-src 'self'; connect-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
  );
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );
  return response;
}

async function forward(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const method = request.method.toUpperCase();

  if (!(await checkCSRF(request))) {
    return withSecurityHeaders(NextResponse.json({ error: "CSRF_CHECK_FAILED" }, { status: 403 }));
  }
  if (!isAllowedPassengerPath(path, method)) {
    return withSecurityHeaders(NextResponse.json(
      { error: "PASSENGER_PROXY_PATH_NOT_ALLOWED" },
      { status: 404 }
    ));
  }

  let token = request.cookies.get("pax_session")?.value;
  const refreshToken = request.cookies.get("pax_refresh")?.value;

  const fullPath = path.join("/");

  // handle logout
  if (fullPath === "auth/logout" && method === "POST") {
    const targetUrl = buildTargetUrl(request, path);
    const headers = new Headers();
    await applyUpstreamAuth(headers, targetUrl, token);
    try {
      await fetch(targetUrl.toString(), { method: "POST", headers });
    } catch {
      // ignore
    }
    const resp = NextResponse.json({ success: true }, { status: 200 });
    resp.cookies.delete("pax_session");
    resp.cookies.delete("pax_refresh");
    return withSecurityHeaders(resp);
  }

  // handle refresh
  if (fullPath === "auth/refresh" && method === "POST") {
    if (!refreshToken) {
      const resp = NextResponse.json({ error: "NO_REFRESH_TOKEN" }, { status: 401 });
      resp.cookies.delete("pax_session");
      resp.cookies.delete("pax_refresh");
      return withSecurityHeaders(resp);
    }
    const targetUrl = buildTargetUrl(request, path);
    const headers = new Headers({ "Content-Type": "application/json" });
    await applyUpstreamAuth(headers, targetUrl);
    try {
      const upstream = await fetch(targetUrl.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify({ refreshToken })
      });
      if (upstream.ok) {
        const data = await upstream.json();
        const resp = NextResponse.json({ success: true }, { status: 200 });
        const opts = {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax" as const,
          path: "/",
        };
        resp.cookies.set("pax_session", data.accessToken, opts);
        resp.cookies.set("pax_refresh", data.refreshToken, opts);
        return withSecurityHeaders(resp);
      } else {
        const resp = NextResponse.json({ error: "REFRESH_FAILED" }, { status: 401 });
        resp.cookies.delete("pax_session");
        resp.cookies.delete("pax_refresh");
        return withSecurityHeaders(resp);
      }
    } catch {
      return withSecurityHeaders(NextResponse.json({ error: "PASSENGER_AUTHORITY_UNAVAILABLE" }, { status: 503 }));
    }
  }

  const targetUrl = buildTargetUrl(request, path);
  let headers = copyHeaders(request.headers);
  await applyUpstreamAuth(headers, targetUrl, token);

  const init: RequestInit = {
    method,
    headers,
    cache: "no-store",
    redirect: "manual",
  };

  let bodyBuffer: ArrayBuffer | null = null;
  if (!["GET", "HEAD"].includes(method)) {
    bodyBuffer = await request.arrayBuffer();
    init.body = bodyBuffer;
  }

  try {
    let upstream = await fetch(targetUrl.toString(), init);

    // Attempt auto-refresh
    let refreshedTokens: { accessToken: string; refreshToken: string } | null =
      null;
    let didClearTokens = false;

    if (upstream.status === 401 && token && refreshToken) {
      const refreshUrl = new URL(
        `/api/passenger-app/auth/refresh`,
        resolveTargetOrigin(),
      );
      try {
        const refreshRes = await fetch(refreshUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          if (data.accessToken && data.refreshToken) {
            token = data.accessToken;
            refreshedTokens = data;

            // retry original request
            headers = copyHeaders(request.headers);
            await applyUpstreamAuth(headers, targetUrl, token);
            init.headers = headers;
            if (bodyBuffer) init.body = bodyBuffer;
            upstream = await fetch(targetUrl.toString(), init);
          } else {
            didClearTokens = true;
          }
        } else {
          didClearTokens = true;
        }
      } catch {
        didClearTokens = true;
      }
    }

    const responseHeaders = copyHeaders(upstream.headers);
    let finalBody = upstream.body;
    const isLogin = fullPath === "auth/login" || fullPath.startsWith("auth/otp") || fullPath === "auth/mfa/verify" || fullPath.startsWith("auth/oauth");
    
    let loginData = null;
    if (isLogin && upstream.ok && (method === "POST" || method === "GET")) {
      try {
        loginData = await upstream.json();
        const redacted = { ...loginData };
        delete redacted.accessToken;
        delete redacted.refreshToken;
        finalBody = JSON.stringify(redacted) as any;
        responseHeaders.set("Content-Type", "application/json");
      } catch {
        // ignore JSON parsing error
      }
    }

    const nextResponse = new NextResponse(finalBody, {
      status: upstream.status,
      headers: responseHeaders,
    });
    withSecurityHeaders(nextResponse);

    if (loginData && loginData.accessToken && loginData.refreshToken) {
      const opts = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        path: "/",
      };
      nextResponse.cookies.set("pax_session", loginData.accessToken, opts);
      nextResponse.cookies.set("pax_refresh", loginData.refreshToken, opts);
    } else if (refreshedTokens) {
      const opts = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        path: "/",
      };
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
    } else if (didClearTokens) {
      nextResponse.cookies.delete("pax_session");
      nextResponse.cookies.delete("pax_refresh");
    }

    return nextResponse;
  } catch {
    return withSecurityHeaders(NextResponse.json(
      { error: "PASSENGER_AUTHORITY_UNAVAILABLE" },
      { status: 503 }
    ));
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
