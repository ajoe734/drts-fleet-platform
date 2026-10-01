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
  await repository.onModuleInit();
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

it("auth/token ops_observer sessions successfully issue durable sessions with membershipId", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T07:20:00.000Z"));
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("STRICT_IAP_MODE", "false");
  vi.stubEnv("JWT_SECRET", "unit-only-session-contract-key");
  vi.stubEnv("DRTS_INTERNAL_KEY", "unit-only-internal-key");
  vi.stubEnv("DRTS_E2E_PROVISIONING", "true");
  const repository = new IdentityRepository();
  await repository.onModuleInit();
  const jwt = new JwtAuthService(repository);
  const controller = new AuthController(jwt, {} as never, {} as never, undefined, undefined, undefined, repository);
  const issued = await controller.issueToken({
    method: "POST",
    originalUrl: "/api/auth/token",
    headers: {
      "x-drts-internal-key": "unit-only-internal-key",
      "x-actor-type": "ops_observer",
      "x-actor-id": "live-map-observer",
      "x-realm": "ops",
      "x-scopes": "regulatory:read",
    },
  });
  expect(issued.expiresIn).toBe("8h");
  const payload = jwt.verify(issued.token);
  expect(payload?.actorType).toBe("ops_observer");
  expect(payload?.scopes).toEqual(["regulatory:read"]);
  expect(typeof payload?.membershipId).toBe("string");
  const session = await repository.getSession(payload!.sid!);
  expect(session?.status).toBe("active");
  expect(await jwt.verifyAccessToken(issued.token)).not.toBeNull();
});

it("auth/token rejects elevated scopes for ops_observer", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T07:20:00.000Z"));
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("STRICT_IAP_MODE", "false");
  vi.stubEnv("JWT_SECRET", "unit-only-session-contract-key");
  vi.stubEnv("DRTS_INTERNAL_KEY", "unit-only-internal-key");
  vi.stubEnv("DRTS_E2E_PROVISIONING", "true");
  const repository = new IdentityRepository();
  await repository.onModuleInit();
  const jwt = new JwtAuthService(repository);
  const controller = new AuthController(jwt, {} as never, {} as never, undefined, undefined, undefined, repository);
  const issued = await controller.issueToken({
    method: "POST",
    originalUrl: "/api/auth/token",
    headers: {
      "x-drts-internal-key": "unit-only-internal-key",
      "x-actor-type": "ops_observer",
      "x-actor-id": "live-map-observer",
      "x-realm": "ops",
      "x-scopes": "regulatory:write",
    },
  });
  // It issues successfully initially because controller doesn't reject on explicit request scopes during minting if WIF impersonation isn't overriding it
  // BUT verifyAccessToken MUST reject it since it's not in roleBindings
  expect(await jwt.verifyAccessToken(issued.token)).toBeNull();
});

it("auth/driver/device/invite and revoke controller routes do not require idempotency keys", async () => {
  const repository = new IdentityRepository();
  const jwt = new JwtAuthService(repository);
  
  const mockDriverDeviceSessionService = {
    issueRegistrationInvitation: vi.fn().mockResolvedValue({ registrationCode: "1234" }),
    revokeInvitation: vi.fn().mockResolvedValue({ revoked: true })
  };

  const { IdempotencyService } = await import("../../../../apps/api/src/common/idempotency/idempotency.service");
  const { IdempotencyRepository } = await import("../../../../apps/api/src/common/idempotency/idempotency.repository");
  const idempotencyService = new IdempotencyService(new IdempotencyRepository());

  const controller = new AuthController(
    jwt, 
    {} as never, 
    mockDriverDeviceSessionService as never, 
    undefined, undefined, undefined, repository, undefined, undefined,
    idempotencyService
  );

  const issueResult = await controller.issueDriverDeviceInvitation(
    { } as any,
    undefined,
    "req-123"
  );
  expect(issueResult.data).toBeDefined();

  const revokeResult = await controller.revokeDriverDeviceInvitation(
    { registrationCode: "abc" },
    undefined,
    "req-456"
  );
  expect(revokeResult.data).toBeDefined();
});
