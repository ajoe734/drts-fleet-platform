import { NextRequest, NextResponse } from "next/server";
import {
  TENANT_CSRF_COOKIE_NAME,
  TENANT_CSRF_HEADER_NAME,
  TENANT_SESSION_COOKIE_NAME,
} from "@drts/tenant-auth/constants";
import { verifyCsrfToken, verifySameOrigin } from "@drts/tenant-auth/session";
import {
  BankUserApiError,
  bankUserError,
  getBankUserIdentity,
} from "../../../lib/bank-user-identity";
import {
  loadBankUserDirectory,
  mutateBankUser,
} from "../../../lib/bank-user-mutations";

export const dynamic = "force-dynamic";

async function handle(request: NextRequest, mutation: boolean) {
  try {
    if (mutation) {
      if (!verifySameOrigin(request))
        bankUserError(403, "CSRF_ORIGIN_INVALID", "Origin validation failed.");
      if (
        !verifyCsrfToken(
          request.cookies.get(TENANT_CSRF_COOKIE_NAME)?.value,
          request.headers.get(TENANT_CSRF_HEADER_NAME),
        )
      )
        bankUserError(403, "CSRF_TOKEN_INVALID", "CSRF verification failed.");
    }
    // Explicit empty token prevents falling back to ambient cookies.
    const identity = await getBankUserIdentity(
      request.cookies.get(TENANT_SESSION_COOKIE_NAME)?.value ?? "",
    );
    const data = mutation
      ? await mutateBankUser(identity, await request.json().catch(() => null))
      : await loadBankUserDirectory(identity);
    return NextResponse.json(
      { data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      error instanceof BankUserApiError
        ? error.body
        : {
            error: {
              code: "BANK_USERS_UNAVAILABLE",
              message:
                "User service unavailable. Reload to confirm state before retrying.",
            },
          },
      {
        status: error instanceof BankUserApiError ? error.status : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

export function GET(request: NextRequest) {
  return handle(request, false);
}
export function POST(request: NextRequest) {
  return handle(request, true);
}
