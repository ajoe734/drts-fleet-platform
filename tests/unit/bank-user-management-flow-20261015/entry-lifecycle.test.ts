import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import * as constants from "../../../packages/tenant-auth/src/constants";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";
const appRoot = resolve("apps/bank-console-web");
const load = createUiModuleLoader(appRoot, {
  "next/server": { NextRequest, NextResponse },
  "@drts/tenant-auth/constants": constants,
  "./lib/session": {
    BANK_CONSOLE_SESSION_COOKIE: "drts_bank_console_session",
    BANK_CONSOLE_ROLE_COOKIE: "drts_bank_console_role",
  },
});
const { proxy } = load<{ proxy(req: NextRequest): NextResponse }>(
  resolve(appRoot, "proxy.ts"),
);
describe("Bank actual proxy managed-session entry lifecycle", () => {
  it.each([
    "tenant/login",
    "tenant/callback",
    "session",
    "logout",
    "logout-all",
  ])("signed-out marker must allow existing auth endpoint %s", (path) => {
    const response = proxy(
      new NextRequest(`https://bank.example/api/auth/${path}`, {
        method: path.startsWith("logout") ? "POST" : "GET",
        headers: { cookie: "drts_bank_console_signed_out=1" },
      }),
    );
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
  it("a newly issued managed cookie reaches /users even after display logout", () => {
    const response = proxy(
      new NextRequest("https://bank.example/users", {
        headers: {
          cookie: "drts_bank_console_signed_out=1; drts_tenant_session=managed",
        },
      }),
    );
    expect(response.headers.get("location")).toBeNull();
  });
  it("explicit visible sign-out clears every local authority cookie", () => {
    const response = proxy(
      new NextRequest("https://bank.example/users?signedOut=1", {
        headers: {
          cookie:
            "drts_tenant_session=managed; drts_tenant_csrf=csrf; drts_tenant_oidc_state=state",
        },
      }),
    );
    for (const name of [
      constants.TENANT_SESSION_COOKIE_NAME,
      constants.TENANT_CSRF_COOKIE_NAME,
      constants.TENANT_OIDC_STATE_COOKIE_NAME,
    ]) {
      expect(response.cookies.get(name)?.value).toBe("");
    }
  });
});
