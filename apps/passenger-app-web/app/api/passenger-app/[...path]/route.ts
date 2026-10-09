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
    return response.ok ? await response.text() : null;
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

function deleteCookies(resp: NextResponse) {
  resp.cookies.delete("pax_session");
  resp.cookies.delete("pax_refresh");
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
  let refreshToken = request.cookies.get("pax_refresh")?.value;

  const fullPath = path.join("/");

  async function doRefresh() {
    const refreshTargetUrl = buildTargetUrl(request, ["auth", "refresh"]);
    const refreshHeaders = new Headers({ "Content-Type": "application/json" });
    await applyUpstreamAuth(refreshHeaders, refreshTargetUrl);
    
    const res = await fetch(refreshTargetUrl.toString(), {
      method: "POST",
      headers: refreshHeaders,
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      throw new Error(`Upstream server error: ${res.status}`);
    }
    const data = await res.json();
    if (data && data.accessToken && data.refreshToken && typeof data.accessToken === "string" && typeof data.refreshToken === "string" && data.accessToken !== "" && data.refreshToken !== "") {
      return data as { accessToken: string; refreshToken: string };
    }
    throw new Error("Invalid tokens received");
  }

  // handle explicit refresh
  if (fullPath === "auth/refresh" && method === "POST") {
    if (!refreshToken) {
      const resp = NextResponse.json({ error: "NO_REFRESH_TOKEN" }, { status: 401 });
      deleteCookies(resp);
      return withSecurityHeaders(resp);
    }
    try {
      const data = await doRefresh();
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
    } catch (e) {
      console.error("EXPLICIT REFRESH ERROR:", e);
      const resp = NextResponse.json({ error: "REFRESH_FAILED" }, { status: 401 });
      deleteCookies(resp);
      return withSecurityHeaders(resp);
    }
  }

  const targetUrl = buildTargetUrl(request, path);

  let initialBodyData: BodyInit | null = null;
  if (!["GET", "HEAD"].includes(method)) {
    initialBodyData = await request.arrayBuffer();
  }
  
  const buildInit = async (currentToken: string | undefined, currentRefresh: string | undefined): Promise<RequestInit> => {
    const headers = copyHeaders(request.headers);
    if (fullPath === "auth/logout") {
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

  try {
    let init = await buildInit(token, refreshToken);
    let upstream = await fetch(targetUrl.toString(), init);

    let refreshedTokens: { accessToken: string; refreshToken: string } | null = null;
    let didClearTokens = false;

    if (upstream.status === 401 && refreshToken) {
      try {
        refreshedTokens = await doRefresh();
        token = refreshedTokens.accessToken;
        refreshToken = refreshedTokens.refreshToken;
        init = await buildInit(token, refreshToken);
        upstream = await fetch(targetUrl.toString(), init);
      } catch (e) {
        didClearTokens = true;
      }
    }

    if (fullPath === "auth/logout" && method === "POST") {
      if (!upstream.ok) {
         // Propagate failure for logout
         const resp = NextResponse.json({ error: "LOGOUT_FAILED" }, { status: upstream.status });
         deleteCookies(resp);
         return withSecurityHeaders(resp);
      }
      const resp = NextResponse.json({ success: true }, { status: 200 });
      deleteCookies(resp);
      return withSecurityHeaders(resp);
    }

    const responseHeaders = copyHeaders(upstream.headers);
    let finalBody = upstream.body;
    const isLogin = fullPath === "auth/login" || fullPath.startsWith("auth/otp") || fullPath === "auth/mfa/verify" || fullPath.startsWith("auth/oauth");
    
    let loginData = null;
    if (isLogin && upstream.ok && (method === "POST" || method === "GET")) {
      try {
        loginData = await upstream.json();
        if (loginData.accessToken && loginData.refreshToken) {
            const redacted = { ...loginData };
            delete redacted.accessToken;
            delete redacted.refreshToken;
            finalBody = JSON.stringify(redacted) as any;
            responseHeaders.set("Content-Type", "application/json");
        } else {
            loginData = null; // invalid token payload
        }
      } catch {
        // ignore JSON parsing error
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

    if (loginData && loginData.accessToken && loginData.refreshToken) {
      nextResponse.cookies.set("pax_session", loginData.accessToken, opts);
      nextResponse.cookies.set("pax_refresh", loginData.refreshToken, opts);
    } else if (refreshedTokens) {
      nextResponse.cookies.set("pax_session", refreshedTokens.accessToken, opts);
      nextResponse.cookies.set("pax_refresh", refreshedTokens.refreshToken, opts);
    } else if (didClearTokens) {
      deleteCookies(nextResponse);
    }

    return nextResponse;
  } catch (e) {
    console.error("BFF ERROR:", e);
    const resp = NextResponse.json(
      { error: "PASSENGER_AUTHORITY_UNAVAILABLE" },
      { status: 503 }
    );
    // As per R2, clear both cookies on network/parse/invalid-token failures
    // which includes any unhandled error inside doRefresh which bubbles up here
    // IF it was triggered during an auto-refresh or explicitly
    deleteCookies(resp);
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
