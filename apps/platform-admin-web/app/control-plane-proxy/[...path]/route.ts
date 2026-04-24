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
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-port",
  "x-forwarded-proto",
]);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function resolveTargetOrigin(): string {
  return process.env.DRTS_API_URL || DEFAULT_API_BASE_URL;
}

function isRunAppTarget(targetUrl: URL): boolean {
  return targetUrl.hostname.endsWith(RUN_APP_HOST_SUFFIX);
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

function copyRequestHeaders(request: NextRequest, targetUrl: URL) {
  const headers = new Headers();
  const forwardAuthorization = !isRunAppTarget(targetUrl);

  request.headers.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();

    if (REQUEST_HEADER_BLOCKLIST.has(normalizedKey)) {
      return;
    }

    if (normalizedKey === "authorization" && !forwardAuthorization) {
      return;
    }

    headers.set(key, value);
  });

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
  targetUrl: URL,
): Promise<string | null> {
  const metadataUrl = new URL(METADATA_IDENTITY_TOKEN_URL);
  metadataUrl.searchParams.set("audience", targetUrl.origin);
  metadataUrl.searchParams.set("format", "full");

  try {
    const response = await fetch(metadataUrl, {
      cache: "no-store",
      headers: {
        "Metadata-Flavor": "Google",
      },
    });

    if (!response.ok) {
      console.error("[control-plane-proxy] metadata token request failed", {
        audience: targetUrl.origin,
        status: response.status,
      });
      return null;
    }

    return response.text();
  } catch (error) {
    console.error("[control-plane-proxy] metadata token request errored", {
      audience: targetUrl.origin,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function applyUpstreamAuth(
  headers: Headers,
  request: NextRequest,
  targetUrl: URL,
) {
  if (!isRunAppTarget(targetUrl)) {
    const authorization = request.headers.get("authorization");
    if (authorization) {
      headers.set("authorization", authorization);
    }
    return;
  }

  const metadataToken = await mintMetadataIdentityToken(targetUrl);
  if (metadataToken) {
    headers.set("x-serverless-authorization", `Bearer ${metadataToken}`);
    return;
  }

  const authorization = request.headers.get("authorization");
  if (authorization) {
    headers.set("x-serverless-authorization", authorization);
  }
}

async function forward(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const method = request.method.toUpperCase();
  const targetUrl = buildTargetUrl(request, path);
  const headers = copyRequestHeaders(request, targetUrl);
  await applyUpstreamAuth(headers, request, targetUrl);
  const init: RequestInit = {
    method,
    headers,
    cache: "no-store",
    redirect: "manual",
  };

  if (method !== "GET" && method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(targetUrl, init);

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
