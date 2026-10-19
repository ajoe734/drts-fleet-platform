import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PUT } from "../../apps/fleet-partner-portal-web/app/control-plane-proxy/[...path]/route";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { BootstrapAuthGuard } from "../../apps/api/src/common/auth/bootstrap-auth.guard";
import type { BootstrapRequestIdentity } from "../../apps/api/src/common/auth/auth.types";
import { createFixture } from "./fleet-portal-verified-principal-canonical-caller-flow-20261015/services";
import { createApiBoundary } from "./fleet-portal-verified-principal-canonical-caller-flow-20261015/http-boundary";
vi.mock("server-only", () => ({}));
const { Reflector } = createRequire(
  resolve(process.cwd(), "apps/api/package.json"),
)("@nestjs/core");
let bearer: string;
let fetcher: ReturnType<typeof vi.fn>;
const identity: BootstrapRequestIdentity = {
  authMode: "jwt_bearer",
  actorType: "partner_user",
  actorId: "verified-document-owner",
  partnerId: "fleet-1",
  realm: "partner",
  tenantId: null,
  roles: ["partner"],
  roleFamilies: ["partner"],
  scopes: ["billing:read", "partner:read", "partner:write"],
  requestId: null,
};
beforeEach(async () => {
  vi.stubEnv("DRTS_ENV", "test");
  vi.stubEnv("JWT_SECRET", "fleet-document-proxy-session-test-key");
  vi.stubEnv("DRTS_FLEET_PARTNER_ID", "fleet-1");
  vi.stubEnv("DRTS_API_URL", "https://api.test");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
  const jwt = new JwtAuthService();
  bearer = (await jwt.issueSessionToken(identity)).token;
  const session = createApiBoundary({
    fixture: createFixture(),
    jwt,
    guard: new BootstrapAuthGuard(new Reflector(), jwt),
    calls: [],
  });
  fetcher = vi.fn(
    async (input: string | URL | Request, init: RequestInit = {}) => {
      if (
        new URL(input instanceof Request ? input.url : input).pathname ===
        "/api/auth/session"
      )
        return session(input, init);
      return Response.json({ data: { scan_state: "clean" } });
    },
  );
  vi.stubGlobal("fetch", fetcher);
  vi.stubEnv("DRTS_ENV", "staging");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function request(partner?: string, authenticated = true) {
  return new NextRequest(
    "https://portal.test/control-plane-proxy/fleet-partner/cases/case-1/attachments/content?objectKey=key",
    {
      method: "PUT",
      body: new Uint8Array([1, 2, 3]),
      headers: {
        "content-type": "application/octet-stream",
        ...(authenticated ? { cookie: `drts_session=${bearer}` } : {}),
        ...(partner ? { "x-fleet-partner-id": partner } : {}),
      },
    },
  );
}
const context = () => ({
  params: Promise.resolve({
    path: ["fleet-partner", "cases", "case-1", "attachments", "content"],
  }),
});
describe("C125 portal scope before binary forwarding", () => {
  it("forwards raw bytes with verified application bearer and canonical partner identity", async () => {
    expect((await PUT(request(), context())).status).toBe(200);
    const init = fetcher.mock.calls.at(-1)![1] as RequestInit;
    expect(new Uint8Array(init.body as ArrayBuffer)).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(new Headers(init.headers).get("x-fleet-partner-id")).toBe("fleet-1");
    expect(new Headers(init.headers).get("authorization")).toBe(
      `Bearer ${bearer}`,
    );
    expect(new Headers(init.headers).has("x-partner-id")).toBe(false);
    expect(new Headers(init.headers).get("content-type")).toBe(
      "application/octet-stream",
    );
  });
  it.each(["fleet-2", ""])(
    "does not let caller headers invent a fleet identity (%s)",
    async (configured) => {
      vi.stubEnv("DRTS_FLEET_PARTNER_ID", configured);
      // Configured mismatch or forged requested selector cannot override the real fleet-1 principal.
      const response = await PUT(
        request(configured ? "fleet-1" : "fleet-2"),
        context(),
      );
      expect(response.status).toBe(403);
      expect(
        fetcher.mock.calls.every(
          (call) => new URL(call[0] as string).pathname === "/api/auth/session",
        ),
      ).toBe(true);
    },
  );
  it("does not treat a matching selector as a substitute for the missing end-user credential", async () => {
    expect((await PUT(request("fleet-1", false), context())).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
