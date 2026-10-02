import { generateKeyPairSync } from "node:crypto";
import { Reflector } from "../../../../apps/api/node_modules/@nestjs/core";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BootstrapAuthGuard } from "../../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../../../apps/api/src/common/auth/jwt-auth.service";
import { AuthController } from "../../../../apps/api/src/modules/auth/auth.controller";
import { GoogleWorkloadIdentityAdapter } from "../../../../apps/api/src/modules/auth/google-workload-identity.adapter";
import { DriverDeviceSessionService } from "../../../../apps/api/src/modules/auth/driver-device-session.service";
import { IdentityRepository } from "../../../../apps/api/src/modules/identity/identity.repository";
import { IdempotencyService } from "../../../../apps/api/src/common/idempotency/idempotency.service";
import { IdempotencyRepository } from "../../../../apps/api/src/common/idempotency/idempotency.repository";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const audience = "https://api.example.test/driver-provisioning";
const email = "live-map@example.iam.gserviceaccount.com";
const principalId = "dev-live-map";
const driverId = "drv-demo-002";
const registryEntry = {
  serviceAccountEmail: email,
  principalId,
  actorId: "live-map-observer",
  roles: ["ops_observer"],
  allowedTokenAudiences: [audience],
  routeScopes: ["POST auth/token"],
  driverProvisioningGrant: { driverId },
};

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DRTS_ENV", "dev");
  vi.stubEnv("JWT_SECRET", "unit-only-driver-provisioning-secret");
  vi.stubEnv("DRTS_INTERNAL_KEY", "unit-only-internal-key");
  vi.stubEnv("WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED", "true");
  vi.stubEnv("WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS", JSON.stringify([registryEntry]));
  // Only the external Google JWKS boundary is mocked. Signatures, registry,
  // replay ledger, session store, controller, guard and driver service are real.
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({
    keys: [{ ...publicKey.export({ format: "jwk" }), kid: "provision-test" }],
  })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function token(overrides: Record<string, unknown> = {}) {
  return jwt.sign({
    iss: "https://accounts.google.com", sub: "google-service-subject",
    email, email_verified: true, aud: audience, ...overrides,
  }, privateKey, { algorithm: "RS256", keyid: "provision-test", expiresIn: "5m" });
}

function fixture() {
  const repository = new IdentityRepository();
  const auth = new JwtAuthService(repository);
  const devices = new DriverDeviceSessionService(auth, {
    recordDeviceBinding: vi.fn(), recordDeviceBindingRevocation: vi.fn(),
  } as never);
  const controller = new AuthController(auth, {} as never, devices,
    undefined, undefined, undefined, repository, undefined,
    new GoogleWorkloadIdentityAdapter(repository),
    new IdempotencyService(new IdempotencyRepository()));
  const guard = new BootstrapAuthGuard(new Reflector(), auth);
  const issue = (headers: Record<string, string> = {}, assertion = token()) => controller.issueToken({
    method: "POST", originalUrl: "/api/auth/token", headers: {
      "x-drts-google-id-token": assertion, "x-actor-type": "system",
      "x-actor-id": principalId, "x-realm": "system", ...headers,
    },
  });
  const authorize = (accessToken: string, method: string, path: string,
    handler: (...args: never[]) => unknown = () => {}) => {
    const request = { method, originalUrl: `/api/${path}`, headers: { authorization: `Bearer ${accessToken}` } };
    return guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler, getClass: () => AuthController } as never);
  };
  return { repository, auth, devices, controller, issue, authorize };
}

it("issues a durable 15m service session with only driver:provision, without workforce privileges", async () => {
  const f = fixture();
  const issued = await f.issue();
  expect(issued.expiresIn).toBe("15m");
  const payload = await f.auth.verifyAccessToken(issued.token);
  expect(payload).toMatchObject({ actorType: "system", realm: "system", roles: [],
    scopes: ["driver:provision"], driverProvisioningDriverId: driverId });
  expect(payload?.amr).toEqual(["google_workload_identity"]);
  expect(payload?.membershipId).toBeNull();
  await expect(f.authorize(issued.token, "POST", "auth/driver/device/invite", f.controller.issueDriverDeviceInvitation)).resolves.toBe(true);
  await expect(f.authorize(issued.token, "POST", "auth/driver/device/invite/revoke", f.controller.revokeDriverDeviceInvitation)).resolves.toBe(true);
  await expect(f.authorize(issued.token, "GET", "auth/session", f.controller.getSession)).resolves.toBe(true);
});
