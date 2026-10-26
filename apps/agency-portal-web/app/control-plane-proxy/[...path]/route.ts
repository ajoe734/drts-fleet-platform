import { NextRequest, NextResponse } from "next/server";
import {
  tenantAuthFetch as agencyAuthFetch,
  resolveTenantApiUrl as resolveApiUrl,
} from "@drts/tenant-auth/api-fetch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Signed controlled-download links (/downloads/:kind/:subjectId, rewritten
// here by next.config.ts) are the only traffic this proxy carries. The API
// route is an open route: the signed query is the credential, so no session
// or client request header is forwarded.
const RESPONSE_HEADER_BLOCKLIST = new Set([
  "connection",
  "content-encoding",
  "transfer-encoding",
  "set-cookie",
]);

function isSafeSegment(segment: string) {
  return (
    segment.length > 0 &&
    segment !== "." &&
    segment !== ".." &&
    !segment.includes("/") &&
    !segment.includes("\\")
  );
}

function isAllowedDownloadPath(path: string[]) {
  return (
    path.length === 3 && path[0] === "downloads" && path.every(isSafeSegment)
  );
}

function copyResponseHeaders(response: Response) {
  const headers = new Headers();
  response.headers.forEach((value, key) => {
    if (RESPONSE_HEADER_BLOCKLIST.has(key.toLowerCase())) {
      return;
    }
    headers.set(key, value);
  });
  return headers;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (!isAllowedDownloadPath(path)) {
    return NextResponse.json(
      { error: "AGENCY_CONSOLE_PROXY_PATH_NOT_ALLOWED" },
      { status: 404 },
    );
  }

  const targetUrl = new URL(["api", ...path].join("/"), `${resolveApiUrl()}/`);
  // Keep the original encoding: the signature covers these exact characters.
  targetUrl.search = request.nextUrl.search;

  let upstream: Response;
  try {
    upstream = await agencyAuthFetch(targetUrl.toString(), { method: "GET" });
  } catch (error) {
    return NextResponse.json(
      {
        error: "AGENCY_API_UNAVAILABLE",
        message: error instanceof Error ? error.message : "API unreachable",
      },
      { status: 503 },
    );
  }

  // Stream the raw body: a successful download is a binary StreamableFile.
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: copyResponseHeaders(upstream),
  });
}
