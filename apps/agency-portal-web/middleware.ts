import { NextRequest, NextResponse } from "next/server";
import {
  AGENCY_LOGIN_PATH,
  AGENCY_SESSION_COOKIE_NAME,
  PUBLIC_AGENCY_PATHS,
} from "@drts/agency-auth/constants";

/**
 * Cookie presence gate only; every page and BFF call re-verifies the session
 * against the API, which re-checks membership, agency status and expiry.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_AGENCY_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (isPublic || request.cookies.get(AGENCY_SESSION_COOKIE_NAME)?.value) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { active: false, error: "AUTHENTICATION_REQUIRED" },
      { status: 401 },
    );
  }
  const loginUrl = new URL(AGENCY_LOGIN_PATH, request.url);
  loginUrl.searchParams.set("redirect_uri", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
