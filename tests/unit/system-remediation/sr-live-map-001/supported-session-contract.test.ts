import { generateKeyPairSync } from "node:crypto";
import * as jwt from "jsonwebtoken";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resolveRouteAuthPolicy } from "../../../../apps/api/src/common/auth/auth.policy";
import { JwtAuthService } from "../../../../apps/api/src/common/auth/jwt-auth.service";
import { IdempotencyRepository } from "../../../../apps/api/src/common/idempotency/idempotency.repository";
import { IdempotencyService } from "../../../../apps/api/src/common/idempotency/idempotency.service";
import { OpsDispatchEventsService } from "../../../../apps/api/src/common/ops-dispatch-events.service";
import { deepToSnakeCase } from "../../../../apps/api/src/common/snake-case.interceptor";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { AuthController } from "../../../../apps/api/src/modules/auth/auth.controller";
import { DriverDeviceSessionRepository } from "../../../../apps/api/src/modules/auth/driver-device-session.repository";
import { DriverDeviceSessionService } from "../../../../apps/api/src/modules/auth/driver-device-session.service";
import { GoogleWorkloadIdentityAdapter } from "../../../../apps/api/src/modules/auth/google-workload-identity.adapter";
import { DriverProfileService } from "../../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { IdentityRepository } from "../../../../apps/api/src/modules/identity/identity.repository";
import { RegulatoryRegistryService } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { bootstrapMapSessions } from "../../../e2e/system-remediation/sr-live-map-001/session-bootstrap";

// One disposable issuer per file, matching the production adapter's JWKS cache.
const googleIssuer = generateKeyPairSync("rsa", { modulusLength: 2048 });

// Product contract probes, not live evidence. Real controllers, services and
// memory repository adapters; no binding/membership injection or verifier mocks.
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("STRICT_IAP_MODE", "false");
  vi.stubEnv("JWT_SECRET", "unit-only-supported-session-contract");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function driverFixture() {
  const audit = new AuditNotificationService();
  const profiles = new DriverProfileService(audit);
  const emit = vi.fn();
  const registry = new RegulatoryRegistryService(
    new OpsDispatchEventsService({ emit } as never),
    audit,
    profiles,
  );
  const identities = new IdentityRepository();
  const tokens = new JwtAuthService(identities, undefined, registry);
  const repository = new DriverDeviceSessionRepository();
  const devices = new DriverDeviceSessionService(
    tokens,
    profiles,
    repository,
    registry,
  );
  const controller = new AuthController(
    tokens,
    {} as never,
    devices,
    undefined,
    undefined,
    undefined,
    identities,
    undefined,
    undefined,
    new IdempotencyService(new IdempotencyRepository()),
  );
  return {
    controller,
    devices,
    tokens,
    identities,
    repository,
    profiles,
    emit,
  };
}

it("registers the untouched offline profile, refreshes and revokes the actual device session", async () => {
  const f = driverFixture();
  expect(f.profiles.resolveProvisionableDriverId("drv-demo-002")).toBe(
    "drv-demo-002",
  );
  const { data: registered } = await f.controller.issueDriverDeviceSession({
    registrationCode: "drv-demo-002",
    deviceId: "unit-c114-first-device",
  });
  expect(registered.expiresIn).toBe("15m");
  const initial = await f.tokens.verifyAccessToken(registered.accessToken);
  expect(initial).toMatchObject({
    sub: "drv-demo-002",
    realm: "driver",
    sid: registered.bindingId,
    driverBindingId: registered.bindingId,
    driverDeviceId: registered.deviceId,
    scopes: ["driver:read", "driver:write", "dispatch:read"],
  });
  expect(
    f.controller.getAuthSession(f.tokens.toRequestIdentity(initial!)).data,
  ).toMatchObject({ active: true, identity: { actorId: "drv-demo-002" } });

  const { data: refreshed } = await f.controller.refreshDriverDeviceSession({
    deviceId: registered.deviceId,
    refreshToken: registered.refreshToken,
  });
  expect(refreshed.bindingId).toBe(registered.bindingId);
  expect(refreshed.refreshToken).not.toBe(registered.refreshToken);
  expect(await f.tokens.verifyAccessToken(registered.accessToken)).toBeNull();
  const current = await f.tokens.verifyAccessToken(refreshed.accessToken);
  expect(current).not.toBeNull();

  await f.controller.revokeDriverDeviceSession(
    f.tokens.toRequestIdentity(current!),
    { bindingId: refreshed.bindingId, deviceId: refreshed.deviceId },
  );
  expect(await f.tokens.verifyAccessToken(refreshed.accessToken)).toBeNull();
  expect(await f.repository.findBindingById(refreshed.bindingId)).toMatchObject(
    {
      status: "revoked",
    },
  );
  expect(await f.identities.getSession(refreshed.bindingId)).toMatchObject({
    status: "revoked",
  });
  await expect(
    f.controller.refreshDriverDeviceSession({
      deviceId: refreshed.deviceId,
      refreshToken: refreshed.refreshToken,
    }),
  ).rejects.toMatchObject({ code: "DRIVER_DEVICE_REFRESH_INVALID" });
  expect(f.emit).not.toHaveBeenCalled();
});

it("cannot reuse the profile registration code after cleanup, even on a new device", async () => {
  const f = driverFixture();
  const { data: registered } = await f.controller.issueDriverDeviceSession({
    registrationCode: "drv-demo-002",
    deviceId: "unit-c114-run-one",
  });
  const verified = await f.tokens.verifyAccessToken(registered.accessToken);
  await f.controller.revokeDriverDeviceSession(
    f.tokens.toRequestIdentity(verified!),
    { bindingId: registered.bindingId, deviceId: registered.deviceId },
  );
  await expect(
    f.controller.issueDriverDeviceSession({
      registrationCode: "drv-demo-002",
      deviceId: "unit-c114-run-two",
    }),
  ).rejects.toMatchObject({ code: "DRIVER_REGISTRATION_INVALID" });
  // Changing a device ID or inventing a code cannot replenish the invitation.
  await expect(
    f.controller.issueDriverDeviceSession({
      registrationCode: "unit-c114-unissued-invitation",
      deviceId: "unit-c114-run-two",
    }),
  ).rejects.toMatchObject({ code: "DRIVER_REGISTRATION_INVALID" });
  expect(f.emit).not.toHaveBeenCalled();
});

it("rejects refresh from another device and revocation by another real driver", async () => {
  const f = driverFixture();
  const { data: own } = await f.controller.issueDriverDeviceSession({
    registrationCode: "drv-demo-002",
    deviceId: "unit-c114-owned",
  });
  const { data: other } = await f.controller.issueDriverDeviceSession({
    registrationCode: "drv-demo-001",
    deviceId: "unit-c114-other",
  });
  await expect(
    f.controller.refreshDriverDeviceSession({
      refreshToken: own.refreshToken,
      deviceId: other.deviceId,
    }),
  ).rejects.toMatchObject({ code: "DRIVER_DEVICE_REFRESH_INVALID" });
  const otherIdentity = f.tokens.toRequestIdentity(
    (await f.tokens.verifyAccessToken(other.accessToken))!,
  );
  await expect(
    f.controller.revokeDriverDeviceSession(otherIdentity, {
      bindingId: own.bindingId,
      deviceId: own.deviceId,
    }),
  ).rejects.toMatchObject({ code: "DRIVER_DEVICE_BINDING_FORBIDDEN" });
  expect(await f.tokens.verifyAccessToken(own.accessToken)).not.toBeNull();
  for (const session of [own, other]) {
    const identity = f.tokens.toRequestIdentity(
      (await f.tokens.verifyAccessToken(session.accessToken))!,
    );
    await f.controller.revokeDriverDeviceSession(identity, {
      bindingId: session.bindingId,
      deviceId: session.deviceId,
    });
    expect(await f.tokens.verifyAccessToken(session.accessToken)).toBeNull();
  }
});

it.each(["ops_user", "ops_observer"])(
  "does not turn a registered Google WIF principal into an %s observer session",
  async (actorType) => {
    // Only Google's JWKS/network boundary is replaced. A disposable signing key
    // models the external issuer in memory; no real token or secret is written.
    const { publicKey, privateKey } = googleIssuer;
    const jwk = publicKey.export({ format: "jwk" });
    const email = "unit-map-observer@example.iam.gserviceaccount.com";
    const audience = "https://api.example.test";
    vi.stubEnv("WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED", "true");
    vi.stubEnv(
      "WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS",
      JSON.stringify([
        {
          serviceAccountEmail: email,
          principalId: "unit-map-observer",
          actorId: "live-map-observer",
          scopes: ["regulatory:read"],
          allowedTokenAudiences: [audience],
          routeScopes: ["POST auth/token"],
          ciTenantActorGrants: [],
        },
      ]),
    );
    const fetch = vi.fn(async (url: string) => {
      expect(url).toBe("https://www.googleapis.com/oauth2/v3/certs");
      return Response.json({ keys: [{ ...jwk, kid: "unit-c114-key" }] });
    });
    vi.stubGlobal("fetch", fetch);
    const assertion = jwt.sign(
      {
        iss: "https://accounts.google.com",
        sub: "unit-c114-google-subject",
        aud: audience,
        email,
        email_verified: true,
      },
      privateKey,
      { algorithm: "RS256", keyid: "unit-c114-key", expiresIn: "5m" },
    );
    const identities = new IdentityRepository();
    const controller = new AuthController(
      new JwtAuthService(identities),
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      identities,
      undefined,
      new GoogleWorkloadIdentityAdapter(identities),
    );
    await expect(
      controller.issueToken({
        method: "POST",
        originalUrl: "/api/auth/token",
        headers: {
          "x-drts-google-id-token": assertion,
          "x-actor-type": actorType,
          "x-actor-id": "live-map-observer",
          "x-realm": "ops",
        },
      }),
    ).rejects.toMatchObject({ code: "WORKLOAD_CI_TENANT_ACTOR_DENIED" });
    // The principal was cryptographically verified and persisted; denial is the
    // missing observer issuance contract, not a malformed fixture or bad key.
    expect(
      await identities.findPrincipalBySubject(
        "https://accounts.google.com",
        "unit-c114-google-subject",
      ),
    ).toMatchObject({ principalId: "unit-map-observer", status: "active" });
    // A later case can reuse the adapter's cached JWKS. Persisted principal
    // evidence above proves verification ran regardless of cache hits.
    expect(fetch.mock.calls.length).toBeLessThanOrEqual(1);
    const policy = resolveRouteAuthPolicy(
      "GET",
      "/api/regulatory-registry/drivers",
    );
    expect(policy?.allowedRealms).toEqual(["system", "platform", "ops"]);
    expect(policy?.requiredScopes).toEqual(["regulatory:read"]);
  },
);

it("reproduces bootstrap failure on the real driver registration wire shape and incomplete invite cleanup", async () => {
  const f = driverFixture();
  const sha = "a".repeat(40);
  const env = {
    GITHUB_ACTIONS: "true",
    RUNNER_ENVIRONMENT: "github-hosted",
    DRTS_CANDIDATE_SHA: sha,
    WORKFLOW_SHA: sha,
    DRTS_LIVE_MAP_TEST_AUTHORIZED: "true",
    DRTS_LIVE_MAP_TEST_ORIGIN: "https://ops.example.test",
    DRTS_LIVE_MAP_API_ORIGIN: "https://api.example.test",
    DRTS_LIVE_MAP_ALLOWED_TARGETS:
      "https://ops.example.test,https://api.example.test,https://maps.googleapis.com",
    DRTS_LIVE_MAP_TEST_DRIVER_ID: "drv-demo-002",
  };
  let registered: Awaited<ReturnType<typeof f.devices.register>> | undefined;
  let revoked: { revoked: boolean } | undefined;
  const save = vi.fn();
  const exportSession = vi.fn();
  const mask = vi.fn((value: string) => {
    // Matches the workflow mask boundary: a missing token is not maskable.
    value.replace(/%/g, "%25");
  });
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    expect(init?.redirect).toBe("error");
    const url = new URL(String(input));
    expect(url.origin).toBe(env.DRTS_LIVE_MAP_API_ORIGIN);
    const headers = new Headers(init?.headers);
    const reply = (value: unknown) =>
      Response.json(deepToSnakeCase(value), {
        headers: { "x-drts-candidate-sha": sha },
      });
    // Health and observer/provisioner auth are deliberate boundary stubs so
    // this probe can reach the independent driver wire/cleanup defect. They
    // are NOT evidence that Google WIF or provisioner authorization succeeds.
    if (url.pathname === "/api/health")
      return reply({
        candidateSha: sha,
        mapProvider: { effectiveBackend: "google" },
      });
    if (url.pathname === "/api/auth/token")
      return reply({ token: "unit-boundary-token", expiresIn: "15m" });
    if (url.pathname === "/api/auth/session") {
      expect(headers.get("authorization")).toBe("Bearer unit-boundary-token");
      return reply({
        data: {
          active: true,
          identity: {
            realm: "ops",
            actorType: "ops_observer",
            actorId: "live-map-observer",
            scopes: ["regulatory:read"],
          },
        },
      });
    }
    const command = JSON.parse(String(init?.body));
    if (url.pathname === "/api/auth/driver/device/invite") {
      // Real invitation issuer, real idempotency service, no invented code.
      return reply(
        await f.controller.issueDriverDeviceInvitation(command, undefined),
      );
    }
    if (url.pathname === "/api/auth/driver/device/register") {
      const result = await f.controller.issueDriverDeviceSession(command);
      registered = result.data;
      return reply(result);
    }
    if (url.pathname === "/api/auth/driver/device/invite/revoke") {
      const result = await f.controller.revokeDriverDeviceInvitation(
        command,
        undefined,
      );
      revoked = result.data;
      return reply(result);
    }
    throw new Error("Unexpected contract probe route");
  });

  await expect(
    bootstrapMapSessions(env, {
      fetch,
      readGoogleIdToken: () => "unit-google-boundary",
      readInternalKey: () => "unit-internal-boundary",
      mask,
      exportSession,
      save,
    }),
  ).rejects.toThrow("Map session bootstrap failed at driver:register-device");
  expect(registered).toBeDefined();
  expect(typeof registered!.accessToken).toBe("string");
  expect(registered!.expiresIn).toBe("15m");
  expect(registered!.identity.scopes).toEqual([
    "driver:read",
    "driver:write",
    "dispatch:read",
  ]);
  // The real service has already consumed the invite; revoking the invite
  // cannot undo its active binding/access token/30-day refresh family.
  expect(revoked).toEqual({ revoked: false });
  const active = await f.tokens.verifyAccessToken(registered!.accessToken);
  expect(active).not.toBeNull();
  expect(
    await f.repository.findBindingById(registered!.bindingId),
  ).toMatchObject({ status: "active" });
  expect(exportSession).not.toHaveBeenCalled();
  expect(JSON.stringify(save.mock.calls)).not.toContain(
    registered!.accessToken,
  );
  // Unit fixture cleanup uses the supported bound-driver revoke API. No live
  // account is touched, and no persistent token is stored in this repository.
  await f.controller.revokeDriverDeviceSession(
    f.tokens.toRequestIdentity(active!),
    {
      bindingId: registered!.bindingId,
      deviceId: registered!.deviceId,
    },
  );
  expect(await f.tokens.verifyAccessToken(registered!.accessToken)).toBeNull();
  expect(f.emit).not.toHaveBeenCalled();
});
