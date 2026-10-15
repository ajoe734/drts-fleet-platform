import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import * as controlPlaneAuth from "../../../packages/control-plane-auth/src/index";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";

const appRoot = resolve("apps/bank-console-web");
const load = createUiModuleLoader(appRoot, {
  "@drts/control-plane-auth": controlPlaneAuth,
  "next/server": { NextRequest, NextResponse },
});
const session = load<{
  signSessionRole(role: string, bank: string): string;
  verifySessionRole(token: string): unknown;
}>(resolve(appRoot, "lib/session.ts"));
const login = load<{
  POST(request: NextRequest): Promise<NextResponse>;
}>(resolve(appRoot, "app/api/auth/login/route.ts"));

function authorize(headers: Record<string, string>) {
  const guard = new BootstrapAuthGuard(
    { getAllAndOverride: () => undefined } as never,
    new JwtAuthService(),
  );
  const request = {
    method: "POST",
    url: "/api/tenant/users",
    originalUrl: "/api/tenant/users",
    headers,
  };
  return Promise.resolve().then(() =>
    guard.canActivate({
      getClass: () => class Controller {},
      getHandler: () => function handler() {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as never),
  );
}

afterEach(() => vi.unstubAllEnvs());

// These probes establish the missing authority boundary. They do not claim
// that the unimplemented Bank management flow passes its acceptance gates.
describe("Bank display sessions cannot authorize tenant user commands", () => {
  it("the real dev login emits a signed display cookie that the real API guard rejects", async () => {
    vi.stubEnv("BANK_SESSION_SECRET", "bank-authority-probe-secret");
    vi.stubEnv("DRTS_ENV", "development");
    vi.stubEnv("BANK_CONSOLE_DEMO_LOGIN", "true");
    const response = await login.POST(
      new NextRequest("https://bank.example/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "bank_program_admin", bank: "acme" }),
      }),
    );
    expect(response.status).toBe(303);
    const token = response.cookies.get("drts_bank_console_session")?.value;
    expect(token).toBeTruthy();
    expect(session.verifySessionRole(token!)).toEqual({
      role: "bank_program_admin",
      bankCode: "acme",
    });
    vi.stubEnv("APP_ENV", "production");
    await expect(authorize({ authorization: `Bearer ${token}` })).rejects.toMatchObject({
      code: "JWT_INVALID",
    });
  });

  it.each(["bank_program_admin", "bank_finance", "bank_ops_viewer"])(
    "a valid signed %s display cookie cannot be reused as an API session",
    async (role) => {
      vi.stubEnv("BANK_SESSION_SECRET", "bank-authority-probe-secret");
      vi.stubEnv("APP_ENV", "production");
      const token = session.signSessionRole(role, "acme");
      expect(session.verifySessionRole(token)).toEqual({ role, bankCode: "acme" });
      await expect(authorize({ authorization: `Bearer ${token}` })).rejects.toMatchObject({
        code: "JWT_INVALID",
      });
    },
  );

  it("the existing Bank read headers do not create a strict-environment mutation identity", async () => {
    vi.stubEnv("APP_ENV", "production");
    await expect(authorize({
      "x-actor-type": "tenant_admin",
      "x-actor-id": "bank-console:tenant-demo-001:bank_program_admin",
      "x-realm": "tenant",
      "x-tenant-id": "tenant-demo-001",
    })).rejects.toMatchObject({ code: "AUTH_BOOTSTRAP_HEADERS_FORBIDDEN" });
  });
});
