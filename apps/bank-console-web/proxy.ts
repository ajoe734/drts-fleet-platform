import { NextRequest, NextResponse } from "next/server";

const LOGIN_PATH = "/login";
const SIGNED_OUT_COOKIE = "drts_bank_console_signed_out";

const signedOutCookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

function withNoStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

function setSignedOut(response: NextResponse) {
  response.cookies.set(SIGNED_OUT_COOKIE, "1", signedOutCookieOptions);
  return withNoStore(response);
}

function clearSignedOut(response: NextResponse) {
  response.cookies.set(SIGNED_OUT_COOKIE, "", {
    ...signedOutCookieOptions,
    expires: new Date(0),
    maxAge: 0,
  });
  return withNoStore(response);
}

function isPrefetchRequest(request: NextRequest) {
  const purpose = request.headers.get("purpose")?.toLowerCase();
  const secPurpose = request.headers.get("sec-purpose")?.toLowerCase();
  const fetchDestination = request.headers.get("sec-fetch-dest")?.toLowerCase();

  // Next strips internal flight headers before proxy execution in production,
  // while the browser's fetch destination survives and still distinguishes
  // background RSC work from a document navigation.
  return (
    fetchDestination === "empty" ||
    request.headers.get("rsc") === "1" ||
    request.headers.get("next-router-prefetch") === "1" ||
    purpose === "prefetch" ||
    secPurpose === "prefetch"
  );
}

function redirectToSignedOutLogin(
  request: NextRequest,
  { persistCookie = true }: { persistCookie?: boolean } = {},
) {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = LOGIN_PATH;
  redirectUrl.search = "";

  const bank = request.nextUrl.searchParams.get("bank");
  const locale = request.nextUrl.searchParams.get("locale");

  if (bank) {
    redirectUrl.searchParams.set("bank", bank);
  }
  if (locale) {
    redirectUrl.searchParams.set("locale", locale);
  }
  redirectUrl.searchParams.set("signedOut", "1");

  const response = NextResponse.redirect(redirectUrl);
  return persistCookie ? setSignedOut(response) : withNoStore(response);
}

export function proxy(request: NextRequest) {
  const { nextUrl } = request;
  const isLoginPath = nextUrl.pathname === LOGIN_PATH;
  const isSignedOutRequest = nextUrl.searchParams.get("signedOut") === "1";
  const isPrefetch = isPrefetchRequest(request);
  const isDemoSignInRequest =
    nextUrl.pathname === "/" && nextUrl.searchParams.has("role");
  const isSignedOutCookie =
    request.cookies.get(SIGNED_OUT_COOKIE)?.value === "1";

  if (isDemoSignInRequest) {
    if (isPrefetch) {
      return redirectToSignedOutLogin(request, { persistCookie: false });
    }
    return clearSignedOut(NextResponse.next());
  }

  if (isSignedOutRequest) {
    if (isLoginPath) {
      if (isPrefetch) {
        return withNoStore(NextResponse.next());
      }
      return setSignedOut(NextResponse.next());
    }
    return redirectToSignedOutLogin(request, { persistCookie: !isPrefetch });
  }

  if (isSignedOutCookie) {
    return redirectToSignedOutLogin(request, {
      persistCookie: !isPrefetch,
    });
  }

  return withNoStore(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
