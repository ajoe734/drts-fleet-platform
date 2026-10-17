import { NextRequest, NextResponse } from "next/server";
import { IDENTITY_SESSION_CSRF_COOKIE } from "../../../lib/identity-session-csrf";
import {
  issueIdentitySessionCsrf,
  verifyIdentitySessionOrigin,
} from "../../../lib/identity-session-csrf.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const headers = {
    "Cache-Control": "no-store",
    Vary: "Origin, Referer, Cookie",
  };
  if (!verifyIdentitySessionOrigin(request)) {
    return NextResponse.json(
      { error: { code: "CSRF_ORIGIN_INVALID" } },
      { status: 403, headers },
    );
  }
  try {
    const proof = issueIdentitySessionCsrf(request);
    const response = NextResponse.json({ token: proof.token }, { headers });
    response.cookies.set(IDENTITY_SESSION_CSRF_COOKIE, proof.cookie, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
    return response;
  } catch {
    return NextResponse.json(
      { error: { code: "CSRF_PROOF_UNAVAILABLE" } },
      { status: 503, headers },
    );
  }
}
