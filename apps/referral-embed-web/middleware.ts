import { NextRequest, NextResponse } from "next/server";
import {
  applyEmbedSecurityHeaders,
  buildEmbedSecurityDecision,
} from "./lib/embed-security";

const EMBED_ALLOWED_ENTRY_HOSTS_ENV = "REFERRAL_EMBED_ALLOWED_HOSTS";
const REFERRAL_EMBED_SESSION_COOKIE = "drts_referral_embed_session";

function decodeSessionHint(value: string | undefined) {
  if (!value) {
    return null;
  }
  const [body] = value.split(".");
  if (!body) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as Partial<{
      partnerEntrySlug: string;
      entryHost: string;
    }>;
    if (
      typeof parsed.partnerEntrySlug !== "string" ||
      typeof parsed.entryHost !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function createBlockedResponse(
  decision: ReturnType<typeof buildEmbedSecurityDecision>,
) {
  const response = new NextResponse("Embedded access denied.", {
    status: 403,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
  applyEmbedSecurityHeaders(response.headers, decision);
  return response;
}

export function middleware(request: NextRequest) {
  let decision = buildEmbedSecurityDecision({
    allowedEntryHostsEnv: process.env[EMBED_ALLOWED_ENTRY_HOSTS_ENV],
    headers: request.headers,
    requestUrl: request.nextUrl,
  });

  // The entry-host allowlist only governs the EMBEDDED surface (/embed/*).
  // Standalone passenger routes are always served (with security headers) so the
  // direct site stays reachable even when no embed allowlist is configured
  // (e.g. dev / direct browsing). Only a blocked /embed/* request is denied.
  const isEmbedRoute = request.nextUrl.pathname.startsWith("/embed/");
  if (isEmbedRoute) {
    const sessionHint = decodeSessionHint(
      request.cookies.get(REFERRAL_EMBED_SESSION_COOKIE)?.value,
    );
    const entrySlug =
      request.nextUrl.pathname.split("/").filter(Boolean)[1] ?? null;
    if (sessionHint && entrySlug && sessionHint.partnerEntrySlug !== entrySlug) {
      return createBlockedResponse({
        ...decision,
        block: true,
        blockReason: "cross_entry_session_forbidden",
        allowedPostMessageOrigins: [],
        contentSecurityPolicy:
          "base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'none'",
        xFrameOptions: "DENY",
      });
    }
    if (
      sessionHint &&
      decision.requestedEntryHost &&
      sessionHint.entryHost !== decision.requestedEntryHost
    ) {
      return createBlockedResponse({
        ...decision,
        block: true,
        blockReason: "entry_host_session_forbidden",
        allowedPostMessageOrigins: [],
        contentSecurityPolicy:
          "base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'none'",
        xFrameOptions: "DENY",
      });
    }
    if (
      sessionHint &&
      decision.blockReason === "origin_not_authorized" &&
      decision.requestedEntryHost === sessionHint.entryHost
    ) {
      const trustedHeaders = new Headers(request.headers);
      trustedHeaders.delete("origin");
      trustedHeaders.delete("referer");
      decision = buildEmbedSecurityDecision({
        allowedEntryHostsEnv: process.env[EMBED_ALLOWED_ENTRY_HOSTS_ENV],
        headers: trustedHeaders,
        requestUrl: request.nextUrl,
      });
    }
  }
  if (isEmbedRoute && decision.block) {
    return createBlockedResponse(decision);
  }

  if (isEmbedRoute) {
    const artifact =
      request.nextUrl.searchParams.get("artifact") ||
      request.nextUrl.searchParams.get("token");
    const entrySlug =
      request.nextUrl.pathname.split("/").filter(Boolean)[1] ?? null;

    if (artifact && entrySlug) {
      const exchangeUrl = new URL("/api/referral/session", request.url);
      exchangeUrl.searchParams.set("action", "exchange");
      exchangeUrl.searchParams.set("artifact", artifact);
      exchangeUrl.searchParams.set("entrySlug", entrySlug);
      if (decision.requestedEntryHost) {
        exchangeUrl.searchParams.set("entryHost", decision.requestedEntryHost);
      }
      const returnUrl = new URL(request.nextUrl.pathname, request.url);
      for (const [k, v] of request.nextUrl.searchParams.entries()) {
        if (k !== "artifact" && k !== "token") {
          returnUrl.searchParams.set(k, v);
        }
      }
      exchangeUrl.searchParams.set(
        "returnTo",
        returnUrl.pathname + returnUrl.search,
      );
      const redirectResponse = NextResponse.redirect(exchangeUrl);
      applyEmbedSecurityHeaders(redirectResponse.headers, decision);
      return redirectResponse;
    }
  }

  const response = NextResponse.next();
  applyEmbedSecurityHeaders(response.headers, decision);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
