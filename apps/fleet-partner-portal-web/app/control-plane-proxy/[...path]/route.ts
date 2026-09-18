import { NextRequest, NextResponse } from "next/server";
import { CONTROL_PLANE_IAP_EMAIL_HEADER } from "@drts/control-plane-auth";

const DEFAULT_API_BASE_URL = "http://localhost:3001";
const METADATA_IDENTITY_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";
const RUN_APP_HOST_SUFFIX = ".a.run.app";
const FLEET_PARTNER_ID_HEADER = "x-fleet-partner-id";
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
]);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function resolveTargetOrigin(): string {
  return process.env.DRTS_API_URL || DEFAULT_API_BASE_URL;
}

function resolveFleetPartnerId(requestHeaders: Headers): string {
  const fromHeader = requestHeaders.get(FLEET_PARTNER_ID_HEADER)?.trim();
  if (fromHeader) {
    return fromHeader;
  }

  const fromEnv = process.env.DRTS_FLEET_PARTNER_ID?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  throw new Error(
    "Missing fleet scope configuration: DRTS_FLEET_PARTNER_ID environment variable or x-fleet-partner-id header is required.",
  );
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

function isRunAppTarget(targetUrl: URL): boolean {
  return targetUrl.hostname.endsWith(RUN_APP_HOST_SUFFIX);
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

async function applyUpstreamAuth(
  headers: Headers,
  request: NextRequest,
  targetUrl: URL,
) {
  const fleetPartnerId = resolveFleetPartnerId(request.headers);

  headers.set("x-actor-type", "partner_api_key");
  headers.set("x-actor-id", fleetPartnerId);
  headers.set("x-partner-id", fleetPartnerId);
  headers.set("x-realm", "partner");
  headers.set("x-roles", "partner");
  headers.set("x-role-families", "partner");
  // Supply writes need the partner capability, while this API family is
  // classified under the billing-read policy for every fleet-partner route.
  headers.set("x-scopes", "billing:read partner:read partner:write");
  headers.set(FLEET_PARTNER_ID_HEADER, fleetPartnerId);

  const iapEmail = request.headers.get(CONTROL_PLANE_IAP_EMAIL_HEADER);
  if (iapEmail) {
    headers.set(CONTROL_PLANE_IAP_EMAIL_HEADER, iapEmail);
  }

  const requestId = request.headers.get("x-request-id");
  if (requestId) {
    headers.set("x-request-id", requestId);
  }

  const protectedAudience = process.env.DRTS_API_AUTH_AUDIENCE?.trim();
  if (protectedAudience) {
    const metadataToken = await mintMetadataIdentityToken(protectedAudience);
    if (metadataToken) {
      headers.set("authorization", `Bearer ${metadataToken}`);
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
  const targetUrl = buildTargetUrl(request, path);
  const headers = copyRequestHeaders(request);
  try {
    await applyUpstreamAuth(headers, request, targetUrl);
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 400 },
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
