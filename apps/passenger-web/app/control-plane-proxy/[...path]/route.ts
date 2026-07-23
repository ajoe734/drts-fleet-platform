import { NextRequest, NextResponse } from "next/server";

const DEFAULT_API_BASE_URL = "http://localhost:3001";
const METADATA_IDENTITY_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";
const RUN_APP_HOST_SUFFIX = ".a.run.app";
const PASSENGER_ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,512}$/;
const REQUEST_HEADER_BLOCKLIST = new Set([
  "connection",
  "content-length",
  "cookie",
  "host",
  "transfer-encoding",
  "x-drts-internal-key",
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
  if (hasUnsafePathSegment(path)) {
    return false;
  }
  if (path.length === 2 && path[0] === "multi-taxi" && path[1] === "rides") {
    return method === "POST";
  }
  if (path[0] !== "passenger-rides" || path.length < 2) {
    return false;
  }
  if (!PASSENGER_ACCESS_TOKEN_PATTERN.test(path[1]!)) {
    return false;
  }
  if (path.length === 2) {
    return method === "GET";
  }
  if (path.length !== 3) {
    return false;
  }
  const action = path[2]!;
  return (
    (["events", "receipt"].includes(action) && method === "GET") ||
    (["cancel", "ratings", "contact"].includes(action) && method === "POST")
  );
}

function resolveTargetOrigin() {
  return process.env.DRTS_API_URL || DEFAULT_API_BASE_URL;
}

function buildTargetUrl(request: NextRequest, path: string[]) {
  const targetUrl = new URL(
    ["api", ...path].join("/"),
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
    const response = await fetch(metadataUrl, {
      cache: "no-store",
      headers: { "Metadata-Flavor": "Google" },
    });
    return response.ok ? response.text() : null;
  } catch {
    return null;
  }
}

async function applyUpstreamAuth(headers: Headers, targetUrl: URL) {
  const internalKey = process.env.DRTS_INTERNAL_KEY?.trim();
  if (internalKey) {
    headers.set("x-drts-internal-key", internalKey);
  }
  const configuredAudience = process.env.DRTS_API_AUTH_AUDIENCE?.trim();
  const audience =
    configuredAudience ||
    (targetUrl.hostname.endsWith(RUN_APP_HOST_SUFFIX)
      ? targetUrl.origin
      : null);
  if (!audience) {
    return;
  }
  const identityToken = await mintMetadataIdentityToken(audience);
  if (identityToken) {
    headers.set("x-serverless-authorization", `Bearer ${identityToken}`);
  }
}

async function forward(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const method = request.method.toUpperCase();
  if (!isAllowedPassengerPath(path, method)) {
    return NextResponse.json(
      { error: "PASSENGER_PROXY_PATH_NOT_ALLOWED" },
      { status: 404 },
    );
  }

  const targetUrl = buildTargetUrl(request, path);
  const headers = copyHeaders(request.headers);
  await applyUpstreamAuth(headers, targetUrl);
  const init: RequestInit = {
    method,
    headers,
    cache: "no-store",
    redirect: "manual",
  };
  if (!["GET", "HEAD"].includes(method)) {
    init.body = await request.arrayBuffer();
  }

  try {
    const upstream = await fetch(targetUrl, init);
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: copyHeaders(upstream.headers),
    });
  } catch {
    return NextResponse.json(
      { error: "PASSENGER_AUTHORITY_UNAVAILABLE" },
      { status: 503 },
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
