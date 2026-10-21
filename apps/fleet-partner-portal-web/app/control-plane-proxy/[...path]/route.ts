import { NextRequest, NextResponse } from "next/server";
import { ApiClientError } from "@drts/api-client";
import {
  fleetApiUrl,
  resolveFleetPrincipal,
} from "../../../lib/fleet-principal.server";

const REQUEST_HEADER_BLOCKLIST = new Set([
  "authorization",
  "connection",
  "content-length",
  "cookie",
  "host",
  "transfer-encoding",
  "x-actor-id",
  "x-actor-type",
  "x-auth-mode",
  "x-fleet-partner-id",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-port",
  "x-forwarded-proto",
  "x-partner-id",
  "x-realm",
  "x-role-families",
  "x-roles",
  "x-scopes",
  "x-serverless-authorization",
  "x-drts-authorization",
  "x-drts-runtime-origin",
  "x-goog-iap-jwt-assertion",
  "x-goog-authenticated-user-email",
  "x-tenant-id",
  "x-partner-program-id",
  "x-partner-entry-slug",
  "x-session-id",
  "x-auth-time",
  "x-amr",
]);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function buildTargetUrl(request: NextRequest, path: string[]) {
  const targetPath =
    path.length === 1 && path[0] === "health"
      ? "health"
      : ["api", ...path].join("/");
  if (
    path.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        /[\\/?#%]/.test(segment),
    )
  )
    throw new Error("Invalid proxy path.");
  const targetUrl = new URL(targetPath, `${fleetApiUrl()}/`);
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

async function forward(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const method = request.method.toUpperCase();
  let targetUrl: URL;
  const headers = copyRequestHeaders(request);
  try {
    const origin = request.headers.get("origin");
    // The public runtime strips and rebuilds this provenance from the ingress
    // authority before forwarding to its loopback-only Next child. The child
    // URL itself is HTTP loopback, not the browser's external HTTPS origin.
    const expectedOrigin =
      request.headers.get("x-drts-runtime-origin") ?? request.nextUrl.origin;
    if (origin !== null && origin !== expectedOrigin) {
      return NextResponse.json(
        {
          error: {
            code: "FLEET_ORIGIN_DENIED",
            message: "Same-origin request required.",
          },
        },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    targetUrl = buildTargetUrl(request, path);
    const principal = await resolveFleetPrincipal(request.headers);
    principal.headers.forEach((value, key) => headers.set(key, value));
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        error: {
          code:
            err instanceof ApiClientError
              ? err.code
              : "FLEET_PROXY_REQUEST_INVALID",
          message:
            err instanceof ApiClientError
              ? err.apiMessage
              : err instanceof Error
                ? err.message
                : String(err),
        },
      },
      {
        status: err instanceof ApiClientError ? err.statusCode : 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

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
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const responseHeaders = copyResponseHeaders(upstream);
  responseHeaders.set("Cache-Control", "private, no-store");
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
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
