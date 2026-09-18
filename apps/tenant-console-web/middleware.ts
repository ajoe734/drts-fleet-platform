import { NextRequest, NextResponse } from "next/server";
import {
  TENANT_SESSION_COOKIE_NAME,
  TENANT_LOGIN_PATH,
  PUBLIC_AUTH_PATHS,
} from "@/lib/auth/constants";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_AUTH_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  // 1. Security Headers
  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );

  // 2. Protected Route Session Check
  if (!isPublic) {
    const sessionCookie = request.cookies.get(TENANT_SESSION_COOKIE_NAME)?.value;

    if (!sessionCookie) {
      // Return 401 JSON for API and proxy routes
      if (
        pathname.startsWith("/api/") ||
        pathname.startsWith("/control-plane-proxy/")
      ) {
        return new NextResponse(
          JSON.stringify({
            active: false,
            error: "AUTHENTICATION_REQUIRED",
            message: "Active tenant session required.",
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Redirect for page navigation
      const loginUrl = new URL(TENANT_LOGIN_PATH, request.url);
      const redirectUri = `${pathname}${search}`;
      loginUrl.searchParams.set("redirect_uri", redirectUri);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
