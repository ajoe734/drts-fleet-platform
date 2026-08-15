import { NextRequest, NextResponse } from "next/server";

const DEFAULT_API_BASE_URL = "http://localhost:3001";
const DEFAULT_ENTERPRISE_DISPATCH_TENANT_ID =
  "10000000-0000-0000-0000-000000000201";
const DEFAULT_ENTERPRISE_DISPATCH_ACTOR_ID = "enterprise-dispatch-web";
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
  "x-tenant-id",
]);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function resolveTargetOrigin(): string {
  return process.env.DRTS_API_URL || DEFAULT_API_BASE_URL;
}

function isRunAppTarget(targetUrl: URL): boolean {
  return targetUrl.hostname.endsWith(RUN_APP_HOST_SUFFIX);
}

function hasUnsafePathSegment(path: string[]): boolean {
  return path.some((segment) => {
    return (
      segment.length === 0 ||
      segment === "." ||
      segment === ".." ||
      segment.includes("/") ||
      segment.includes("\\")
    );
  });
}

function normalizeProxyPath(path: string[]): string[] {
  return path[0] === "api" ? path.slice(1) : path;
}

function isTenantBookingPath(path: string[]): boolean {
  return path[0] === "tenant" && path[1] === "bookings";
}

function isAllowedEnterprisePath(path: string[], method: string) {
  if (hasUnsafePathSegment(path)) {
    return false;
  }

  if (path.length === 1 && path[0] === "health" && method === "GET") {
    return true;
  }

  if (!isTenantBookingPath(path)) {
    return false;
  }

  // The client exposes exactly this tenant-booking lifecycle. Keep the BFF
  // narrow while allowing every operation it deliberately publishes.
  if (path.length === 2) {
    return method === "GET" || method === "POST";
  }
  if (path.length === 3) {
    return method === "GET" || method === "PUT" || method === "PATCH";
  }
  return path.length === 4 && path[3] === "cancel" && method === "POST";
}

function buildTargetUrl(request: NextRequest, path: string[]) {
  const targetPath =
    path.length === 1 && path[0] === "health"
      ? "health"
      : ["api", ...path].join("/");
  const targetUrl = new URL(targetPath, `${resolveTargetOrigin()}/`);
  targetUrl.search = request.nextUrl.search;
  return targetUrl;
}

function resolveEnterpriseTenantId(): string {
  return (
    process.env.DRTS_ENTERPRISE_DISPATCH_TENANT_ID?.trim() ||
    DEFAULT_ENTERPRISE_DISPATCH_TENANT_ID
  );
}

function resolveEnterpriseActorId(): string {
  return (
    process.env.DRTS_ENTERPRISE_DISPATCH_ACTOR_ID?.trim() ||
    DEFAULT_ENTERPRISE_DISPATCH_ACTOR_ID
  );
}

function copyRequestHeaders(request: NextRequest, path: string[]) {
  const headers = new Headers();

  request.headers.forEach((value, key) => {
    if (REQUEST_HEADER_BLOCKLIST.has(key.toLowerCase())) {
      return;
    }
    headers.set(key, value);
  });

  if (isTenantBookingPath(path)) {
    headers.set("x-realm", "tenant");
    headers.set("x-actor-type", "tenant_admin");
    headers.set("x-actor-id", resolveEnterpriseActorId());
    headers.set("x-tenant-id", resolveEnterpriseTenantId());
  } else {
    headers.set("x-realm", "enterprise_dispatch");
  }

  return headers;
}

function copyResponseHeaders(response: Response) {
  const headers = new Headers();

  response.headers.forEach((value, key) => {
    if (REQUEST_HEADER_BLOCKLIST.has(key.toLowerCase())) {
      return;
    }
    headers.set(key, value);
  });

  return headers;
}

async function mintMetadataIdentityToken(
  audience: string,
): Promise<string | null> {
  const metadataUrl = new URL(METADATA_IDENTITY_TOKEN_URL);
  metadataUrl.searchParams.set("audience", audience);
  metadataUrl.searchParams.set("format", "full");

  try {
    const response = await fetch(metadataUrl, {
      cache: "no-store",
      headers: {
        "Metadata-Flavor": "Google",
      },
    });

    if (!response.ok) {
      return null;
    }

    return response.text();
  } catch {
    return null;
  }
}

async function applyUpstreamAuth(headers: Headers, targetUrl: URL) {
  const internalKey = process.env.DRTS_INTERNAL_KEY?.trim();
  if (internalKey) {
    headers.set("x-drts-internal-key", internalKey);
  }

  const protectedAudience = process.env.DRTS_API_AUTH_AUDIENCE?.trim();
  if (protectedAudience) {
    const metadataToken = await mintMetadataIdentityToken(protectedAudience);
    if (metadataToken) {
      headers.set("x-serverless-authorization", `Bearer ${metadataToken}`);
    }
    return;
  }

  if (!isRunAppTarget(targetUrl)) {
    return;
  }

  const metadataToken = await mintMetadataIdentityToken(targetUrl.origin);
  if (metadataToken) {
    headers.set("x-serverless-authorization", `Bearer ${metadataToken}`);
  }
}

async function forward(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: rawPath } = await params;
  const path = normalizeProxyPath(rawPath);
  const method = request.method.toUpperCase();

  if (!isAllowedEnterprisePath(path, method)) {
    return NextResponse.json(
      { error: "ENTERPRISE_DISPATCH_PROXY_PATH_NOT_ALLOWED" },
      { status: 404 },
    );
  }

  const targetUrl = buildTargetUrl(request, path);
  const headers = copyRequestHeaders(request, path);
  await applyUpstreamAuth(headers, targetUrl);

  const init: RequestInit = {
    method,
    headers,
    cache: "no-store",
    redirect: "manual",
  };

  if (method !== "GET" && method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, init);
  } catch (error) {
    return NextResponse.json(
      {
        status: "down",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 503 },
    );
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: copyResponseHeaders(upstream),
  });
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

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return forward(request, context);
}
