import { createRequire } from "node:module";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ApiClient, createFleetPartnerPortalClient } from "@drts/api-client";
import { getServerFleetPartnerClient } from "../../../apps/fleet-partner-portal-web/lib/api-client.server";
import {
  GET,
  POST,
} from "../../../apps/fleet-partner-portal-web/app/control-plane-proxy/[...path]/route";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { AuthController } from "../../../apps/api/src/modules/auth/auth.controller";
import { FleetPartnerController } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.controller";
import type {
  AuthenticatedRequestLike,
  BootstrapRequestIdentity,
} from "../../../apps/api/src/common/auth/auth.types";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";

vi.mock("server-only", () => ({}));
const inbound = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => inbound.headers }));

const { Reflector } = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
)("@nestjs/core");
const identity: BootstrapRequestIdentity = {
  authMode: "jwt_bearer",
  actorType: "partner_user",
  actorId: "verified-owner",
  partnerId: "fleet-demo-001",
  realm: "partner",
  tenantId: null,
  roles: ["partner"],
  roleFamilies: ["partner"],
  scopes: ["billing:read", "partner:read", "partner:write"],
  requestId: null,
};
let guard: BootstrapAuthGuard;
let jwt: JwtAuthService;
let bearer: string;
let calls: Array<{ url: URL; init: RequestInit; headers: Headers }>;
let controller: FleetPartnerController;
let createDraft: ReturnType<typeof vi.fn>;

async function authenticate(
  url: URL,
  init: RequestInit,
  handler: Function,
  klass: Function,
) {
  const request: AuthenticatedRequestLike = {
    method: init.method ?? "GET",
    url: url.pathname,
    headers: Object.fromEntries(new Headers(init.headers)),
  };
  await guard.canActivate({
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => klass,
  } as never);
  return request.identity as BootstrapRequestIdentity;
}
beforeEach(async () => {
  vi.stubEnv("DRTS_API_URL", "https://api.test");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "https://api.test");
  vi.stubEnv("DRTS_FLEET_PARTNER_ID", identity.partnerId!);
  vi.stubEnv("JWT_SECRET", "fleet-principal-socket-free-test-key");
  vi.stubEnv("DRTS_ENV", "test");
  jwt = new JwtAuthService();
  bearer = (await jwt.issueSessionToken(identity)).token;
  guard = new BootstrapAuthGuard(new Reflector(), jwt);
  // The command boundary is spied in these narrow actor regressions. The
  // companion mounted-flow suite uses real Supply/Case services/readback.
  createDraft = vi.fn(async (fleetPartnerId, actorId, command) => ({
    fleetPartnerId,
    actorId,
    command,
  }));
  controller = new FleetPartnerController(
    {} as never,
    { createDriverDraft: createDraft } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  inbound.headers = new Headers({ authorization: `Bearer ${bearer}` });
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = new URL(input);
      const headers = new Headers(init.headers);
      calls.push({ url, init, headers });
      if (url.hostname === "metadata.google.internal")
        return new Response("infrastructure-token");
      try {
        let data: unknown;
        if (url.pathname === "/api/auth/session") {
          const verified = await authenticate(
            url,
            init,
            AuthController.prototype.getAuthSession,
            AuthController,
          );
          data = AuthController.prototype.getAuthSession.call(
            {} as AuthController,
            verified,
          );
        } else if (url.pathname.endsWith("/supply-submissions/drivers")) {
          const verified = await authenticate(
            url,
            init,
            FleetPartnerController.prototype.createDriverSupplySubmission,
            FleetPartnerController,
          );
          data = await controller.createDriverSupplySubmission(
            headers.get("x-fleet-partner-id")!,
            headers.get("x-actor-id") ?? undefined,
            JSON.parse(String(init.body)),
            "request-1",
            verified,
          );
        } else {
          await authenticate(
            url,
            init,
            FleetPartnerController.prototype.listPortalDrivers,
            FleetPartnerController,
          );
          data = { data: { items: [], pageInfo: { totalItems: 0 } } };
        }
        return Response.json(deepToSnakeCase(data));
      } catch (e) {
        const error = e as {
          getStatus?: () => number;
          getResponse?: () => unknown;
        };
        return Response.json(
          error.getResponse?.() ?? { error: { message: String(e) } },
          { status: error.getStatus?.() ?? 500 },
        );
      }
    }),
  );
  // Issue the existing signed credential in test mode, then enforce the real
  // strict-environment transport policy on all mounted requests.
  vi.stubEnv("DRTS_ENV", "staging");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("removes generated bootstrap headers, forwards bearer separately from IAM, and preserves SDK list normalization", async () => {
  const { client, fleetPartnerId } = await getServerFleetPartnerClient();
  expect(fleetPartnerId).toBe(identity.partnerId);
  expect(client).toBeInstanceOf(ApiClient);
  expect(await client.listFleetPortalDrivers()).toEqual([]);
  const sent = calls.filter(
    (c) => c.url.hostname !== "metadata.google.internal",
  );
  expect(sent.some((c) => c.url.pathname === "/api/auth/session")).toBe(true);
  for (const call of sent) {
    expect(call.headers.get("authorization")).toBe(`Bearer ${bearer}`);
    expect(call.headers.get("x-serverless-authorization")).toBe(
      "Bearer infrastructure-token",
    );
    for (const key of [
      "x-realm",
      "x-actor-id",
      "x-actor-type",
      "x-scopes",
      "x-partner-id",
      "x-roles",
    ])
      expect(call.headers.has(key)).toBe(false);
    expect(call.init.cache).toBe("no-store");
  }
});
it("the legacy SDK factory trap still fails strict guard, so the mounted client must avoid it", async () => {
  const client = createFleetPartnerPortalClient(
    "https://api.test",
    identity.partnerId!,
    { authorization: `Bearer ${bearer}` },
  );
  await expect(client.listFleetPortalDrivers()).rejects.toMatchObject({
    statusCode: 401,
    code: "AUTH_BOOTSTRAP_HEADERS_FORBIDDEN",
  });
});
it("proxy authenticates real bearer and attributes draft command to verified actor, ignoring spoofed actor", async () => {
  const request = new NextRequest(
    "https://portal.test/control-plane-proxy/fleet-partner/supply-submissions/drivers",
    {
      method: "POST",
      headers: {
        cookie: `drts_session=${bearer}`,
        "x-actor-id": "spoof",
        "content-type": "application/json",
        origin: "https://portal.test",
      },
      body: JSON.stringify({ name: "Draft" }),
    },
  );
  const response = await POST(request, {
    params: Promise.resolve({
      path: ["fleet-partner", "supply-submissions", "drivers"],
    }),
  });
  expect(response.status).toBe(200);
  expect(createDraft).toHaveBeenCalledWith(
    identity.partnerId,
    identity.actorId,
    { name: "Draft" },
    "request-1",
  );
});
it("rejects missing principal instead of treating environment fleet or IAP email as authority", async () => {
  inbound.headers = new Headers({
    "x-goog-authenticated-user-email": "accounts.google.com:owner@example.test",
  });
  await expect(getServerFleetPartnerClient()).rejects.toMatchObject({
    statusCode: 401,
    code: "FLEET_PRINCIPAL_REQUIRED",
  });
  const response = await GET(
    new NextRequest(
      "https://portal.test/control-plane-proxy/fleet-partner/drivers",
    ),
    { params: Promise.resolve({ path: ["fleet-partner", "drivers"] }) },
  );
  expect(response.status).toBe(401);
});
