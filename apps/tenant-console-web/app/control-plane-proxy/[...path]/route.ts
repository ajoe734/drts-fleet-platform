import { NextRequest, NextResponse } from "next/server";
import {
  TENANT_SESSION_COOKIE_NAME,
  TENANT_CSRF_COOKIE_NAME,
  TENANT_CSRF_HEADER_NAME,
} from "@/lib/auth/constants";
import {
  verifyCsrfToken,
  verifySameOrigin,
} from "@/lib/auth/session";

const DEFAULT_API_BASE_URL = "http://localhost:3001";
const METADATA_IDENTITY_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";
const RUN_APP_HOST_SUFFIX = ".a.run.app";

const REQUEST_HEADER_BLOCKLIST = new Set([
  "authorization",
  "connection",
  "content-length",
  "cookie",
  "host",
  "transfer-encoding",
  "x-csrf-token",
  "x-drts-csrf",
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
  "x-tenant-id",
  "x-fleet-partner-id",
  "x-serverless-authorization",
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

function isAllowedTenantPath(path: string[], method: string) {
  if (hasUnsafePathSegment(path)) {
    return false;
  }

  if (path.length === 1 && path[0] === "health" && method === "GET") {
    return true;
  }

  if (path[0] !== "tenant") {
    return false;
  }

  const tenantReadRoots = new Set([
    "addresses",
    "api-keys",
    "audit",
    "billing",
    "bookings",
    "cost-centers",
    "feature-flags",
    "invoices",
    "notifications",
    "reports",
    "settings",
    "sla",
    "users",
    "webhooks",
  ]);

  if (!tenantReadRoots.has(path[1] ?? "")) {
    return false;
  }

  if (method === "GET") {
    return path.length <= 4;
  }

  if (method === "POST" || method === "PUT" || method === "PATCH") {
    return path.length <= 5;
  }

  if (method === "DELETE") {
    return path.length <= 4;
  }

  return false;
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

function copyRequestHeaders(request: NextRequest) {
  const headers = new Headers();

  request.headers.forEach((value, key) => {
    if (REQUEST_HEADER_BLOCKLIST.has(key.toLowerCase())) {
      return;
    }
    headers.set(key, value);
  });

  const sessionToken = request.cookies.get(TENANT_SESSION_COOKIE_NAME)?.value?.trim();
  if (sessionToken) {
    headers.set("authorization", `Bearer ${sessionToken}`);
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
  const { path } = await params;
  const method = request.method.toUpperCase();

  if (!isAllowedTenantPath(path, method)) {
    return NextResponse.json(
      { error: "TENANT_CONSOLE_PROXY_PATH_NOT_ALLOWED" },
      { status: 404 },
    );
  }

  // Enforce same-origin & CSRF for state-mutating requests
  if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
    if (!verifySameOrigin(request)) {
      return NextResponse.json(
        {
          error: "CSRF_ORIGIN_INVALID",
          message: "Origin validation failed for mutation request.",
        },
        { status: 403 },
      );
    }

    const csrfCookie = request.cookies.get(TENANT_CSRF_COOKIE_NAME)?.value;
    const csrfHeader = request.headers.get(TENANT_CSRF_HEADER_NAME);

    if (!verifyCsrfToken(csrfCookie, csrfHeader)) {
      return NextResponse.json(
        {
          error: "CSRF_TOKEN_INVALID",
          message: "CSRF verification failed for mutation request.",
        },
        { status: 403 },
      );
    }
  }

  const targetUrl = buildTargetUrl(request, path);
  const headers = copyRequestHeaders(request);
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

export async function PATCH(
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

export async function OPTIONS(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return forward(request, context);
}
