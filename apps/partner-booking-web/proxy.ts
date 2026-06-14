import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { PARTNER_LOCALE_COOKIE } from "./lib/locale-config";
import { type Locale, translations } from "./lib/translations";

const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function normalizeLocale(value: string | null): Locale | null {
  return value && value in translations ? (value as Locale) : null;
}

function withLocaleCookieHeader(cookieHeader: string | null, locale: Locale) {
  const cookies = new Map<string, string>();
  for (const pair of cookieHeader?.split(";") ?? []) {
    const [name, ...valueParts] = pair.trim().split("=");
    if (!name || valueParts.length === 0) {
      continue;
    }
    cookies.set(name, valueParts.join("="));
  }
  cookies.set(PARTNER_LOCALE_COOKIE, locale);

  return Array.from(cookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

export function proxy(request: NextRequest) {
  const locale = normalizeLocale(request.nextUrl.searchParams.get("locale"));
  if (!locale) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    "cookie",
    withLocaleCookieHeader(requestHeaders.get("cookie"), locale),
  );

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.cookies.set(PARTNER_LOCALE_COOKIE, locale, {
    maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
  });

  return response;
}
