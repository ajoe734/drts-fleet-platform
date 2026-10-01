import { afterEach, expect, it, vi } from "vitest";
import { JwtAuthService } from "../../../../apps/api/src/common/auth/jwt-auth.service";
import { AuthController } from "../../../../apps/api/src/modules/auth/auth.controller";
import { IdentityRepository } from "../../../../apps/api/src/modules/identity/identity.repository";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

// Reproduce the currently deployed contract before requesting a product scope
// change. Real issuance, repository (memory adapter), signature and durable
// verification; no HTTP server, network, database or auth-logic mocks.
it("documents why auth/token driver_user sessions cannot yet authenticate live coverage", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T07:20:00.000Z"));
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("STRICT_IAP_MODE", "false");
  vi.stubEnv("JWT_SECRET", "unit-only-session-contract-key");
  vi.stubEnv("DRTS_INTERNAL_KEY", "unit-only-internal-key");
  const repository = new IdentityRepository();
  const jwt = new JwtAuthService(repository);
  const controller = new AuthController(jwt, {} as never, {} as never, undefined, undefined, undefined, repository);
  const issued = await controller.issueToken({
    method: "POST",
    originalUrl: "/api/auth/token",
    headers: {
      "x-drts-internal-key": "unit-only-internal-key",
      "x-actor-type": "driver_user",
      "x-actor-id": "drv-demo-002",
      "x-realm": "driver",
      "x-scopes": "driver:read",
    },
  });
  expect(issued.expiresIn).toBe("8h");
  const payload = jwt.verify(issued.token);
  expect(payload?.actorType).toBe("driver_user");
  expect(payload?.scopes).toEqual(["driver:read"]);
  const session = await repository.getSession(payload!.sid!);
  expect(session?.status).toBe("active");
  expect(payload?.driverBindingId).toBeNull();
  expect(payload?.driverBindingId).not.toBe(session?.sessionId);
  expect(await jwt.verifyAccessToken(issued.token)).toBeNull();
});

it("auth/token ops_user sessions successfully issue durable sessions with membershipId", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T07:20:00.000Z"));
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("STRICT_IAP_MODE", "false");
  vi.stubEnv("JWT_SECRET", "unit-only-session-contract-key");
  vi.stubEnv("DRTS_INTERNAL_KEY", "unit-only-internal-key");
  const repository = new IdentityRepository();
  await repository.ensurePrincipalRecord({
    principalId: "live-map-observer",
    sourceRef: null,
    issuer: "test",
    subject: "live-map-observer",
    principalType: "human",
    email: null,
    emailVerified: false,
    displayName: null,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await repository.ensureMembershipRecord({
    membershipId: "mem-ops",
    sourceRef: null,
    principalId: "live-map-observer",
    realm: "ops",
    scopeRef: "ops",
    tenantId: null,
    partnerId: null,
    status: "active",
    invitedByPrincipalId: null,
    invitationId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const jwt = new JwtAuthService(repository);
  const controller = new AuthController(jwt, {} as never, {} as never, undefined, undefined, undefined, repository);
  const issued = await controller.issueToken({
    method: "POST",
    originalUrl: "/api/auth/token",
    headers: {
      "x-drts-internal-key": "unit-only-internal-key",
      "x-actor-type": "ops_user",
      "x-actor-id": "live-map-observer",
      "x-realm": "ops",
      "x-scopes": "regulatory:read",
    },
  });
  expect(issued.expiresIn).toBe("8h");
  const payload = jwt.verify(issued.token);
  expect(payload?.actorType).toBe("ops_user");
  expect(payload?.scopes).toEqual(["regulatory:read"]);
  expect(payload?.membershipId).toBe("mem-ops");
  const session = await repository.getSession(payload!.sid!);
  expect(session?.status).toBe("active");
  expect(await jwt.verifyAccessToken(issued.token)).not.toBeNull();
});
