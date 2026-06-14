import { NextRequest, NextResponse } from "next/server";
import {
  applyEmbedSecurityHeaders,
  buildEmbedSecurityDecision,
} from "@/lib/embed-security";

const EMBED_ALLOWED_ENTRY_HOSTS_ENV = "PASSENGER_WEB_EMBED_ALLOWED_HOSTS";

function createBlockedResponse(
  decision: ReturnType<typeof buildEmbedSecurityDecision>,
  request: NextRequest,
) {
  const isEmbedRoute = request.nextUrl.pathname.startsWith("/embed/");
  const response = isEmbedRoute
    ? NextResponse.next()
    : new NextResponse("Embedded access denied.", {
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

  if (decision.block) {
    return createBlockedResponse(decision, request);
  }

  const response = NextResponse.next();
  applyEmbedSecurityHeaders(response.headers, decision);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
