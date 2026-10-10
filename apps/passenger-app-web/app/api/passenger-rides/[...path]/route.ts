import { NextResponse, type NextRequest } from "next/server";

const DEFAULT_API_BASE_URL = "http://localhost:8080";
const RUN_APP_HOST_SUFFIX = ".run.app";
const METADATA_IDENTITY_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";
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

function isAllowedPath(method: string, path: string[]) {
  if (hasUnsafePathSegment(path)) return false;
  // Token endpoints allowed:
  // GET /passenger-rides/:token
  // GET /passenger-rides/:token/events
  // POST /passenger-rides/:token/cancel
  // POST /passenger-rides/:token/ratings
  // POST /passenger-rides/:token/contact
  // GET /passenger-rides/:token/receipt
  // POST /passenger-rides/:token/push-subscriptions

  if (method === "GET" && path.length === 1) return true; // GET :token
  if (method === "GET" && path.length === 2 && path[1] === "events")
    return true; // GET :token/events
  if (method === "POST" && path.length === 2 && path[1] === "cancel")
    return true; // POST :token/cancel
  if (method === "POST" && path.length === 2 && path[1] === "ratings")
    return true; // POST :token/ratings
  if (method === "POST" && path.length === 2 && path[1] === "contact")
    return true; // POST :token/contact
  if (method === "GET" && path.length === 2 && path[1] === "receipt")
    return true; // GET :token/receipt
  if (
    method === "POST" &&
    path.length === 2 &&
    path[1] === "push-subscriptions"
  )
    return true; // POST :token/push-subscriptions

  return false;
}

function resolveTargetOrigin() {
  return process.env.DRTS_API_URL || DEFAULT_API_BASE_URL;
}

function buildTargetUrl(request: NextRequest, path: string[]) {
  const targetUrl = new URL(
    ["api", "passenger-rides", ...path].join("/"),
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

async function applyUpstreamAuth(headers: Headers, targetUrl: URL) {
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
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    const originUrl = new URL(origin);
    const expectedOrigin = `https://${host}`;
    if (originUrl.origin === expectedOrigin) return true;
    if (host.startsWith("localhost:") || host.startsWith("127.0.0.1:")) {
      return (
        originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1"
      );
    }
    return false;
  } catch {
    return false;
  }
}

function withSecurityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}

async function forward(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await context.params;
    const method = request.method;
    if (!isAllowedPath(method, path)) {
      return withSecurityHeaders(
        NextResponse.json({ error: "BFF_PATH_NOT_ALLOWED" }, { status: 403 }),
      );
    }
    const isCsrfSafe = await checkCSRF(request);
    if (!isCsrfSafe) {
      return withSecurityHeaders(
        NextResponse.json({ error: "CSRF_CHECK_FAILED" }, { status: 403 }),
      );
    }

    const targetUrl = buildTargetUrl(request, path);
    const headers = copyHeaders(request.headers);
    await applyUpstreamAuth(headers, targetUrl);

    let initialBodyData: string | null = null;
    if (["POST", "PUT", "PATCH"].includes(method)) {
      try {
        initialBodyData = await request.text();
      } catch {
        // empty body
      }
    }

    const init: RequestInit = {
      method,
      headers,
      cache: "no-store",
      redirect: "manual",
    };
    if (initialBodyData) {
      init.body = initialBodyData;
    }

    const upstream = await fetch(targetUrl.toString(), init);
    const responseHeaders = copyHeaders(upstream.headers);
    const finalBody: BodyInit | null = upstream.body;

    const nextResponse = new NextResponse(finalBody, {
      status: upstream.status,
      headers: responseHeaders,
    });
    return withSecurityHeaders(nextResponse);
  } catch {
    return withSecurityHeaders(
      NextResponse.json(
        { error: "PASSENGER_AUTHORITY_UNAVAILABLE" },
        { status: 503 },
      ),
    );
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
