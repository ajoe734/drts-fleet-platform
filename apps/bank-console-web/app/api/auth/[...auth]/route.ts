import { NextRequest, NextResponse } from "next/server";
import { createTenantAuthHandlers } from "@drts/tenant-auth";
import {
  BankUserApiError,
  projectBankSessionReadback,
} from "../../../../lib/bank-user-identity";
import {
  BANK_CONSOLE_ROLE_COOKIE,
  BANK_CONSOLE_SESSION_COOKIE,
} from "../../../../lib/session";

const SIGNED_OUT_COOKIE = "drts_bank_console_signed_out";
const handlers = createTenantAuthHandlers();

export const dynamic = "force-dynamic";
export const POST = handlers.POST;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ auth: string[] }> },
) {
  const { auth = [] } = await context.params;
  const actionPath = auth.join("/");
  if (actionPath !== "session") {
    return handlers.GET(request, context);
  }

  if (request.cookies.get(SIGNED_OUT_COOKIE)?.value === "1") {
    return NextResponse.json(
      { active: false, error: "AUTHENTICATION_REQUIRED" },
      { status: 401, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  const upstreamResponse = await handlers.GET(request, context);
  if (upstreamResponse.status !== 200) {
    return upstreamResponse;
  }

  try {
    const upstreamBody: unknown = await upstreamResponse.json();
    const projected = projectBankSessionReadback(upstreamBody, {
      signedRoleCookie: request.cookies.get(BANK_CONSOLE_ROLE_COOKIE)?.value,
      signedSessionCookie: request.cookies.get(BANK_CONSOLE_SESSION_COOKIE)
        ?.value,
      signedOutCookie: request.cookies.get(SIGNED_OUT_COOKIE)?.value,
    });
    const headers: Record<string, string> = {
      "Cache-Control": "no-store, max-age=0",
    };
    const candidateSha = upstreamResponse.headers.get("x-drts-candidate-sha");
    if (candidateSha) {
      headers["x-drts-candidate-sha"] = candidateSha;
    }
    return NextResponse.json(projected, { status: 200, headers });
  } catch (error) {
    if (error instanceof BankUserApiError) {
      return NextResponse.json(
        {
          active: false,
          ...(typeof error.body === "object" && error.body !== null
            ? (error.body as Record<string, unknown>)
            : { error: "AUTHENTICATION_REQUIRED" }),
        },
        {
          status: error.status,
          headers: { "Cache-Control": "no-store, max-age=0" },
        },
      );
    }
    return NextResponse.json(
      { active: false, error: "AUTHENTICATION_REQUIRED" },
      { status: 401, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
