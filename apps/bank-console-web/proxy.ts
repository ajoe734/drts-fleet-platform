import { NextRequest, NextResponse } from "next/server";

const LOGIN_PATH = "/login";

export function proxy(request: NextRequest) {
  const { nextUrl } = request;

  if (
    nextUrl.searchParams.get("signedOut") !== "1" ||
    nextUrl.pathname === LOGIN_PATH
  ) {
    return NextResponse.next();
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

  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
