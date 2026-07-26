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

function isAllowedPartnerPath(path: string[], method: string) {
  if (hasUnsafePathSegment(path)) {
    return false;
  }

  if (path.length === 1 && path[0] === "health" && method === "GET") {
    return true;
  }

  if (
    path[0] === "auth" &&
    path[1] === "partner" &&
    path[2] === "bootstrap-session" &&
    path.length === 3 &&
    method === "POST"
  ) {
    return true;
  }

  if (
    path[0] === "partner" &&
    path[1] === "entries" &&
    (path.length === 2 || path.length === 3) &&
    method === "GET"
  ) {
    return true;
  }

  if (
    path[0] === "partner" &&
    path[1] === "ingress" &&
    path[2] === "handoff" &&
    path.length === 3 &&
    method === "POST"
  ) {
    return true;
  }

  if (
    path[0] === "partner" &&
    path[1] === "eligibility" &&
    path[2] === "verify" &&
    path.length === 3 &&
    method === "POST"
  ) {
    return true;
  }

  if (
    path[0] === "partner" &&
    path[1] === "eligibility" &&
    path.length === 3 &&
    method === "GET"
  ) {
    return true;
  }

  if (
    path[0] === "tenant" &&
    path[1] === "bookings" &&
    path.length === 2 &&
    method === "POST"
  ) {
    return true;
  }

  if (
    path[0] === "tenant" &&
    path[1] === "bookings" &&
    path.length === 3 &&
    method === "GET"
  ) {
    return true;
  }

  if (path[0] === "orders" && path.length === 2 && method === "GET") {
    return true;
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

  headers.set("x-realm", "partner");
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

  if (!isAllowedPartnerPath(path, method)) {
    return NextResponse.json(
      { error: "PARTNER_BOOKING_PROXY_PATH_NOT_ALLOWED" },
      { status: 404 },
    );
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
