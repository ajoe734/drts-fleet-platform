import { NextRequest, NextResponse } from "next/server";
import {
  BANK_CONSOLE_ROLE_COOKIE,
  BANK_CONSOLE_SESSION_COOKIE,
  resolveBankConsoleRole,
  signSessionRole,
  verifyAuthenticatedIdentityAndRole,
} from "@/lib/session";

const SIGNED_OUT_COOKIE = "drts_bank_console_signed_out";

// The browser acceptance runner exercises the public Dev Cloud Run URL, where
// it cannot attach a trusted-proxy header.  This opt-in is injected only by the
// Dev deployment job; production still requires a verified IAP/proxy identity.
function allowsDevDemoLogin() {
  return (
    process.env.DRTS_ENV === "development" &&
    process.env.BANK_CONSOLE_DEMO_LOGIN === "true"
  );
}

const cookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  httpOnly: true,
};

export async function POST(request: NextRequest) {
  try {
    let bank = "ctbc";
    let locale = "zh";
    let role = "bank_program_admin";

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      bank = body.bank || bank;
      locale = body.locale || locale;
      role = body.role || role;
    } else {
      const formData = await request.formData();
      bank = (formData.get("bank") as string) || bank;
      locale = (formData.get("locale") as string) || locale;
      role = (formData.get("role") as string) || role;
    }

    const resolvedRole = resolveBankConsoleRole(role);
    if (!resolvedRole) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: `Authentication rejected: unrecognized requested role (${role}).`,
          },
        },
        { status: 403 },
      );
    }

    const authCheck = allowsDevDemoLogin()
      ? { allowed: true, role: resolvedRole, bank }
      : verifyAuthenticatedIdentityAndRole(request.headers, resolvedRole, bank);

    if (!authCheck.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "FORBIDDEN",
            message:
              authCheck.reason ||
              "Role escalation rejected: missing or invalid authenticated identity claim.",
          },
        },
        { status: 403 },
      );
    }

    const signedRole = authCheck.role;
    const signedBank = authCheck.bank || bank;
    const signedToken = signSessionRole(signedRole, signedBank);

    const redirectUrl = new URL("/", request.url);
    redirectUrl.searchParams.set("bank", signedBank);
    redirectUrl.searchParams.set("locale", locale);
    redirectUrl.searchParams.set("role", signedRole);

    const response = NextResponse.redirect(redirectUrl, { status: 303 });
    response.cookies.set(BANK_CONSOLE_ROLE_COOKIE, signedToken, cookieOptions);
    response.cookies.set(
      BANK_CONSOLE_SESSION_COOKIE,
      signedToken,
      cookieOptions,
    );
    response.cookies.delete(SIGNED_OUT_COOKIE);
    response.cookies.set(SIGNED_OUT_COOKIE, "", {
      path: "/",
      sameSite: "lax",
      expires: new Date(0),
      maxAge: 0,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    return NextResponse.json(
      { ok: false, error: { message } },
      { status: 500 },
    );
  }
}
