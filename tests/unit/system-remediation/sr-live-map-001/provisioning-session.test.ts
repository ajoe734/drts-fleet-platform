import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
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

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
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
  vi.stubEnv(
    "WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS",
    JSON.stringify([registryEntry]),
  );
  // Only the external Google JWKS boundary is mocked. Signatures, registry,
  // replay ledger, session store, controller, guard and driver service are real.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        keys: [
          { ...publicKey.export({ format: "jwk" }), kid: "provision-test" },
        ],
      }),
    ),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function token(overrides: Record<string, unknown> = {}) {
  return jwt.sign(
    {
      iss: "https://accounts.google.com",
      sub: "google-service-subject",
      email,
      email_verified: true,
      aud: audience,
      ...overrides,
    },
    privateKey,
    { algorithm: "RS256", keyid: "provision-test", expiresIn: "5m" },
  );
}

function fixture() {
  const repository = new IdentityRepository();
  const auth = new JwtAuthService(repository);
  const devices = new DriverDeviceSessionService(auth, {
    recordDeviceBinding: vi.fn(),
    recordDeviceBindingRevocation: vi.fn(),
  } as never);
  const controller = new AuthController(
    auth,
    {} as never,
    devices,
    undefined,
    undefined,
    undefined,
    repository,
    undefined,
    new GoogleWorkloadIdentityAdapter(repository),
    new IdempotencyService(new IdempotencyRepository()),
  );
  const guard = new BootstrapAuthGuard(new Reflector(), auth);
  const issue = (headers: Record<string, string> = {}, assertion = token()) =>
    controller.issueToken({
      method: "POST",
      originalUrl: "/api/auth/token",
      headers: {
        "x-drts-google-id-token": assertion,
        "x-actor-type": "system",
        "x-actor-id": principalId,
        "x-realm": "system",
        ...headers,
      },
    });
  const authorize = (
    accessToken: string,
    method: string,
    path: string,
    handler: (...args: never[]) => unknown = () => {},
  ) => {
    const request = {
      method,
      originalUrl: `/api/${path}`,
      headers: { authorization: `Bearer ${accessToken}` },
    };
    return guard.canActivate({
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => AuthController,
    } as never);
  };
  return { repository, auth, devices, controller, issue, authorize };
}

it("issues a durable 15m service session with only driver:provision, without workforce privileges", async () => {
  const f = fixture();
  const issued = await f.issue();
  expect(issued.expiresIn).toBe("15m");
  const payload = await f.auth.verifyAccessToken(issued.token);
  expect(payload).toMatchObject({
    actorType: "system",
    realm: "system",
    roles: [],
    scopes: ["driver:provision"],
    driverProvisioningDriverId: driverId,
  });
  expect(payload?.amr).toEqual(["google_workload_identity"]);
  expect(payload?.membershipId).toBeNull();
  await expect(
    f.authorize(
      issued.token,
      "POST",
      "auth/driver/device/invite",
      f.controller.issueDriverDeviceInvitation,
    ),
  ).resolves.toBe(true);
  await expect(
    f.authorize(
      issued.token,
      "POST",
      "auth/driver/device/invite/revoke",
      f.controller.revokeDriverDeviceInvitation,
    ),
  ).resolves.toBe(true);
  await expect(
    f.authorize(
      issued.token,
      "GET",
      "auth/session",
      f.controller.getAuthSession,
    ),
  ).resolves.toBe(true);
});

it.each([
  { "x-scopes": "*" },
  { "x-roles": "platform_admin" },
  { "x-role-families": "platform" },
  { "x-realm": "platform" },
  { "x-actor-id": "someone-else" },
  { "x-tenant-id": "tenant-other" },
  { "x-partner-id": "partner-other" },
  { "x-actor-type": "platform_admin", "x-realm": "platform" },
  {
    "x-actor-type": "ops_observer",
    "x-actor-id": "live-map-observer",
    "x-realm": "system",
    "x-scopes": "*",
  },
])("rejects caller-supplied authority %j", async (headers) => {
  await expect(fixture().issue(headers)).rejects.toMatchObject({ status: 403 });
});

it.each(["production", "staging"])(
  "does not enable this dev grant in %s",
  async (environment) => {
    vi.stubEnv("DRTS_ENV", environment);
    await expect(fixture().issue()).rejects.toMatchObject({
      code: "WORKLOAD_DRIVER_PROVISIONING_DENIED",
    });
  },
);

it("rejects when the explicit CI gate is off", async () => {
  vi.stubEnv("WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED", "false");
  await expect(fixture().issue()).rejects.toMatchObject({
    code: "WORKLOAD_DRIVER_PROVISIONING_DENIED",
  });
});

it("rejects an unregistered Google identity even with a valid legacy key", async () => {
  await expect(
    fixture().issue(
      { "x-drts-internal-key": "unit-only-internal-key" },
      token({ email: "unknown@example.test" }),
    ),
  ).rejects.toMatchObject({ code: "WORKLOAD_PRINCIPAL_NOT_REGISTERED" });
});

it("does not grant provisioning to the deployer or to an observer without an explicit grant", async () => {
  const entry = { ...registryEntry, driverProvisioningGrant: undefined };
  vi.stubEnv(
    "WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS",
    JSON.stringify([entry]),
  );
  await expect(fixture().issue()).rejects.toMatchObject({
    code: "WORKLOAD_DRIVER_PROVISIONING_DENIED",
  });
});

it("checks Google signature, audience and one-time exchange", async () => {
  const f = fixture();
  await expect(
    f.issue({}, token({ aud: "https://other.test" })),
  ).rejects.toMatchObject({ code: "WORKLOAD_AUDIENCE_MISMATCH" });
  const assertion = token();
  await f.issue({}, assertion);
  await expect(f.issue({}, assertion)).rejects.toMatchObject({
    code: "WORKLOAD_ASSERTION_REPLAYED",
  });
  const broken = assertion.split(".");
  broken[2] = "invalid";
  await expect(f.issue({}, broken.join("."))).rejects.toMatchObject({
    code: "WORKLOAD_ASSERTION_INVALID",
  });
});

it.each([
  ["POST", "identity/privileged-role-grants"],
  ["GET", "platform/settings"],
  ["POST", "service-area/evaluate"],
  ["POST", "auth/driver/device/revoke"],
  ["GET", "some-unclassified-route"],
  ["GET", "auth/driver/device/invite"],
  ["POST", "auth/token"],
  ["POST", "auth/driver/device/register"],
])(
  "denies the restricted JWT at %s %s, including scope-less and open routes",
  async (method, path) => {
    const f = fixture();
    const issued = await f.issue();
    const handler =
      path === "auth/token"
        ? f.controller.issueToken
        : path === "auth/driver/device/register"
          ? f.controller.issueDriverDeviceSession
          : undefined;
    await expect(
      f.authorize(issued.token, method, path, handler as never),
    ).rejects.toMatchObject({ code: "AUTH_SCOPE_DENIED" });
  },
);

it("can create, consume and revoke its driver's invitation; cannot affect another driver", async () => {
  const f = fixture();
  const issued = await f.issue();
  const identity = f.auth.toRequestIdentity(
    (await f.auth.verifyAccessToken(issued.token))!,
  );
  await expect(
    f.controller.issueDriverDeviceInvitation(
      { driverId: "drv-demo-001" },
      undefined,
      undefined,
      identity,
    ),
  ).rejects.toMatchObject({ code: "WORKLOAD_DRIVER_TARGET_DENIED" });
  await expect(
    f.controller.issueDriverDeviceInvitation(
      { driverId, registrationCode: "chosen-code" },
      undefined,
      undefined,
      identity,
    ),
  ).rejects.toMatchObject({ code: "WORKLOAD_DRIVER_TARGET_DENIED" });
  const invite = await f.controller.issueDriverDeviceInvitation(
    { driverId },
    undefined,
    undefined,
    identity,
  );
  const registrationCode = invite.data.registrationCode;
  const driver = await f.devices.register({
    registrationCode,
    deviceId: "test-device",
  });
  expect(await f.auth.verifyAccessToken(driver.accessToken)).not.toBeNull();
  const foreign = await f.devices.issueRegistrationInvitation({
    driverId: "drv-demo-001",
  });
  await expect(
    f.controller.revokeDriverDeviceInvitation(
      { registrationCode: foreign.registrationCode },
      undefined,
      undefined,
      identity,
    ),
  ).rejects.toMatchObject({ code: "WORKLOAD_DRIVER_TARGET_DENIED" });
  const revoked = await f.controller.revokeDriverDeviceInvitation(
    { registrationCode },
    undefined,
    undefined,
    identity,
  );
  expect(revoked.data.revoked).toBe(true);
  expect(await f.auth.verifyAccessToken(driver.accessToken)).toBeNull();
  // A denied cross-driver revoke left the foreign invitation usable.
  expect(
    (
      await f.devices.register({
        registrationCode: foreign.registrationCode,
        deviceId: "foreign-device",
      })
    ).accessToken,
  ).toBeTruthy();
});

it("accepts the exact operator JSON with the real adapter and session service", async () => {
  const doc = readFileSync(
    "docs/02-architecture/internal-key-exceptions.md",
    "utf8",
  );
  const blocks = [...doc.matchAll(/```json\n([\s\S]*?)```/g)];
  const entry = blocks
    .map((match) => {
      try {
        return JSON.parse(match[1]!);
      } catch {
        return null;
      }
    })
    .find((value) => value?.principalId === principalId);
  expect(entry).toBeDefined();
  vi.stubEnv(
    "WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS",
    JSON.stringify([entry]),
  );
  const f = fixture();
  const issued = await f.issue(
    {},
    token({
      email: entry.serviceAccountEmail,
      aud: entry.allowedTokenAudiences[1],
    }),
  );
  expect((await f.auth.verifyAccessToken(issued.token))?.scopes).toEqual([
    "driver:provision",
  ]);
});

it("cannot reuse an unrestricted caller's idempotency result for another driver's revoke", async () => {
  const f = fixture();
  const issued = await f.issue();
  const identity = f.auth.toRequestIdentity(
    (await f.auth.verifyAccessToken(issued.token))!,
  );
  const foreign = await f.devices.issueRegistrationInvitation({
    driverId: "drv-demo-001",
  });
  const command = { registrationCode: foreign.registrationCode };
  await f.controller.revokeDriverDeviceInvitation(command, "shared-key");
  await expect(
    f.controller.revokeDriverDeviceInvitation(
      command,
      "shared-key",
      undefined,
      identity,
    ),
  ).rejects.toMatchObject({ code: "WORKLOAD_DRIVER_TARGET_DENIED" });
});
