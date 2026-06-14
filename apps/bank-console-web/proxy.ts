import { NextRequest, NextResponse } from "next/server";

const LOGIN_PATH = "/login";
const SIGNED_OUT_COOKIE = "drts-bank-console-signed-out";
const AUTH_BOUNDARY_HEADER = "x-drts-bank-console-auth-boundary";
const LOCALE_HEADER = "x-drts-bank-console-locale";

function addNoStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function nextResponse(request: NextRequest, authBoundary = false) {
  const requestHeaders = new Headers(request.headers);
  const locale = request.nextUrl.searchParams.get("locale");

  if (locale) {
    requestHeaders.set(LOCALE_HEADER, locale);
  } else {
    requestHeaders.delete(LOCALE_HEADER);
  }

  if (authBoundary) {
    requestHeaders.set(AUTH_BOUNDARY_HEADER, "1");
  } else {
    requestHeaders.delete(AUTH_BOUNDARY_HEADER);
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

function setSignedOutCookie(response: NextResponse) {
  response.cookies.set(SIGNED_OUT_COOKIE, "1", {
    maxAge: 60 * 60,
    path: "/",
    sameSite: "lax",
  });
  return response;
}

function clearSignedOutCookie(response: NextResponse) {
  response.cookies.set(SIGNED_OUT_COOKIE, "", {
    maxAge: 0,
    path: "/",
    sameSite: "lax",
  });
  return response;
}

export function proxy(request: NextRequest) {
  const { nextUrl } = request;
  const signedOut =
    nextUrl.searchParams.get("signedOut") === "1" ||
    request.cookies.get(SIGNED_OUT_COOKIE)?.value === "1";

  if (nextUrl.pathname === LOGIN_PATH) {
    const response = addNoStore(
      nextResponse(request, nextUrl.searchParams.get("signedOut") === "1"),
    );
    return nextUrl.searchParams.get("signedOut") === "1"
      ? setSignedOutCookie(response)
      : clearSignedOutCookie(response);
  }

  if (!signedOut) {
    return addNoStore(nextResponse(request));
  }

  const redirectUrl = nextUrl.clone();
  redirectUrl.pathname = LOGIN_PATH;
  redirectUrl.search = "";

  const bank = nextUrl.searchParams.get("bank");
  const locale = nextUrl.searchParams.get("locale");

  if (bank) {
    redirectUrl.searchParams.set("bank", bank);
  }
  if (locale) {
    redirectUrl.searchParams.set("locale", locale);
  }
  redirectUrl.searchParams.set("signedOut", "1");

  return setSignedOutCookie(addNoStore(NextResponse.redirect(redirectUrl)));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
