import { NextRequest, NextResponse } from "next/server";
import {
  CONTROL_PLANE_REQUEST_HEADER_BLOCKLIST,
  issueControlPlaneRequestAuth,
  stripControlPlaneAuthQueryParams,
} from "@drts/control-plane-auth";

const DEFAULT_API_BASE_URL = "http://localhost:3001";
// ROC routes are guarded by `@RequireRealms("system", "ops")` (P2-ROC-001) and
// `auth.policy` maps `roc/*` to `baseAllowedRealms("ops")`. There is no separate
// `roc` auth realm (decision packet §C2: no new console/auth realm; §10.3 keeps
// the existing controller prefix/authority), so ROC duty staff authenticate as
// an `ops_user` in the `ops` realm. The ROC-specific fallback email keeps audit
// attribution distinct from the generic Ops Console operator when no IAP
// identity is present.
const ROC_DUTY_OPERATOR_EMAIL = "roc-duty@platform.drts";
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
  ...CONTROL_PLANE_REQUEST_HEADER_BLOCKLIST,
]);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function resolveTargetOrigin(): string {
  return process.env.DRTS_API_URL || DEFAULT_API_BASE_URL;
}

function resolveTargetAudience(targetUrl: URL): string {
  return process.env.DRTS_API_AUTH_AUDIENCE || targetUrl.origin;
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
  stripControlPlaneAuthQueryParams(targetUrl);
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
      console.error("[control-plane-proxy] metadata token request failed", {
        audience,
        status: response.status,
      });
      return null;
    }

    return response.text();
  } catch (error) {
    console.error("[control-plane-proxy] metadata token request errored", {
      audience,
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
  const drtsEnv = (process.env.DRTS_ENV || process.env.APP_ENV || "")
    .trim()
    .toLowerCase();

  const isDevEnv =
    drtsEnv === "development" ||
    drtsEnv === "dev" ||
    drtsEnv === "local" ||
    drtsEnv === "sandbox" ||
    process.env.NODE_ENV !== "production";

  const strictIapMode =
    process.env.STRICT_IAP_MODE === "true" ||
    (!isDevEnv && process.env.NODE_ENV === "production");

  const allowUnverifiedTokenInDev =
    isDevEnv && process.env.ALLOW_UNVERIFIED_IAP_DEV === "true";
  const iapJwtSecretOrPublicKey =
    process.env.IAP_JWT_SECRET_OR_PUBLIC_KEY ||
    process.env.IAP_JWT_SECRET ||
    process.env.JWT_SECRET;
  const expectedIapAudience =
    process.env.IAP_EXPECTED_AUDIENCE ||
    process.env.IAP_AUDIENCE ||
    process.env.JWT_AUDIENCE;
  const expectedIapIssuer = process.env.IAP_EXPECTED_ISSUER;

  const controlPlaneAuth = issueControlPlaneRequestAuth({
    actorType: "ops_user",
    headers: request.headers,
    defaultEmail: ROC_DUTY_OPERATOR_EMAIL,
    requestId: request.headers.get("x-request-id"),
    strictIapMode,
    ...(iapJwtSecretOrPublicKey ? { iapJwtSecretOrPublicKey } : {}),
    ...(expectedIapAudience ? { expectedIapAudience } : {}),
    ...(expectedIapIssuer ? { expectedIapIssuer } : {}),
    ...(allowUnverifiedTokenInDev ? { allowUnverifiedTokenInDev } : {}),
    ...(process.env.JWT_SECRET ? { jwtSecret: process.env.JWT_SECRET } : {}),
    ...(process.env.JWT_ISSUER ? { jwtIssuer: process.env.JWT_ISSUER } : {}),
    ...(process.env.JWT_AUDIENCE
      ? { jwtAudience: process.env.JWT_AUDIENCE }
      : {}),
  });

  for (const [key, value] of Object.entries(controlPlaneAuth.headers) as Array<
    [string, string]
  >) {
    headers.set(key, value);
  }

  if (process.env.DRTS_API_AUTH_AUDIENCE) {
    const metadataToken = await mintMetadataIdentityToken(
      resolveTargetAudience(targetUrl),
    );
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
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    const isForbidden =
      message.includes("audience mismatch") ||
      message.includes("does not possess") ||
      message.includes("unmapped") ||
      message.includes("no valid workforce group membership");
    const status = isForbidden ? 403 : 401;
    const code = isForbidden
      ? message.includes("audience mismatch")
        ? "IAP_AUDIENCE_MISMATCH"
        : "IAP_SUBJECT_FORBIDDEN"
      : "IAP_ASSERTION_INVALID";
    return NextResponse.json(
      {
        error: {
          code,
          message,
        },
      },
      { status },
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
