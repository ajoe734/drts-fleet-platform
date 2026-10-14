import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { PassengerJwtService } from "../../../apps/api/src/common/auth/passenger-jwt.service";
import { PaymentRefundController } from "../../../apps/api/src/modules/passenger-app/payment/payment-refund.controller";
import type { AuthenticatedRequestLike } from "../../../apps/api/src/common/auth/auth.types";

const requireApi = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
const { Reflector } = requireApi("@nestjs/core");
const URL_PATH =
  "/api/passenger-app/platform/rides/00000000-0000-4000-8000-000000000031/refund";
const PAYLOAD = {
  authMode: "jwt_bearer" as const,
  actorType: "platform_admin" as const,
  realm: "platform" as const,
  actorId: "synthetic_ops_actor",
  tenantId: null,
  roleFamilies: [],
  roles: [],
  scopes: ["billing:write"],
  sessionId: "synthetic_session",
  tokenId: "synthetic_token_id",
  tokenVersion: 1,
  authTime: "2026-10-11T11:00:00Z",
  amr: ["synthetic_authentication"],
  acr: "synthetic_assurance",
  policyVersion: "synthetic_policy",
};

beforeEach(() => {
  vi.stubEnv("JWT_SECRET", "synthetic_refund_guard_signing_key");
  vi.stubEnv("JWT_PRIVATE_KEY", "");
  vi.stubEnv("JWT_PUBLIC_KEY", "");
  vi.stubEnv("JWT_KEY_RING_JSON", "");
  vi.stubEnv("JWT_ALGORITHM", "HS256");
  vi.stubEnv("JWT_ALGORITHMS", "HS256");
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("DRTS_ENV", undefined);
  vi.stubEnv("NODE_ENV", "test");
});
afterEach(() => vi.unstubAllEnvs());

function context(request: AuthenticatedRequestLike) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getClass: () => PaymentRefundController,
    getHandler: () => PaymentRefundController.prototype.refund,
  } as never;
}
function request(token?: string): AuthenticatedRequestLike {
  return {
    method: "POST",
    url: URL_PATH,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
}

// No HTTP server. Actual token signing/verifying, BootstrapAuthGuard, route
// policy and controller metadata execute; external IAM/network are absent.
describe.each(["development", "staging", "production"])(
  "actual refund auth guard in %s",
  (environment) => {
    it("admits platform billing authority through the real guard", async () => {
      const jwt = new JwtAuthService();
      const token = jwt.sign(PAYLOAD);
      const guard = new BootstrapAuthGuard(new Reflector(), jwt);
      vi.stubEnv("APP_ENV", environment);
      const req = request(token);
      expect(await guard.canActivate(context(req))).toBe(true);
      expect(req.identity).toMatchObject({
        realm: "platform",
        actorType: "platform_admin",
        scopes: ["billing:write"],
      });
    });

    it("refuses platform read-only credentials", async () => {
      const jwt = new JwtAuthService();
      const token = jwt.sign({ ...PAYLOAD, scopes: ["billing:read"] });
      const guard = new BootstrapAuthGuard(new Reflector(), jwt);
      vi.stubEnv("APP_ENV", environment);
      await expect(
        guard.canActivate(context(request(token))),
      ).rejects.toMatchObject({ code: "AUTH_SCOPE_DENIED" });
    });

    it.each([
      ["ops_user", "ops"],
      ["ops_observer", "ops"],
      ["tenant_admin", "tenant"],
      ["system", "system"],
      ["driver_user", "driver"],
      ["partner_user", "partner"],
    ] as const)(
      "refuses %s even with billing write scope",
      async (actorType, realm) => {
        const jwt = new JwtAuthService();
        const token = jwt.sign({ ...PAYLOAD, actorType, realm });
        const guard = new BootstrapAuthGuard(new Reflector(), jwt);
        vi.stubEnv("APP_ENV", environment);
        await expect(
          guard.canActivate(context(request(token))),
        ).rejects.toMatchObject({ code: "AUTH_REALM_DENIED" });
      },
    );

    it("refuses a genuine first-party passenger issuer/audience on the platform route", async () => {
      const token = new PassengerJwtService().sign(
        "drts_passenger_00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
      );
      const guard = new BootstrapAuthGuard(
        new Reflector(),
        new JwtAuthService(),
      );
      vi.stubEnv("APP_ENV", environment);
      await expect(
        guard.canActivate(context(request(token))),
      ).rejects.toMatchObject({ code: "JWT_INVALID" });
    });

    it("refuses missing credentials", async () => {
      const guard = new BootstrapAuthGuard(
        new Reflector(),
        new JwtAuthService(),
      );
      vi.stubEnv("APP_ENV", environment);
      expect(() => guard.canActivate(context(request()))).toThrow();
    });
  },
);
