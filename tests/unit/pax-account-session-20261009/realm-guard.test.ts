import { randomUUID } from "node:crypto";
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
import type { AuthenticatedRequestLike } from "../../../apps/api/src/common/auth/auth.types";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { MemoryPassengerStore } from "./memory-store";

beforeEach(() => {
  vi.stubEnv("JWT_SECRET", "unit-only-passenger-realm-key");
  vi.stubEnv("JWT_PRIVATE_KEY", "");
  vi.stubEnv("JWT_PUBLIC_KEY", "");
  vi.stubEnv("JWT_KEY_RING_JSON", "");
  vi.stubEnv("JWT_ALGORITHM", "HS256");
  vi.stubEnv("JWT_ALGORITHMS", "HS256");
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DRTS_INTERNAL_KEY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
function context(request: AuthenticatedRequestLike) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Target {},
  } as never;
}
async function fixture(
  options: {
    open?: boolean;
    realms?: string[];
    scopes?: string[];
    google?: any;
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
  const guard = new BootstrapAuthGuard(
    reflector as never,
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
