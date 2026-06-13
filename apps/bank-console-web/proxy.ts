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
  response.cookies.delete(SIGNED_OUT_COOKIE);
  return withNoStore(response);
}

function redirectToSignedOutLogin(request: NextRequest) {
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

  return setSignedOut(NextResponse.redirect(redirectUrl));
}

export function proxy(request: NextRequest) {
  const { nextUrl } = request;
  const isLoginPath = nextUrl.pathname === LOGIN_PATH;
  const isSignedOutRequest = nextUrl.searchParams.get("signedOut") === "1";
  const isDemoSignInRequest =
    nextUrl.pathname === "/" && nextUrl.searchParams.has("role");
  const isSignedOutCookie =
    request.cookies.get(SIGNED_OUT_COOKIE)?.value === "1";

  if (isDemoSignInRequest) {
    return clearSignedOut(NextResponse.next());
  }

  if (isSignedOutRequest) {
    if (isLoginPath) {
      return setSignedOut(NextResponse.next());
    }
    return redirectToSignedOutLogin(request);
  }

  if (isSignedOutCookie) {
    return redirectToSignedOutLogin(request);
  }

  return withNoStore(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
