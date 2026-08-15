import { NextRequest, NextResponse } from "next/server";
import {
  TENANT_SESSION_COOKIE_NAME,
  TENANT_CSRF_COOKIE_NAME,
  TENANT_CSRF_HEADER_NAME,
  TENANT_LOGIN_PATH,
  PUBLIC_AUTH_PATHS,
} from "@/lib/auth/constants";

function timingSafeMatch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const aTrimmed = a.trim();
  const bTrimmed = b.trim();
  if (aTrimmed.length !== bTrimmed.length || aTrimmed.length === 0) return false;
  let mismatch = 0;
  for (let i = 0; i < aTrimmed.length; i++) {
    mismatch |= aTrimmed.charCodeAt(i) ^ bTrimmed.charCodeAt(i);
  }
  return mismatch === 0;
}

function isSameOrigin(request: NextRequest): boolean {
  const originHeader = request.headers.get("origin")?.trim();
  const refererHeader = request.headers.get("referer")?.trim();
  const targetOrigin = request.nextUrl.origin;

  if (originHeader) {
    return originHeader === targetOrigin;
  }

  if (refererHeader) {
    try {
      const refererUrl = new URL(refererHeader);
      return refererUrl.origin === targetOrigin;
    } catch {
      return false;
    }
  }

  return false;
}

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

  // 2. CSRF & Same-Origin check for state-mutating requests
  if (
    !isPublic &&
    ["POST", "PUT", "DELETE", "PATCH"].includes(request.method.toUpperCase())
  ) {
    if (!isSameOrigin(request)) {
      return new NextResponse(
        JSON.stringify({
          error: "CSRF_ORIGIN_INVALID",
          message: "Origin verification failed for mutation request.",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const csrfCookie = request.cookies.get(TENANT_CSRF_COOKIE_NAME)?.value;
    const csrfHeader = request.headers.get(TENANT_CSRF_HEADER_NAME);

    if (!timingSafeMatch(csrfCookie, csrfHeader)) {
      return new NextResponse(
        JSON.stringify({
          error: "CSRF_TOKEN_INVALID",
          message: "CSRF verification failed for mutation request.",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  // 3. Protected Route Session Check
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
