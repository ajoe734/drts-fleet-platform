import { NextRequest, NextResponse } from "next/server";
import {
  applyEmbedSecurityHeaders,
  buildEmbedSecurityDecision,
} from "@/lib/embed-security";

const EMBED_ALLOWED_ENTRY_HOSTS_ENV = "REFERRAL_EMBED_ALLOWED_HOSTS";

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
  const decision = buildEmbedSecurityDecision({
    allowedEntryHostsEnv: process.env[EMBED_ALLOWED_ENTRY_HOSTS_ENV],
    headers: request.headers,
    requestUrl: request.nextUrl,
  });

  // The entry-host allowlist only governs the EMBEDDED surface (/embed/*).
  // Standalone passenger routes are always served (with security headers) so the
  // direct site stays reachable even when no embed allowlist is configured
  // (e.g. dev / direct browsing). Only a blocked /embed/* request is denied.
  const isEmbedRoute = request.nextUrl.pathname.startsWith("/embed/");
  if (isEmbedRoute && decision.block) {
    return createBlockedResponse(decision);
  }

  const response = NextResponse.next();
  applyEmbedSecurityHeaders(response.headers, decision);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
