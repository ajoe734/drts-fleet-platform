import { afterEach, expect, it, vi } from "vitest";
import { JwtAuthService } from "../../../../apps/api/src/common/auth/jwt-auth.service";
import { AuthController } from "../../../../apps/api/src/modules/auth/auth.controller";
import { IdentityRepository } from "../../../../apps/api/src/modules/identity/identity.repository";

afterEach(() => vi.unstubAllEnvs());

// Reproduce the currently deployed contract before requesting a product scope
// change. Real issuance, repository (memory adapter), signature and durable
// verification; no HTTP server, network, database or auth-logic mocks.
it.each([
  ["driver_user", "driver", "drv-demo-002", "driver:read"],
  ["ops_user", "ops", "live-map-observer", "regulatory:read"],
] as const)(
  "documents why auth/token %s sessions cannot yet authenticate live coverage",
  async (actorType, realm, actorId, scopes) => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STRICT_IAP_MODE", "false");
    vi.stubEnv("JWT_SECRET", "unit-only-session-contract-key");
    vi.stubEnv("DRTS_INTERNAL_KEY", "unit-only-internal-key");
    const repository = new IdentityRepository();
    const jwt = new JwtAuthService(repository);
    const controller = new AuthController(jwt, {} as never, {} as never);
    const issued = await controller.issueToken({
      method: "POST",
      originalUrl: "/api/auth/token",
      headers: {
        "x-drts-internal-key": "unit-only-internal-key",
        "x-actor-type": actorType,
        "x-actor-id": actorId,
        "x-realm": realm,
        "x-scopes": scopes,
      },
    });
    expect(issued.expiresIn).toBe("8h");
    const payload = jwt.verify(issued.token);
    expect(payload?.actorType).toBe(actorType);
    expect(payload?.scopes).toEqual([scopes]);
    const session = await repository.getSession(payload!.sid!);
    expect(session?.status).toBe("active");
    if (realm === "driver") {
      expect(payload?.driverBindingId).toBeNull();
      expect(payload?.driverBindingId).not.toBe(session?.sessionId);
    } else {
      expect(payload?.membershipId).toBeNull();
    }
    expect(await jwt.verifyAccessToken(issued.token)).toBeNull();
  },
);
