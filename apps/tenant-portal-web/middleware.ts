import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "drts_session";
const CSRF_COOKIE_NAME = "drts_csrf";
const PUBLIC_PATHS = ["/login", "/api/auth"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // 1. Security Headers
  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );

  // 2. CSRF Token Check for State-Mutating Requests (POST, PUT, DELETE, PATCH)
  if (["POST", "PUT", "DELETE", "PATCH"].includes(request.method) && !pathname.startsWith("/api/auth")) {
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

  // 3. Protected Route Session Check
  if (!isPublic) {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const legacySessionCookie = request.cookies.get("tenant-portal-session")?.value;

    if (!sessionCookie && !legacySessionCookie) {
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
