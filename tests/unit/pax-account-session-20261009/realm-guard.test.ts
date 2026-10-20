import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import {
  PassengerJwtService,
  PASSENGER_JWT_AUDIENCE,
  PASSENGER_JWT_ISSUER,
} from "../../../apps/api/src/common/auth/passenger-jwt.service";
import { extractBootstrapRequestIdentity } from "../../../apps/api/src/common/auth/auth.extractor";
import { resolveRouteAuthPolicy } from "../../../apps/api/src/common/auth/auth.policy";
import {
  AUTH_ALLOWED_REALMS_KEY,
  AUTH_OPEN_ROUTE_KEY,
  AUTH_REQUIRED_SCOPES_KEY,
} from "../../../apps/api/src/common/auth/auth.constants";
import {
  AUTH_ACTOR_TYPES,
  type AuthenticatedRequestLike,
  type AuthRealm,
} from "../../../apps/api/src/common/auth/auth.types";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { PassengerAccountController } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.controller";
import { MemoryPassengerStore } from "./memory-store";

beforeEach(() => {
  vi.stubEnv("JWT_SECRET", "unit-only-passenger-realm-key");
  vi.stubEnv("JWT_PRIVATE_KEY", "");
  vi.stubEnv("JWT_PUBLIC_KEY", "");
  vi.stubEnv("JWT_KEY_RING_JSON", "");
  vi.stubEnv("JWT_ALGORITHM", "HS256");
  vi.stubEnv("JWT_ALGORITHMS", "HS256");
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("DRTS_ENV", undefined);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DRTS_INTERNAL_KEY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
function context(
  request: AuthenticatedRequestLike,
  handler: keyof PassengerAccountController | null = null,
) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () =>
      handler
        ? PassengerAccountController.prototype[handler]
        : function target() {},
    getClass: () => (handler ? PassengerAccountController : class Target {}),
  } as never;
}
async function fixture(
  options: {
    open?: boolean;
    realms?: string[];
    scopes?: string[];
    google?: any;
    controllerMetadata?: boolean;
  } = {},
) {
  const tokens = new PassengerJwtService();
  const service = new PassengerAccountService(
    new MemoryPassengerStore(),
    tokens,
  );
  const a = await service.findOrCreateByIdentity("google", "unit-subject");
  const session = await service.issueSession(a.drtsPassengerId);
  const legacy = new JwtAuthService();
  const reflector = {
    getAllAndOverride: (key: string) => {
      if (key === AUTH_OPEN_ROUTE_KEY) return options.open;
      if (key === AUTH_ALLOWED_REALMS_KEY) return options.realms;
      if (key === AUTH_REQUIRED_SCOPES_KEY) return options.scopes;
      return undefined;
    },
  };
  const requireApi = createRequire(
    new URL("../../../apps/api/package.json", import.meta.url),
  );
  const { Reflector } = requireApi("@nestjs/core");
  const guard = new BootstrapAuthGuard(
    options.controllerMetadata ? new Reflector() : (reflector as never),
    legacy,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    options.google,
    service,
  );
  return { guard, legacy, tokens, service, session, a };
}

const protectedEndpoints = [
  ["GET", "/api/passenger-app/me", "me"],
  ["PATCH", "/api/passenger-app/me", "update"],
  ["DELETE", "/api/passenger-app/me", "remove"],
  ["GET", "/api/passenger-app/me/identities", "identities"],
  ["DELETE", "/api/passenger-app/me/identities/id", "unlink"],
] as const;
const actorRealm: Record<(typeof AUTH_ACTOR_TYPES)[number], AuthRealm> = {
  system: "system",
  platform_admin: "platform",
  tenant_admin: "tenant",
  ops_user: "ops",
  ops_observer: "ops",
  driver_user: "driver",
  partner_api_key: "partner",
  partner_user: "partner",
  referral_passenger: "partner",
};

describe.each(["development", "staging", "production"])(
  "actual passenger controller metadata and guard in %s",
  (environment) => {
    it.each(protectedEndpoints)(
      "accepts passenger Bearer for %s %s (%s) and rejects it after logout",
      async (method, path, handler) => {
        const f = await fixture({ controllerMetadata: true });
        vi.stubEnv("APP_ENV", environment);
        const request = req(path, f.session.accessToken);
        request.method = method;
        expect(resolveRouteAuthPolicy(method, path)?.allowedRealms).toEqual([
          "passenger",
        ]);
        expect(await f.guard.canActivate(context(request, handler))).toBe(true);
        expect(request.identity?.actorType).toBe("first_party_passenger");
        await f.service.logout(f.session.refreshToken);
        await expect(
          f.guard.canActivate(context(request, handler)),
        ).rejects.toMatchObject({ code: "unauthorized" });
        expect(request.identity).toBeUndefined();
      },
    );
    it.each(AUTH_ACTOR_TYPES)(
      "rejects a signed legacy %s token on every protected passenger endpoint",
      async (actorType) => {
        const f = await fixture({ controllerMetadata: true });
        vi.stubEnv("APP_ENV", environment);
        const token = f.legacy.sign({
          authMode: "jwt_bearer",
          actorType,
          actorId: f.a.drtsPassengerId,
          realm: actorRealm[actorType],
          drtsPassengerId: f.a.drtsPassengerId,
          tenantId: null,
          roleFamilies: [],
          roles: [],
          scopes: [],
        });
        for (const [method, path, handler] of protectedEndpoints) {
          const request = req(path, token);
          request.method = method;
          await expect(
            f.guard.canActivate(context(request, handler)),
          ).rejects.toMatchObject({ code: "unauthorized" });
          expect(request.identity).toBeUndefined();
        }
      },
    );
    it("rejects passenger JWT at the existing legacy session endpoint", async () => {
      const f = await fixture();
      vi.stubEnv("APP_ENV", environment);
      await expect(
        f.guard.canActivate(
          context(req("/api/auth/session", f.session.accessToken)),
        ),
      ).rejects.toMatchObject({ code: "JWT_INVALID" });
    });
    it.each([
      ["/api/passenger-app/auth/refresh", "refreshSession"],
      ["/api/passenger-app/auth/logout", "logout"],
    ] as const)(
      "accepts BFF metadata for %s with expired access and real %s OpenRoute metadata",
      async (path, handler) => {
        const google = {
          verifyServicePrincipal: vi
            .fn()
            .mockResolvedValue({ principalId: "bff" }),
        };
        const f = await fixture({ controllerMetadata: true, google });
        vi.stubEnv("APP_ENV", environment);
        vi.useFakeTimers();
        try {
          vi.advanceTimersByTime(900000);
          expect(f.tokens.verify(f.session.accessToken)).toBeNull();
          const request = req(path, "metadata-stub");
          request.method = "POST";
          expect(await f.guard.canActivate(context(request, handler))).toBe(
            true,
          );
          expect(request.identity).toBeUndefined();
          if (environment !== "development")
            expect(google.verifyServicePrincipal).toHaveBeenCalledWith(
              expect.objectContaining({
                "x-drts-google-id-token": "metadata-stub",
              }),
              expect.objectContaining({
                requestPath: path,
                requestMethod: "POST",
              }),
            );
          const next = await f.service.refresh(f.session.refreshToken);
          expect(f.tokens.verify(next.accessToken)).not.toBeNull();
        } finally {
          vi.useRealTimers();
        }
      },
    );
  },
);
function req(path: string, token?: string): AuthenticatedRequestLike {
  return {
    method: "GET",
    url: path,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
}
describe("passenger realm boundary through the production guard", () => {
  it("accepts only a real passenger JWT plus active persisted passenger family on a passenger path", async () => {
    const f = await fixture();
    const r = req("/api/passenger-app/me", f.session.accessToken);
    expect(await f.guard.canActivate(context(r))).toBe(true);
    expect(r.identity).toMatchObject({
      realm: "passenger",
      actorType: "first_party_passenger",
      drtsPassengerId: f.a.drtsPassengerId,
      tenantId: null,
      scopes: [],
    });
    await f.service.logout(f.session.refreshToken);
    await expect(
      f.guard.canActivate(
        context(req("/api/passenger-app/me", f.session.accessToken)),
      ),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });
  it.each([
    "/api/platform-admin/tenants",
    "/api/tenant/profile",
    "/api/ops/dispatch",
    "/api/driver/tasks",
    "/api/partner/portal",
    "/api/auth/session",
    "/api/passenger-app/platform/rides/ride/refund",
    "/api/unclassified",
  ])("rejects passenger access on legacy/protected path %s", async (path) => {
    const f = await fixture();
    expect(f.legacy.verify(f.session.accessToken)).toBeNull();
    await expect(
      f.guard.canActivate(context(req(path, f.session.accessToken))),
    ).rejects.toMatchObject({ code: "JWT_INVALID" });
  });
  it("rejects bootstrap passenger headers and legacy bearer on passenger routes even in dev", async () => {
    const f = await fixture();
    const r = req("/api/passenger-app/me");
    r.headers = {
      "x-realm": "passenger",
      "x-actor-type": "first_party_passenger",
      "x-actor-id": f.a.drtsPassengerId,
    };
    expect(
      extractBootstrapRequestIdentity(r.headers, { allowAnonymous: false }),
    ).toBeNull();
    await expect(async () =>
      f.guard.canActivate(context(r)),
    ).rejects.toMatchObject({ code: "unauthorized" });
    const legacy = f.legacy.sign({
      authMode: "jwt_bearer",
      actorType: "tenant_admin",
      actorId: "tenant-user",
      realm: "tenant",
      tenantId: "tenant",
      roleFamilies: ["tenant"],
      roles: [],
      scopes: [],
    });
    await expect(
      f.guard.canActivate(context(req("/api/passenger-app/me", legacy))),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });
  it("honors narrower decorator realm/scope requirements", async () => {
    const realm = await fixture({ realms: ["platform"] });
    await expect(
      realm.guard.canActivate(
        context(req("/api/passenger-app/me", realm.session.accessToken)),
      ),
    ).rejects.toMatchObject({ code: "AUTH_REALM_DENIED" });
    const scope = await fixture({ scopes: ["platform:write"] });
    await expect(
      scope.guard.canActivate(
        context(req("/api/passenger-app/me", scope.session.accessToken)),
      ),
    ).rejects.toMatchObject({ code: "AUTH_SCOPE_DENIED" });
  });
  it("does not allow arbitrary bearer to bypass metadata verification on strict public refresh/logout", async () => {
    vi.stubEnv("APP_ENV", "staging");
    const f = await fixture({ open: true });
    vi.stubEnv("APP_ENV", "staging");
    await expect(
      f.guard.canActivate(
        context(req("/api/passenger-app/auth/refresh", "fake-metadata")),
      ),
    ).rejects.toMatchObject({ code: "INTERNAL_KEY_NOT_CONFIGURED" });
  });
  it("verifies public BFF metadata against its route using an external-boundary stub, without creating a passenger identity", async () => {
    const google = {
      verifyServicePrincipal: vi.fn().mockResolvedValue({ principalId: "bff" }),
    };
    const f = await fixture({ open: true, google });
    vi.stubEnv("APP_ENV", "staging");
    const r = req("/api/passenger-app/auth/refresh", "metadata-stub");
    r.method = "POST";
    expect(await f.guard.canActivate(context(r))).toBe(true);
    expect(r.identity).toBeUndefined();
    expect(google.verifyServicePrincipal).toHaveBeenCalledWith(
      expect.objectContaining({ "x-drts-google-id-token": "metadata-stub" }),
      expect.objectContaining({
        requestPath: "/api/passenger-app/auth/refresh",
        requestMethod: "POST",
        enforceReplayProtection: false,
      }),
    );
  });
  it("fails closed when the passenger storage/provider is unavailable", async () => {
    const f = await fixture();
    vi.spyOn(f.service, "authenticateAccessToken").mockRejectedValue(
      new Error("db unavailable"),
    );
    await expect(
      f.guard.canActivate(
        context(req("/api/passenger-app/me", f.session.accessToken)),
      ),
    ).rejects.toThrow("db unavailable");
    const guard = new BootstrapAuthGuard(
      { getAllAndOverride: () => undefined } as never,
      f.legacy,
    );
    await expect(
      guard.canActivate(
        context(req("/api/passenger-app/me", f.session.accessToken)),
      ),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });
  it("does not log access/refresh credentials on reuse, logout or legacy realm rejection", async () => {
    const requireApi = createRequire(
      new URL("../../../apps/api/package.json", import.meta.url),
    );
    const { Logger } = requireApi("@nestjs/common");
    const spies = ["debug", "log", "warn", "error", "verbose"].map((method) =>
      vi.spyOn(Logger.prototype, method).mockImplementation(() => undefined),
    );
    const f = await fixture();
    const next = await f.service.refresh(f.session.refreshToken);
    await expect(
      f.service.refresh(f.session.refreshToken),
    ).rejects.toMatchObject({ code: "invalid_grant" });
    await f.service.logout(next.refreshToken);
    await expect(
      f.guard.canActivate(context(req("/api/auth/session", next.accessToken))),
    ).rejects.toMatchObject({ code: "JWT_INVALID" });
    const logs = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    for (const value of [
      f.session.accessToken,
      f.session.refreshToken,
      next.accessToken,
      next.refreshToken,
    ])
      expect(logs).not.toContain(value);
    expect(spies.some((spy) => spy.mock.calls.length > 0)).toBe(true); // Real legacy verifier logs only the reason.
  });
});

describe("JWT claim verification", () => {
  it.each([
    { realm: "tenant" },
    { actorType: "partner_user" },
    { drtsPassengerId: "other" },
    { sid: "invalid" },
    { tenantId: "tenant" },
    { scopes: ["platform:write"] },
    { roles: ["admin"] },
    { controlPlaneProxy: true },
    { aud: "legacy-api" },
    { exp: 1 },
  ])("rejects incorrectly bound signed claims: %j", async (change) => {
    const f = await fixture();
    const original = jwt.decode(f.session.accessToken) as jwt.JwtPayload;
    const bad = jwt.sign({ ...original, ...change }, process.env.JWT_SECRET!, {
      algorithm: "HS256",
      keyid: "key-current",
    });
    expect(f.tokens.verify(bad)).toBeNull();
  });
  it("rejects tampering, unsigned tokens, wrong issuer and excessive TTL", async () => {
    const f = await fixture();
    expect(f.tokens.verify(f.session.accessToken + "changed")).toBeNull();
    const payload = {
      sub: f.a.drtsPassengerId,
      realm: "passenger",
      actorType: "first_party_passenger",
      drtsPassengerId: f.a.drtsPassengerId,
      sid: randomUUID(),
      jti: randomUUID(),
    };
    expect(
      f.tokens.verify(jwt.sign(payload, "", { algorithm: "none" })),
    ).toBeNull();
    expect(
      f.tokens.verify(
        jwt.sign(payload, process.env.JWT_SECRET!, {
          issuer: "wrong",
          audience: PASSENGER_JWT_AUDIENCE,
          expiresIn: 900,
          keyid: "key-current",
        }),
      ),
    ).toBeNull();
    expect(
      f.tokens.verify(
        jwt.sign(payload, process.env.JWT_SECRET!, {
          issuer: PASSENGER_JWT_ISSUER,
          audience: PASSENGER_JWT_AUDIENCE,
          expiresIn: 3600,
          keyid: "key-current",
        }),
      ),
    ).toBeNull();
  });
  it("classifies the namespace as passenger-only and platform subpaths as platform-only", () => {
    expect(
      resolveRouteAuthPolicy("PATCH", "/api/passenger-app/me")?.allowedRealms,
    ).toEqual(["passenger"]);
    expect(
      resolveRouteAuthPolicy(
        "POST",
        "/api/passenger-app/platform/rides/id/refund",
      )?.allowedRealms,
    ).toEqual(["platform"]);
    expect(
      resolveRouteAuthPolicy("GET", "/api/auth/session")?.allowedRealms,
    ).not.toContain("passenger");
  });
});
