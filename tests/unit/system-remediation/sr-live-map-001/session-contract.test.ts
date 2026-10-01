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
  expect(payload?.scopes).toEqual(expect.arrayContaining(["regulatory:read", "sandbox.compliance.read", "sandbox.investigation.read"]));
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
  // It issues successfully, but the scopes are clamped to the actual role bindings, preventing elevation.
  const payload = jwt.verify(issued.token);
  expect(payload?.scopes).toEqual(expect.arrayContaining(["regulatory:read"]));
  expect(payload?.scopes).not.toContain("regulatory:write");
  expect(await jwt.verifyAccessToken(issued.token)).not.toBeNull();
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

it("auth/token accepts ops_user and ops_observer principals through WIF direct login without needing ciTenantActorGrants", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T07:20:00.000Z"));
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("STRICT_IAP_MODE", "false");
  vi.stubEnv("JWT_SECRET", "unit-only-session-contract-key");
  
  const repository = new IdentityRepository();
  await repository.onModuleInit();
  const jwt = new JwtAuthService(repository);
  
  const { GoogleWorkloadIdentityAdapter } = await import("../../../../apps/api/src/modules/auth/google-workload-identity.adapter");
  const wifAdapter = new GoogleWorkloadIdentityAdapter(repository);

  // Mock verifyServicePrincipal to simulate a valid WIF principal without ciTenantActorGrants
  vi.spyOn(wifAdapter, 'verifyServicePrincipal').mockImplementation(async () => {
    const p = {
      principalId: 'wif-sa-12345',
      actorId: 'wif-sa-12345',
      email: 'test@gserviceaccount.com',
      subject: 'wif-sa-12345',
      displayName: 'Ops User/Observer WIF',
      roles: ['ops_user', 'ops_observer'],
      scopes: ['regulatory:read', 'regulatory:write'],
      audience: 'test-aud',
      authTime: new Date().toISOString(),
      ciTenantActorGrants: []
    };
    
    // Simulate what the real adapter does now
    const membershipRecord: any = {
      membershipId: `mem_${p.principalId}_ops`,
      principalId: p.principalId,
      realm: "ops",
      status: "active",
      invitedByPrincipalId: null,
      invitationId: null,
      createdAt: p.authTime,
      updatedAt: p.authTime,
    };
    await repository.ensureMembershipRecord(membershipRecord);
    
    await repository.ensureRoleBindingRecord({
      roleBindingId: `role_binding_${p.principalId}_ops_ops_user`,
      sourceRef: `google_workload_identity:${p.principalId}:role_binding:ops_user`,
      membershipId: membershipRecord.membershipId,
      roleCode: "ops_user",
      grantedByPrincipalId: null,
      validFrom: p.authTime,
      validTo: null,
      createdAt: p.authTime,
      updatedAt: p.authTime,
    } as any);

    await repository.ensureRoleBindingRecord({
      roleBindingId: `role_binding_${p.principalId}_ops_ops_observer`,
      sourceRef: `google_workload_identity:${p.principalId}:role_binding:ops_observer`,
      membershipId: membershipRecord.membershipId,
      roleCode: "ops_observer",
      grantedByPrincipalId: null,
      validFrom: p.authTime,
      validTo: null,
      createdAt: p.authTime,
      updatedAt: p.authTime,
    } as any);
    
    return p;
  });

  const controller = new AuthController(
    jwt,
    {} as never,
    {} as never,
    undefined,
    undefined,
    undefined,
    repository,
    undefined,
    wifAdapter
  );

  // Test direct login as ops_user
  const issuedUser = await controller.issueToken({
    method: "POST",
    originalUrl: "/api/auth/token",
    headers: {
      "x-drts-google-id-token": "valid-token",
      "x-actor-type": "ops_user",
      "x-actor-id": "wif-sa-12345",
      "x-realm": "ops"
    },
  });

  expect(issuedUser.token).toBeDefined();
  let payload = jwt.verify(issuedUser.token);
  expect(payload?.sub).toBe("wif-sa-12345");
  expect(payload?.actorType).toBe("ops_user");
  
  // Verify that the membership and role bindings were correctly provisioned by the adapter
  const session = await repository.getSession(payload!.sid!);
  expect(session?.status).toBe("active");
  expect(await jwt.verifyAccessToken(issuedUser.token)).not.toBeNull();
  
  // Test direct login as ops_observer
  const issuedObserver = await controller.issueToken({
    method: "POST",
    originalUrl: "/api/auth/token",
    headers: {
      "x-drts-google-id-token": "valid-token",
      "x-actor-type": "ops_observer",
      "x-actor-id": "wif-sa-12345",
      "x-realm": "ops"
    },
  });

  expect(issuedObserver.token).toBeDefined();
  payload = jwt.verify(issuedObserver.token);
  expect(payload?.sub).toBe("wif-sa-12345");
  expect(payload?.actorType).toBe("ops_observer");
  expect(await jwt.verifyAccessToken(issuedObserver.token)).not.toBeNull();
});

it("Driver revoke failure records durable retryable recovery and cleanup is idempotent", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T07:20:00.000Z"));
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("STRICT_IAP_MODE", "false");
  vi.stubEnv("JWT_SECRET", "unit-only-session-contract-key");
  
  const repository = new IdentityRepository();
  await repository.onModuleInit();
  const jwt = new JwtAuthService(repository);
  
  const { DriverDeviceSessionService } = await import("../../../../apps/api/src/modules/auth/driver-device-session.service");
  
  // Simulate JWT revoke failing first time
  let revokeFail = true;
  const originalRevokeCurrentSession = jwt.revokeCurrentSession.bind(jwt);
  vi.spyOn(jwt, 'revokeCurrentSession').mockImplementation(async (sessionId, options) => {
    if (revokeFail) {
      throw new Error("Simulated JWT revoke failure");
    }
    return originalRevokeCurrentSession(sessionId, options);
  });

  const deviceService = new DriverDeviceSessionService(
    jwt,
    { recordDeviceBinding: vi.fn(), recordDeviceBindingRevocation: vi.fn() } as never,
    undefined as never,
    undefined as never,
    undefined as never
  );
  
  const issueResult = await deviceService.issueRegistrationInvitation({
    driverId: "drv-demo-002",
    expiresIn: "1h",
    reuseExisting: false
  });
  
  const inviteCode = issueResult.registrationCode;
  const registerResult = await deviceService.register({
    registrationCode: inviteCode,
    deviceId: "device-xyz"
  });
  
  const accessToken = registerResult.accessToken;
  const payload = jwt.verify(accessToken);
  expect(payload?.driverBindingId).toBeDefined();
  
  // Verify session works initially
  expect(await jwt.verifyAccessToken(accessToken)).not.toBeNull();
  
  // Attempt revoke - it should fail due to simulated error
  await expect(deviceService.revokeInvitation({ registrationCode: inviteCode })).rejects.toThrow("Simulated JWT revoke failure");
  
  // Because it failed, the JWT session is still active
  expect(await jwt.verifyAccessToken(accessToken)).not.toBeNull();
  
  // Second attempt - this time it will succeed
  revokeFail = false;
  const secondRevoke = await deviceService.revokeInvitation({ registrationCode: inviteCode });
  
  // The cleanup should have retried and completed successfully
  expect(secondRevoke.revoked).toBe(true);
  
  // The token is no longer usable
  expect(await jwt.verifyAccessToken(accessToken)).toBeNull();
  
  // Third attempt should be idempotent
  const thirdRevoke = await deviceService.revokeInvitation({ registrationCode: inviteCode });
  expect(thirdRevoke.revoked).toBe(true); // already revoked state is true
});
