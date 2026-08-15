import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "drts_session";
const CSRF_COOKIE_NAME = "drts_csrf";
const PUBLIC_PATHS = ["/login", "/api/auth"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // 1. Security Headers
  const response = NextResponse.next();
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

  // The portal does not ship a login route yet.  Keeping the unfinished gate
  // enabled turns every deployed route into /login → 404, including the
  // required operational dashboard.  Auth remains opt-in until that flow is
  // deployed as one complete surface.
  if (!isPublic && process.env.DRTS_FLEET_PORTAL_AUTH_REQUIRED === "true") {
    if (!sessionCookie) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect_uri", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
