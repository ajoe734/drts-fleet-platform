import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "drts_session";
const CSRF_COOKIE_NAME = "drts_csrf";
const PUBLIC_PATHS = ["/login", "/api/auth"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // 1. Security Headers
  // Override inbound metadata: layouts need the actual route to avoid
  // fetching fleet-admin navigation data for Host-only pages.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-drts-fleet-pathname", pathname);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const candidateSha = process.env.DRTS_CANDIDATE_SHA?.trim() || "unconfigured";
  response.headers.set("x-drts-candidate-sha", candidateSha);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );

  // CSRF protects browser cookie sessions. The Dev portal deliberately runs
  // stateless until its complete login surface is enabled, so it must not
  // reject a BFF mutation that carries no session cookie to forge.
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (
    sessionCookie &&
    ["POST", "PUT", "DELETE", "PATCH"].includes(request.method)
  ) {
    const csrfCookie = request.cookies.get(CSRF_COOKIE_NAME)?.value;
    const csrfHeader = request.headers.get("x-csrf-token");

    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      return new NextResponse(
        JSON.stringify({
          error: "CSRF_TOKEN_INVALID",
          message: "CSRF verification failed for mutation request.",
        }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }
  }

  // With DRTS_FLEET_PORTAL_AUTH_REQUIRED=true a request needs an application
  // session: the browser's drts_session cookie from Google login (/login →
  // /api/auth/login), or a session bearer in x-drts-authorization, which the
  // operational harness and Host callers send and the BFF already forwards.
  // Presence is all this gate checks; the API verifies the session itself.
  if (!isPublic && process.env.DRTS_FLEET_PORTAL_AUTH_REQUIRED === "true") {
    const headerSession = /^Bearer\s+\S+/i.test(
      request.headers.get("x-drts-authorization")?.trim() ?? "",
    );
    if (!sessionCookie && !headerSession) {
      if (pathname.startsWith("/control-plane-proxy/")) {
        return NextResponse.json(
          {
            error: "AUTHENTICATION_REQUIRED",
            message: "Fleet partner session required.",
          },
          { status: 401 },
        );
      }
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set(
        "redirect_uri",
        `${pathname}${request.nextUrl.search}`,
      );
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
